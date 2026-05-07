import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, watchImmediate, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
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
import type { Editor } from "@milkdown/core";
import { MarkyEditor, type EditorGetter } from "./Editor";
import "./App.css";

const RECENTS_KEY = "marky.recents";
const LAST_FILE_KEY = "marky.lastFile";
const THEME_KEY = "marky.theme";
const RECENTS_MAX = 10;

type Theme = "system" | "light" | "dark";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
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
  const [content, setContent] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Stash latest values in refs so the menu's static action callbacks see fresh state.
  const stateRef = useRef({ content, path, dirty, recents });
  stateRef.current = { content, path, dirty, recents };

  const getEditorRef = useRef<EditorGetter | null>(null);
  const onEditorReady = useCallback((g: EditorGetter) => {
    getEditorRef.current = g;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmd = useCallback((command: any, payload?: any) => {
    const ed = getEditorRef.current?.() as Editor | undefined;
    if (!ed) return;
    ed.action(callCommand(command.key, payload));
  }, []);

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
    async (target: string) => {
      const text = await readTextFile(target);
      setContent(text);
      setPath(target);
      setDirty(false);
      setEditorKey((k) => k + 1);
      pushRecent(target);
      localStorage.setItem(LAST_FILE_KEY, target);
    },
    [pushRecent],
  );

  const handleNew = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    setContent("");
    setPath(null);
    setDirty(false);
    setEditorKey((k) => k + 1);
    localStorage.removeItem(LAST_FILE_KEY);
  }, [confirmDiscard]);

  const handleOpen = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (typeof selected === "string") await loadPath(selected);
  }, [confirmDiscard, loadPath]);

  const handleOpenRecent = useCallback(
    async (p: string) => {
      if (!(await confirmDiscard())) return;
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
        await loadPath(p);
      } catch (err) {
        console.error(err);
      }
    },
    [confirmDiscard, loadPath],
  );

  const handleSave = useCallback(async () => {
    let target = stateRef.current.path;
    if (!target) {
      const chosen = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!chosen) return;
      target = chosen;
    }
    await writeTextFile(target, stateRef.current.content);
    setPath(target);
    setDirty(false);
    pushRecent(target);
    localStorage.setItem(LAST_FILE_KEY, target);
  }, [pushRecent]);

  const handleSaveAs = useCallback(async () => {
    const chosen = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: stateRef.current.path ?? undefined,
    });
    if (!chosen) return;
    await writeTextFile(chosen, stateRef.current.content);
    setPath(chosen);
    setDirty(false);
    pushRecent(chosen);
    localStorage.setItem(LAST_FILE_KEY, chosen);
  }, [pushRecent]);

  const handleRevert = useCallback(async () => {
    const p = stateRef.current.path;
    if (!p) return;
    if (!(await confirmDiscard())) return;
    try {
      const text = await readTextFile(p);
      setContent(text);
      setDirty(false);
      setEditorKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    }
  }, [confirmDiscard]);

  const handleClose = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    await getCurrentWindow().close();
  }, [confirmDiscard]);

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

  const handleShowInFinder = useCallback(async () => {
    const p = stateRef.current.path;
    if (!p) return;
    try {
      await revealItemInDir(p);
    } catch (err) {
      console.error(err);
    }
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
              if (fresh === stateRef.current.content) {
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
                setContent(fresh);
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

  // Initial load: only files the OS asked us to open. Auto-reopen of the last
  // file is intentionally disabled — touching the filesystem before any user
  // interaction can collide with macOS TCC prompts and stall startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await invoke<string | null>("take_pending_file").catch(() => null);
      if (cancelled) return;
      if (pending) await loadPath(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPath]);

  // OS open-file events while running
  useEffect(() => {
    const unlisten = listen<string>("open-file", async (e) => {
      if (!e.payload) return;
      if (!(await confirmDiscard())) return;
      await loadPath(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [confirmDiscard, loadPath]);

  // Drag-drop file onto the window
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths;
      if (!paths.length) return;
      if (!(await confirmDiscard())) return;
      await loadPath(paths[0]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [confirmDiscard, loadPath]);

  // Keep window title + edited indicator in sync
  useEffect(() => {
    const win = getCurrentWindow();
    const name = path ? basename(path) : "Untitled";
    win.setTitle(`${name}${dirty ? " — Edited" : ""} — Marky`).catch(() => {});
  }, [path, dirty]);

  // Build native menu. Rebuilds when recents or handlers change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
            id: "showInFinder",
            text: "Show in Finder",
            accelerator: "CmdOrCtrl+Ctrl+O",
            action: () => handleShowInFinder(),
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
          await PredefinedMenuItem.new({ item: "Fullscreen" }),
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
            item: { About: { name: "Marky", version: "0.1.0" } },
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "set-default",
            text: "Set as Default for Markdown Files",
            action: () => handleSetAsDefault(),
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
        items: [appMenu, fileMenu, editMenu, formatMenu, viewMenu, windowMenu],
      });

      if (cancelled) return;
      await menu.setAsAppMenu();
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [
    recents,
    theme,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleRevert,
    handleClose,
    handleShowInFinder,
    handleSetAsDefault,
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
  ]);

  const handleChange = useCallback((md: string) => {
    setContent(md);
    setDirty(true);
  }, []);

  return (
    <main className="app">
      <section className="editor-wrap">
        <MarkyEditor
          key={editorKey}
          initial={content}
          onChange={handleChange}
          onReady={onEditorReady}
        />
      </section>
    </main>
  );
}

export default App;
