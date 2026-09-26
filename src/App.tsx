import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, watchImmediate, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { callCommand } from "@milkdown/utils";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInHeadingCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
} from "@milkdown/preset-commonmark";
import { editorViewCtx, type Editor } from "@milkdown/core";
import type { EditorView } from "@milkdown/prose/view";
import { MarkyEditor, type EditorGetter } from "./Editor";
import { FindReplace } from "./FindReplace";
import { FrontmatterPanel } from "./FrontmatterPanel";
import { splitFrontmatter, joinFrontmatter } from "./frontmatter";
import { pickStartupFile } from "./startup";
import { classifyLink, isOpenableFile } from "./links";
import { NavHistory } from "./navHistory";
import { scrollToFragment } from "./linkFollowPlugin";
import {
  clearSearch,
  getSearchState,
  nextMatch,
  prevMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
} from "./searchPlugin";
import "./App.css";

const RECENTS_KEY = "marky.recents";
const LAST_FILE_KEY = "marky.lastFile";
const REOPEN_LAST_KEY = "marky.reopenLast";
const THEME_KEY = "marky.theme";
const ZOOM_KEY = "marky.zoom";
const RECENTS_MAX = 10;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

type Theme = "system" | "light" | "dark";

function loadReopenLast(): boolean {
  return localStorage.getItem(REOPEN_LAST_KEY) !== "false";
}

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function loadZoom(): number {
  const v = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 1;
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: string[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function App() {
  const [body, setBody] = useState("");
  const [frontmatter, setFrontmatter] = useState<string | null>(null);
  const [closeDelim, setCloseDelim] = useState<"---" | "...">("---");
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [zoom, setZoom] = useState<number>(loadZoom);
  const [reopenLast, setReopenLast] = useState<boolean>(loadReopenLast);
  const pendingFile = useRef<Promise<string | null> | null>(null);

  const historyRef = useRef(new NavHistory());
  const [historyFlags, setHistoryFlags] = useState({ canBack: false, canForward: false, length: 0 });
  const scrollRef = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  const pendingRestore = useRef<{ scrollTop: number; fragment?: string } | null>(null);
  const refreshHistory = useCallback(() => {
    const h = historyRef.current;
    setHistoryFlags({ canBack: h.canBack, canForward: h.canForward, length: h.length });
  }, []);
  const recordScroll = useCallback(() => {
    historyRef.current.updateCurrent({ scrollTop: scrollRef.current?.scrollTop ?? 0 });
  }, []);

  // Find / Replace bar
  const [findOpen, setFindOpen] = useState(false);
  const [findMode, setFindMode] = useState<"find" | "replace">("find");
  const [findQuery, setFindQuery] = useState("");
  const [findReplacement, setFindReplacement] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [matchInfo, setMatchInfo] = useState({ current: -1, total: 0 });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--marky-zoom", String(zoom));
    localStorage.setItem(ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem(REOPEN_LAST_KEY, String(reopenLast));
  }, [reopenLast]);

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  const checkForUpdates = useCallback(async (manual: boolean) => {
    try {
      const update = await check();
      if (!update) {
        if (manual) {
          await message("You're running the latest version of Marky.", {
            title: "No Updates Available",
          });
        }
        return;
      }
      const ok = await ask(
        `Marky ${update.version} is available — you have ${update.currentVersion}.\n\nDownload and install it now? Marky will restart to finish.`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Install & Restart",
          cancelLabel: "Later",
        },
      );
      if (!ok) return;
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      if (manual) {
        await message(`Could not check for updates: ${e}`, {
          title: "Update Error",
          kind: "error",
        });
      } else {
        console.error("Update check failed:", e);
      }
    }
  }, []);

  // Silent update check shortly after launch.
  useEffect(() => {
    const t = setTimeout(() => {
      checkForUpdates(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [checkForUpdates]);

  // Stash latest values in refs so the menu's static action callbacks see fresh state.
  const stateRef = useRef({ body, frontmatter, closeDelim, path, dirty, recents });
  stateRef.current = { body, frontmatter, closeDelim, path, dirty, recents };

  const getEditorRef = useRef<EditorGetter | null>(null);
  const onEditorReady = useCallback((g: EditorGetter) => {
    getEditorRef.current = g;
    const restore = pendingRestore.current;
    if (!restore) return;
    // Let the remounted editor focus and the browser lay out its content first.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (pendingRestore.current !== restore || getEditorRef.current !== g) return;
      pendingRestore.current = null;
      const ed = g();
      if (!ed) return;
      if (scrollRef.current) scrollRef.current.scrollTop = restore.scrollTop;
      const fragment = restore.fragment;
      if (fragment) {
        ed.action((ctx) => scrollToFragment(ctx.get(editorViewCtx), fragment));
      }
    }));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmd = useCallback((command: any, payload?: any) => {
    const ed = getEditorRef.current?.() as Editor | undefined;
    if (!ed) return;
    ed.action(callCommand(command.key, payload));
  }, []);

  // Run a function against the live ProseMirror view (for find/replace).
  const withView = useCallback((fn: (view: EditorView) => void) => {
    const ed = getEditorRef.current?.() as Editor | undefined;
    if (!ed) return;
    ed.action((ctx) => fn(ctx.get(editorViewCtx)));
  }, []);

  const refreshMatchInfo = useCallback((view: EditorView) => {
    const s = getSearchState(view);
    setMatchInfo({ current: s.current, total: s.matches.length });
  }, []);

  const runSearch = useCallback(
    (query: string, caseSensitive: boolean) => {
      withView((view) => {
        setSearch(view, query, caseSensitive);
        refreshMatchInfo(view);
      });
    },
    [withView, refreshMatchInfo],
  );

  const handleQueryChange = useCallback(
    (q: string) => {
      setFindQuery(q);
      runSearch(q, findCaseSensitive);
    },
    [runSearch, findCaseSensitive],
  );

  const handleToggleCase = useCallback(() => {
    setFindCaseSensitive((prev) => {
      const next = !prev;
      runSearch(findQuery, next);
      return next;
    });
  }, [runSearch, findQuery]);

  const findNext = useCallback(() => {
    withView((view) => {
      nextMatch(view);
      refreshMatchInfo(view);
    });
  }, [withView, refreshMatchInfo]);

  const findPrev = useCallback(() => {
    withView((view) => {
      prevMatch(view);
      refreshMatchInfo(view);
    });
  }, [withView, refreshMatchInfo]);

  const doReplace = useCallback(() => {
    withView((view) => {
      replaceCurrent(view, findReplacement);
      refreshMatchInfo(view);
    });
  }, [withView, refreshMatchInfo, findReplacement]);

  const doReplaceAll = useCallback(() => {
    withView((view) => {
      replaceAll(view, findReplacement);
      refreshMatchInfo(view);
    });
  }, [withView, refreshMatchInfo, findReplacement]);

  const openFind = useCallback(
    (mode: "find" | "replace") => {
      setFindMode(mode);
      setFindOpen(true);
      withView((view) => {
        // Seed the query from a single-line selection, if any.
        const { from, to } = view.state.selection;
        let query = findQuery;
        if (to > from) {
          const sel = view.state.doc.textBetween(from, to);
          if (sel && !sel.includes("\n")) {
            query = sel;
            setFindQuery(sel);
          }
        }
        setSearch(view, query, findCaseSensitive);
        refreshMatchInfo(view);
      });
    },
    [withView, refreshMatchInfo, findQuery, findCaseSensitive],
  );

  const closeFind = useCallback(() => {
    withView((view) => {
      clearSearch(view);
      view.focus();
    });
    setFindOpen(false);
  }, [withView]);

  const handleFind = useCallback(() => openFind("find"), [openFind]);
  const handleReplace = useCallback(() => openFind("replace"), [openFind]);

  const confirmDiscard = useCallback(async () => {
    if (!stateRef.current.dirty) return true;
    return await ask("You have unsaved changes. Discard them?", {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    });
  }, []);

  const pushRecent = useCallback((p: string) => {
    setRecents((prev) => {
      const next = [p, ...prev.filter((x) => x !== p)].slice(0, RECENTS_MAX);
      saveRecents(next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    saveRecents([]);
  }, []);

  const loadPath = useCallback(
    async (target: string, restore: { scrollTop: number; fragment?: string }) => {
      const text = await readTextFile(target);
      pendingRestore.current = restore;
      const split = splitFrontmatter(text);
      setFrontmatter(split.fm);
      setBody(split.body);
      setCloseDelim(split.closeDelim);
      setPath(target);
      setDirty(false);
      setEditorKey((k) => k + 1);
      pushRecent(target);
      localStorage.setItem(LAST_FILE_KEY, target);
    },
    [pushRecent],
  );

  // All file-opening entry points go through here; history traversal uses loadPath directly.
  // Only link follows extend history; any other open starts a fresh history at that document.
  const navigateTo = useCallback(async (target: string, fragment?: string, viaLink = false) => {
    if (navigating.current || pendingRestore.current) return;
    navigating.current = true;
    try {
      if (!(await confirmDiscard())) return;
      recordScroll();
      await loadPath(target, { scrollTop: 0, fragment });
      if (!viaLink) historyRef.current.clear();
      historyRef.current.push({ path: target, scrollTop: 0 });
      refreshHistory();
    } catch (err) {
      console.error("Couldn't open document:", err);
    } finally {
      navigating.current = false;
    }
  }, [confirmDiscard, recordScroll, loadPath, refreshHistory]);

  const travelHistory = useCallback(async (direction: "back" | "forward") => {
    if (navigating.current || pendingRestore.current) return;
    navigating.current = true;
    try {
      if (!(await confirmDiscard())) return;
      recordScroll();
      // Traverse a copy so cancellation/read failures never move the live cursor.
      const candidate = historyRef.current.clone();
      const missing = new Set<string>();
      let target = candidate[direction]();
      while (target) {
        if (!missing.has(target.path) && await exists(target.path)) {
          await loadPath(target.path, { scrollTop: target.scrollTop });
          for (const path of missing) candidate.remove(path);
          historyRef.current = candidate;
          return;
        }
        missing.add(target.path);
        historyRef.current.remove(target.path);
        target = candidate[direction]();
      }
    } catch (err) {
      console.error("Couldn't navigate history:", err);
    } finally {
      refreshHistory();
      navigating.current = false;
    }
  }, [confirmDiscard, recordScroll, loadPath, refreshHistory]);

  const handleBack = useCallback(() => travelHistory("back"), [travelHistory]);
  const handleForward = useCallback(() => travelHistory("forward"), [travelHistory]);

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      void (event.button === 3 ? handleBack() : handleForward());
    };
    // Suppress the browser's own navigation without firing twice for one gesture.
    const suppressAuxClick = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("auxclick", suppressAuxClick);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("auxclick", suppressAuxClick);
    };
  }, [handleBack, handleForward]);

  // Cmd/Ctrl+click on a link that the editor didn't resolve itself (i.e. not
  // an in-doc `#anchor`, which it handles without needing App state).
  const handleFollowLink = useCallback(
    async (href: string) => {
      const target = classifyLink(href, stateRef.current.path);
      switch (target.kind) {
        case "external":
          await openUrl(target.url);
          return;
        case "file":
          if (!isOpenableFile(target.path)) {
            console.warn(`Marky: not opening unsupported file link: ${target.path}`);
            return;
          }
          if (!(await exists(target.path))) {
            await message(`Can't find ${target.path}`, {
              title: "Link not found",
              kind: "warning",
            });
            return;
          }
          try {
            await navigateTo(target.path, target.fragment, true);
          } catch (err) {
            console.error(err);
          }
          return;
        case "anchor":
        case "unsupported":
          return;
      }
    },
    [navigateTo],
  );

  const handleNew = useCallback(async () => {
    if (navigating.current || pendingRestore.current) return;
    if (!(await confirmDiscard())) return;
    recordScroll();
    historyRef.current.clear();
    refreshHistory();
    pendingRestore.current = null;
    setFrontmatter(null);
    setBody("");
    setCloseDelim("---");
    setPath(null);
    setDirty(false);
    setEditorKey((k) => k + 1);
    localStorage.removeItem(LAST_FILE_KEY);
  }, [confirmDiscard, recordScroll, refreshHistory]);

  const handleOpen = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (typeof selected === "string") await navigateTo(selected);
  }, [navigateTo]);

  const handleOpenRecent = useCallback(
    async (p: string) => {
      try {
        if (!(await exists(p))) {
          // Drop missing files from recents
          setRecents((prev) => {
            const next = prev.filter((x) => x !== p);
            saveRecents(next);
            return next;
          });
          return;
        }
        await navigateTo(p);
      } catch (err) {
        console.error(err);
      }
    },
    [navigateTo],
  );

  const recordSavedPath = useCallback((path: string) => {
    const entry = { path, scrollTop: scrollRef.current?.scrollTop ?? 0 };
    if (historyRef.current.current) historyRef.current.updateCurrent(entry);
    else historyRef.current.push(entry);
    refreshHistory();
  }, [refreshHistory]);

  const handleSave = useCallback(async () => {
    let target = stateRef.current.path;
    if (!target) {
      const chosen = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!chosen) return;
      target = chosen;
    }
    await writeTextFile(
      target,
      joinFrontmatter(
        stateRef.current.frontmatter,
        stateRef.current.body,
        stateRef.current.closeDelim,
      ),
    );
    recordSavedPath(target);
    setPath(target);
    setDirty(false);
    pushRecent(target);
    localStorage.setItem(LAST_FILE_KEY, target);
  }, [pushRecent, recordSavedPath]);

  const handleSaveAs = useCallback(async () => {
    const chosen = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: stateRef.current.path ?? undefined,
    });
    if (!chosen) return;
    await writeTextFile(
      chosen,
      joinFrontmatter(
        stateRef.current.frontmatter,
        stateRef.current.body,
        stateRef.current.closeDelim,
      ),
    );
    recordSavedPath(chosen);
    setPath(chosen);
    setDirty(false);
    pushRecent(chosen);
    localStorage.setItem(LAST_FILE_KEY, chosen);
  }, [pushRecent, recordSavedPath]);

  const handleRevert = useCallback(async () => {
    const p = stateRef.current.path;
    if (!p) return;
    if (!(await confirmDiscard())) return;
    try {
      const text = await readTextFile(p);
      const split = splitFrontmatter(text);
      setFrontmatter(split.fm);
      setBody(split.body);
      setCloseDelim(split.closeDelim);
      setDirty(false);
      setEditorKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    }
  }, [confirmDiscard]);

  const handleClose = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    recordScroll();
    historyRef.current.clear();
    refreshHistory();
    await getCurrentWindow().close();
  }, [confirmDiscard, recordScroll, refreshHistory]);

  const handleSetAsDefault = useCallback(async () => {
    try {
      await invoke<void>("set_as_default_markdown_handler");
      await message("Marky is now the default app for Markdown files.", {
        title: "Default handler set",
        kind: "info",
      });
    } catch (err) {
      await message(String(err), {
        title: "Couldn't set default handler",
        kind: "error",
      });
    }
  }, []);

  const handleReportBug = useCallback(async () => {
    const ua = navigator.userAgent;
    const version = await getVersion();
    const body = encodeURIComponent(
      `**Marky version:** ${version}\n**OS / build:** ${ua}\n\n**What happened?**\n\n\n**Steps to reproduce:**\n1. \n2. \n3. \n`,
    );
    await openUrl(
      `https://github.com/smartmemory/marky/issues/new?template=bug.yml&body=${body}`,
    );
  }, []);

  const handleSuggestFeature = useCallback(async () => {
    await openUrl(
      "https://github.com/smartmemory/marky/discussions/new?category=ideas",
    );
  }, []);

  const handleViewRepo = useCallback(async () => {
    await openUrl("https://github.com/smartmemory/marky");
  }, []);

  const handleShowInFinder = useCallback(async () => {
    const p = stateRef.current.path;
    if (!p) return;
    try {
      await revealItemInDir(p);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleInsertFrontmatter = useCallback(() => {
    if (stateRef.current.frontmatter !== null) return;
    setFrontmatter("");
    setCloseDelim("---");
    setDirty(true);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Format commands routed into the Milkdown editor instance
  const fmtBold = useCallback(() => cmd(toggleStrongCommand), [cmd]);
  const fmtItalic = useCallback(() => cmd(toggleEmphasisCommand), [cmd]);
  const fmtCode = useCallback(() => cmd(toggleInlineCodeCommand), [cmd]);
  const fmtLink = useCallback(() => cmd(toggleLinkCommand), [cmd]);
  const fmtBlockquote = useCallback(() => cmd(wrapInBlockquoteCommand), [cmd]);
  const fmtBulletList = useCallback(() => cmd(wrapInBulletListCommand), [cmd]);
  const fmtOrderedList = useCallback(() => cmd(wrapInOrderedListCommand), [cmd]);
  const fmtCodeBlock = useCallback(() => cmd(createCodeBlockCommand), [cmd]);
  const fmtHr = useCallback(() => cmd(insertHrCommand), [cmd]);
  const fmtHeading = useCallback(
    (level: number) => cmd(wrapInHeadingCommand, level),
    [cmd],
  );

  // External-change watcher: reload prompt if the open file changes on disk
  useEffect(() => {
    if (!path) return;
    let unwatch: (() => void) | null = null;
    let lastSeen = "";
    let cancelled = false;
    (async () => {
      try {
        lastSeen = await readTextFile(path);
        if (cancelled) return;
        unwatch = await watchImmediate(path, async () => {
            try {
              const fresh = await readTextFile(path);
              if (fresh === lastSeen) return;
              if (
                fresh ===
                joinFrontmatter(
                  stateRef.current.frontmatter,
                  stateRef.current.body,
                  stateRef.current.closeDelim,
                )
              ) {
                lastSeen = fresh;
                return;
              }
              const reload = await ask("File changed on disk. Reload?", {
                title: "External change",
                kind: "warning",
                okLabel: "Reload",
                cancelLabel: "Keep mine",
              });
              if (reload) {
                lastSeen = fresh;
                const split = splitFrontmatter(fresh);
                setFrontmatter(split.fm);
                setBody(split.body);
                setCloseDelim(split.closeDelim);
                setDirty(false);
                setEditorKey((k) => k + 1);
              }
            } catch {
              // file may have been deleted; ignore
            }
        });
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
      if (unwatch) unwatch();
    };
  }, [path]);

  // Initial load: OS files win; otherwise optionally reopen the last document.
  // Defer last-file filesystem access until after the initial render so macOS
  // TCC prompts do not gate the UI's startup path.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      // The command consumes the path; share it across StrictMode effect replays.
      pendingFile.current ??= invoke<string | null>("take_pending_file").catch(() => null);
      const pending = await pendingFile.current;
      if (cancelled) return;
      const selected = pickStartupFile(pending, loadReopenLast(), localStorage.getItem(LAST_FILE_KEY));
      if (!selected) return;
      if (selected.source === "pending") {
        await navigateTo(selected.path);
        return;
      }
      timer = setTimeout(() => {
        (async () => {
          if (cancelled) return;
          const present = await exists(selected.path);
          if (cancelled) return;
          if (present) {
            await navigateTo(selected.path);
          } else {
            localStorage.removeItem(LAST_FILE_KEY);
          }
        })().catch(console.error);
      }, 0);
    })().catch(console.error);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigateTo]);

  // OS open-file events while running
  useEffect(() => {
    const unlisten = listen<string>("open-file", async (e) => {
      if (!e.payload) return;
      await navigateTo(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigateTo]);

  // Drag-drop file onto the window
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths;
      if (!paths.length) return;
      await navigateTo(paths[0]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigateTo]);

  // Keep window title + edited indicator in sync
  useEffect(() => {
    const win = getCurrentWindow();
    const name = path ? basename(path) : "Untitled";
    document.title = name.replace(/\.mdx?$/i, "");
    win.setTitle(`${name}${dirty ? " — Edited" : ""} — Marky`).catch(() => {});
  }, [path, dirty]);

  const hasFrontmatter = frontmatter !== null;

  // Build native menu. Rebuilds when recents or handlers change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const appVersion = await getVersion();
      const recentItems = await Promise.all(
        recents.map((p, i) =>
          MenuItem.new({
            id: `recent-${i}`,
            text: basename(p),
            action: () => handleOpenRecent(p),
          }),
        ),
      );
      const recentTail: (MenuItem | PredefinedMenuItem)[] = [];
      if (recents.length > 0) {
        recentTail.push(await PredefinedMenuItem.new({ item: "Separator" }));
        recentTail.push(
          await MenuItem.new({
            id: "clear-recents",
            text: "Clear Menu",
            action: () => clearRecents(),
          }),
        );
      } else {
        recentTail.push(
          await MenuItem.new({ id: "no-recents", text: "(none)", enabled: false }),
        );
      }

      const fileMenu = await Submenu.new({
        text: "File",
        items: [
          await MenuItem.new({
            id: "new",
            text: "New",
            accelerator: "CmdOrCtrl+N",
            action: () => handleNew(),
          }),
          await MenuItem.new({
            id: "open",
            text: "Open…",
            accelerator: "CmdOrCtrl+O",
            action: () => handleOpen(),
          }),
          await Submenu.new({
            text: "Open Recent",
            items: [...recentItems, ...recentTail],
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "close",
            text: "Close",
            accelerator: "CmdOrCtrl+W",
            action: () => handleClose(),
          }),
          await MenuItem.new({
            id: "save",
            text: "Save",
            accelerator: "CmdOrCtrl+S",
            action: () => handleSave(),
          }),
          await MenuItem.new({
            id: "saveAs",
            text: "Save As…",
            accelerator: "CmdOrCtrl+Shift+S",
            action: () => handleSaveAs(),
          }),
          await MenuItem.new({
            id: "revert",
            text: "Revert to Saved",
            action: () => handleRevert(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "insert-frontmatter",
            text: "Insert Frontmatter",
            enabled: !hasFrontmatter,
            action: () => handleInsertFrontmatter(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "showInFinder",
            text: "Show in Finder",
            accelerator: "CmdOrCtrl+Ctrl+O",
            action: () => handleShowInFinder(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "print",
            text: "Print…",
            accelerator: "CmdOrCtrl+P",
            action: () => handlePrint(),
          }),
        ],
      });

      const editMenu = await Submenu.new({
        text: "Edit",
        items: [
          await PredefinedMenuItem.new({ item: "Undo" }),
          await PredefinedMenuItem.new({ item: "Redo" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Cut" }),
          await PredefinedMenuItem.new({ item: "Copy" }),
          await PredefinedMenuItem.new({ item: "Paste" }),
          await PredefinedMenuItem.new({ item: "SelectAll" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "find",
            text: "Find…",
            accelerator: "CmdOrCtrl+F",
            action: () => handleFind(),
          }),
          await MenuItem.new({
            id: "replace",
            text: "Find and Replace…",
            accelerator: "CmdOrCtrl+Alt+F",
            action: () => handleReplace(),
          }),
        ],
      });

      const headingSubmenu = await Submenu.new({
        text: "Heading",
        items: await Promise.all(
          [1, 2, 3, 4, 5, 6].map((lvl) =>
            MenuItem.new({
              id: `heading-${lvl}`,
              text: `Heading ${lvl}`,
              accelerator: `CmdOrCtrl+${lvl}`,
              action: () => fmtHeading(lvl),
            }),
          ),
        ),
      });

      const formatMenu = await Submenu.new({
        text: "Format",
        items: [
          await MenuItem.new({
            id: "fmt-bold",
            text: "Bold",
            accelerator: "CmdOrCtrl+B",
            action: fmtBold,
          }),
          await MenuItem.new({
            id: "fmt-italic",
            text: "Italic",
            accelerator: "CmdOrCtrl+I",
            action: fmtItalic,
          }),
          await MenuItem.new({
            id: "fmt-code",
            text: "Inline Code",
            accelerator: "CmdOrCtrl+`",
            action: fmtCode,
          }),
          await MenuItem.new({
            id: "fmt-link",
            text: "Link",
            accelerator: "CmdOrCtrl+K",
            action: fmtLink,
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          headingSubmenu,
          await MenuItem.new({
            id: "fmt-bullet",
            text: "Bulleted List",
            accelerator: "CmdOrCtrl+Shift+8",
            action: fmtBulletList,
          }),
          await MenuItem.new({
            id: "fmt-ordered",
            text: "Numbered List",
            accelerator: "CmdOrCtrl+Shift+7",
            action: fmtOrderedList,
          }),
          await MenuItem.new({
            id: "fmt-quote",
            text: "Quote",
            accelerator: "CmdOrCtrl+Shift+Q",
            action: fmtBlockquote,
          }),
          await MenuItem.new({
            id: "fmt-codeblock",
            text: "Code Block",
            accelerator: "CmdOrCtrl+Alt+C",
            action: fmtCodeBlock,
          }),
          await MenuItem.new({
            id: "fmt-hr",
            text: "Horizontal Rule",
            action: fmtHr,
          }),
        ],
      });

      const themeSubmenu = await Submenu.new({
        text: "Theme",
        items: [
          await CheckMenuItem.new({
            id: "theme-system",
            text: "System",
            checked: theme === "system",
            action: () => setTheme("system"),
          }),
          await CheckMenuItem.new({
            id: "theme-light",
            text: "Light",
            checked: theme === "light",
            action: () => setTheme("light"),
          }),
          await CheckMenuItem.new({
            id: "theme-dark",
            text: "Dark",
            checked: theme === "dark",
            action: () => setTheme("dark"),
          }),
        ],
      });

      const viewMenu = await Submenu.new({
        text: "View",
        items: [
          themeSubmenu,
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "zoom-in",
            text: "Zoom In",
            accelerator: "CmdOrCtrl+Equal",
            action: () => zoomIn(),
          }),
          await MenuItem.new({
            id: "zoom-out",
            text: "Zoom Out",
            accelerator: "CmdOrCtrl+Minus",
            action: () => zoomOut(),
          }),
          await MenuItem.new({
            id: "zoom-reset",
            text: "Actual Size",
            accelerator: "CmdOrCtrl+0",
            action: () => zoomReset(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Fullscreen" }),
        ],
      });

      const goMenu = await Submenu.new({
        text: "Go",
        items: [
          await MenuItem.new({
            id: "nav-back", text: "Back", accelerator: "CmdOrCtrl+[",
            enabled: historyFlags.canBack, action: () => handleBack(),
          }),
          await MenuItem.new({
            id: "nav-forward", text: "Forward", accelerator: "CmdOrCtrl+]",
            enabled: historyFlags.canForward, action: () => handleForward(),
          }),
        ],
      });

      const helpMenu = await Submenu.new({
        text: "Help",
        items: [
          await MenuItem.new({
            id: "help-report-bug",
            text: "Report a Bug…",
            action: () => handleReportBug(),
          }),
          await MenuItem.new({
            id: "help-suggest-feature",
            text: "Suggest a Feature…",
            action: () => handleSuggestFeature(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "help-view-repo",
            text: "View on GitHub",
            action: () => handleViewRepo(),
          }),
        ],
      });

      const windowMenu = await Submenu.new({
        text: "Window",
        items: [
          await PredefinedMenuItem.new({ item: "Minimize" }),
          await PredefinedMenuItem.new({ item: "Maximize" }),
          await PredefinedMenuItem.new({ item: "CloseWindow" }),
        ],
      });

      // App menu is auto-prepended on macOS by Tauri when not provided, but we
      // explicitly include the standard predefined items for completeness.
      const appMenu = await Submenu.new({
        text: "Marky",
        items: [
          await PredefinedMenuItem.new({
            item: { About: { name: "Marky", version: appVersion } },
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "check-updates",
            text: "Check for Updates…",
            action: () => checkForUpdates(true),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "set-default",
            text: "Set as Default for Markdown Files",
            action: () => handleSetAsDefault(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await CheckMenuItem.new({
            id: "reopen-last",
            text: "Reopen Last Document on Launch",
            checked: reopenLast,
            action: () => setReopenLast((value) => !value),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Services" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Hide" }),
          await PredefinedMenuItem.new({ item: "HideOthers" }),
          await PredefinedMenuItem.new({ item: "ShowAll" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Quit" }),
        ],
      });

      const menu = await Menu.new({
        items: [appMenu, fileMenu, editMenu, formatMenu, viewMenu, goMenu, windowMenu, helpMenu],
      });

      if (cancelled) return;
      await menu.setAsAppMenu();
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [
    historyFlags.canBack,
    historyFlags.canForward,
    handleBack,
    handleForward,
    recents,
    theme,
    reopenLast,
    zoomIn,
    zoomOut,
    zoomReset,
    checkForUpdates,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleRevert,
    handleClose,
    handleShowInFinder,
    handleSetAsDefault,
    handleFind,
    handleReplace,
    handleReportBug,
    handleSuggestFeature,
    handleViewRepo,
    handleOpenRecent,
    clearRecents,
    fmtBold,
    fmtItalic,
    fmtCode,
    fmtLink,
    fmtBlockquote,
    fmtBulletList,
    fmtOrderedList,
    fmtCodeBlock,
    fmtHr,
    fmtHeading,
    handleInsertFrontmatter,
    hasFrontmatter,
    handlePrint,
  ]);

  const handleChange = useCallback((md: string) => {
    setBody(md);
    setDirty(true);
  }, []);

  const handleFrontmatterChange = useCallback((next: string) => {
    setFrontmatter(next);
    setDirty(true);
  }, []);

  const handleFrontmatterRemove = useCallback(() => {
    setFrontmatter(null);
    setDirty(true);
  }, []);

  return (
    <main className="app">
      {historyFlags.length >= 2 && (
        <nav className="marky-nav" aria-label="Document history">
          <button type="button" className="marky-find-btn" aria-label="Back"
            title="Back (Cmd/Ctrl+[)" disabled={!historyFlags.canBack} onClick={handleBack}>◀</button>
          <button type="button" className="marky-find-btn" aria-label="Forward"
            title="Forward (Cmd/Ctrl+])" disabled={!historyFlags.canForward} onClick={handleForward}>▶</button>
        </nav>
      )}
      {findOpen && (
        <FindReplace
          mode={findMode}
          query={findQuery}
          replacement={findReplacement}
          caseSensitive={findCaseSensitive}
          matchInfo={matchInfo}
          onQueryChange={handleQueryChange}
          onReplacementChange={setFindReplacement}
          onToggleCase={handleToggleCase}
          onNext={findNext}
          onPrev={findPrev}
          onReplace={doReplace}
          onReplaceAll={doReplaceAll}
          onClose={closeFind}
        />
      )}
      <section className="editor-wrap" ref={scrollRef}>
        {frontmatter !== null && (
          <FrontmatterPanel
            key={editorKey}
            value={frontmatter}
            onChange={handleFrontmatterChange}
            onRemove={handleFrontmatterRemove}
          />
        )}
        <MarkyEditor
          key={editorKey}
          initial={body}
          onChange={handleChange}
          onReady={onEditorReady}
          onFollowLink={handleFollowLink}
        />
      </section>
    </main>
  );
}

export default App;
