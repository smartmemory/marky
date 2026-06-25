# Frontmatter Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Marky preserve YAML frontmatter losslessly and let the user view, edit, add, and remove it, instead of Milkdown corrupting the `---` block on save.

**Architecture:** Handle frontmatter entirely outside Milkdown. A pure module splits a file into `{ frontmatter, body }` on load and rejoins them on save; only the body is fed to Milkdown. A separate React panel above the editor edits the raw YAML. See design: `docs/superpowers/specs/2026-06-25-frontmatter-handling-design.md`.

**Tech Stack:** TypeScript, React 19, Milkdown (commonmark + gfm), Tauri 2, Vite. New: Vitest for unit tests.

## Global Constraints

- Frontmatter detection is strict: the file's **first line** must match `/^---[ \t]*\r?\n/`; the block closes at the first later line equal to `---` or `...`. No closing fence ⇒ no frontmatter.
- The lossless promise covers the **frontmatter block only**. Milkdown owns body formatting (unchanged from today).
- YAML `---` fences only. No TOML (`+++`) or JSON frontmatter.
- No YAML library. The panel edits opaque text; only top-level keys are scanned (regex) for the summary.
- `tsconfig.json` includes all of `src` with `noEmit`, `strict`, `noUnusedLocals`, `noUnusedParameters`. Every new file must type-check clean under `npm run build`.
- Target version: 0.1.6. Update `CHANGELOG.md` and `README.md` in the same commit as the code they describe.
- README/CHANGELOG are user-facing prose: no em dashes, no semicolons.

---

## File Structure

- `src/frontmatter.ts` (new) — pure split/join/keys logic. One responsibility: string ⇄ `{ fm, body, closeDelim }`.
- `src/frontmatter.test.ts` (new) — Vitest unit tests for the parser contract.
- `src/FrontmatterPanel.tsx` (new) — collapsed/expandable raw-YAML editor component.
- `src/App.tsx` (modify) — replace `content` state with `body` + `frontmatter` + `closeDelim`; split on load, join on save; render the panel; add the File-menu item.
- `src/App.css` (modify) — styles for `.marky-frontmatter*`.
- `src/Editor.tsx` — unchanged in behavior (now receives the body as `initial`).
- `package.json` (modify) — add `vitest` devDependency, `test` script, version bump.
- `CHANGELOG.md`, `README.md` (modify) — document the feature.

---

## Task 1: Pure frontmatter module + tests

**Files:**
- Create: `src/frontmatter.ts`
- Create: `src/frontmatter.test.ts`
- Modify: `package.json` (add `vitest` devDependency and `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FrontmatterSplit = { fm: string | null; body: string; closeDelim: "---" | "..." }`
  - `splitFrontmatter(text: string): FrontmatterSplit`
  - `joinFrontmatter(fm: string | null, body: string, closeDelim?: "---" | "..."): string`
  - `frontmatterKeys(fm: string): string[]`

- [ ] **Step 1: Add Vitest to the project**

Run:
```bash
npm install -D vitest
```
Expected: `vitest` added under `devDependencies` in `package.json` (the already-tracked `package-lock.json` updates too, consistent with this repo).

- [ ] **Step 2: Add the `test` script**

In `package.json`, add to `"scripts"`:
```json
    "test": "vitest run"
```
Place it after `"preview"`. Leave the other scripts unchanged.

- [ ] **Step 3: Write the failing tests**

Create `src/frontmatter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { splitFrontmatter, joinFrontmatter, frontmatterKeys } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("splits a standard YAML frontmatter block", () => {
    const text = "---\ntitle: My Post\ndate: 2026-06-25\n---\n# My Post\n\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: My Post\ndate: 2026-06-25");
    expect(r.body).toBe("# My Post\n\nBody.");
    expect(r.closeDelim).toBe("---");
  });

  it("returns null fm when there is no frontmatter", () => {
    const text = "# Just a heading\n\nNo metadata.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("does not misdetect a body that opens with a thematic break", () => {
    // First line is `---` but there is no closing fence.
    const text = "---\nThis is text under a rule, not metadata.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("detects and preserves a `...` closing delimiter", () => {
    const text = "---\na: 1\n...\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("a: 1");
    expect(r.closeDelim).toBe("...");
    expect(r.body).toBe("Body.");
  });

  it("handles an empty frontmatter block", () => {
    const r = splitFrontmatter("---\n---\nBody.");
    expect(r.fm).toBe("");
    expect(r.body).toBe("Body.");
  });

  it("handles an empty body", () => {
    const r = splitFrontmatter("---\ntitle: x\n---\n");
    expect(r.fm).toBe("title: x");
    expect(r.body).toBe("");
  });

  it("splits CRLF input and normalizes inner content to \\n", () => {
    const text = "---\r\ntitle: x\r\ntags: [a, b]\r\n---\r\n# H\r\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: x\ntags: [a, b]");
    expect(r.body).toBe("# H\nBody.");
  });

  it("ignores a body `---` thematic break after real frontmatter", () => {
    const text = "---\ntitle: x\n---\n# H\n\n---\n\nMore.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: x");
    expect(r.body).toBe("# H\n\n---\n\nMore.");
  });
});

describe("joinFrontmatter", () => {
  it("round-trips a split file exactly (block + body)", () => {
    const text = "---\ntitle: My Post\ndate: 2026-06-25\n---\n# My Post\n\nBody.";
    const r = splitFrontmatter(text);
    expect(joinFrontmatter(r.fm, r.body, r.closeDelim)).toBe(text);
  });

  it("round-trips a `...` delimiter", () => {
    const text = "---\na: 1\n...\nBody.";
    const r = splitFrontmatter(text);
    expect(joinFrontmatter(r.fm, r.body, r.closeDelim)).toBe(text);
  });

  it("returns the body unchanged when fm is null", () => {
    expect(joinFrontmatter(null, "# Body")).toBe("# Body");
  });

  it("drops the block when fm is empty or whitespace-only (removal path)", () => {
    expect(joinFrontmatter("", "# Body")).toBe("# Body");
    expect(joinFrontmatter("   \n  ", "# Body")).toBe("# Body");
  });

  it("defaults the closing delimiter to ---", () => {
    expect(joinFrontmatter("a: 1", "B")).toBe("---\na: 1\n---\nB");
  });
});

describe("frontmatterKeys", () => {
  it("returns only top-level keys, skipping nested, indented, and comment lines", () => {
    const fm = "title: My Post\ndate: 2026-06-25\ntags:\n  - a\n  - b\n# a comment\nmeta:\n  nested: v";
    expect(frontmatterKeys(fm)).toEqual(["title", "date", "tags", "meta"]);
  });

  it("returns an empty array for empty frontmatter", () => {
    expect(frontmatterKeys("")).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:
```bash
npm test
```
Expected: FAIL — `Failed to resolve import "./frontmatter"` / module not found (the source file does not exist yet).

- [ ] **Step 5: Implement the module**

Create `src/frontmatter.ts`:
```ts
export type FrontmatterSplit = {
  /** Verbatim inner YAML between the fences, or null when there is no frontmatter. */
  fm: string | null;
  /** Everything after the closing fence line. Fed to Milkdown. */
  body: string;
  /** The closing delimiter that was used, so it can be preserved on join. */
  closeDelim: "---" | "...";
};

// The first line must be exactly `---` (optional trailing spaces/tabs), then a newline.
const OPEN_RE = /^---[ \t]*\r?\n/;
// A top-level key: an unindented `name:` line.
const KEY_RE = /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:/;

const stripCr = (line: string): string => line.replace(/\r$/, "");

export function splitFrontmatter(text: string): FrontmatterSplit {
  const open = OPEN_RE.exec(text);
  if (!open) {
    return { fm: null, body: text, closeDelim: "---" };
  }
  const lines = text.slice(open[0].length).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = stripCr(lines[i]);
    if (line === "---" || line === "...") {
      const fm = lines.slice(0, i).map(stripCr).join("\n");
      const body = lines.slice(i + 1).map(stripCr).join("\n");
      return { fm, body, closeDelim: line };
    }
  }
  // No closing fence: the leading `---` is a thematic break, not frontmatter.
  return { fm: null, body: text, closeDelim: "---" };
}

export function joinFrontmatter(
  fm: string | null,
  body: string,
  closeDelim: "---" | "..." = "---",
): string {
  if (fm === null || fm.trim() === "") {
    return body;
  }
  return `---\n${fm}\n${closeDelim}\n${body}`;
}

export function frontmatterKeys(fm: string): string[] {
  const keys: string[] = [];
  for (const raw of fm.split("\n")) {
    const line = stripCr(raw);
    if (/^\s/.test(line) || line.startsWith("#")) continue;
    const m = KEY_RE.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
npm test
```
Expected: PASS — all tests green.

- [ ] **Step 7: Verify the build still type-checks**

Run:
```bash
npm run build
```
Expected: `tsc` passes (no unused-locals/strict errors in the new files) and `vite build` succeeds.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/frontmatter.ts src/frontmatter.test.ts
git commit -m "Add pure frontmatter split/join module with tests"
```

---

## Task 2: Frontmatter panel component + styles

**Files:**
- Create: `src/FrontmatterPanel.tsx`
- Modify: `src/App.css` (append `.marky-frontmatter*` rules)

**Interfaces:**
- Consumes: `frontmatterKeys` from `src/frontmatter.ts`.
- Produces: `FrontmatterPanel` (named export) with props
  `{ value: string; onChange: (next: string) => void; onRemove: () => void }`.

- [ ] **Step 1: Create the component**

Create `src/FrontmatterPanel.tsx`:
```tsx
import { useState } from "react";
import { frontmatterKeys } from "./frontmatter";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
};

export function FrontmatterPanel({ value, onChange, onRemove }: Props) {
  // A freshly inserted (empty) block starts open for typing; loaded files start collapsed.
  const [open, setOpen] = useState(value.trim() === "");

  const keys = frontmatterKeys(value);
  const summary =
    keys.length > 0
      ? keys.slice(0, 5).join(", ") + (keys.length > 5 ? "…" : "")
      : "empty";

  const toggle = () => setOpen((o) => !o);

  return (
    <div className="marky-frontmatter">
      <div
        className="marky-frontmatter-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="marky-frontmatter-disclosure">{open ? "▾" : "▸"}</span>
        <span className="marky-frontmatter-title">frontmatter</span>
        {!open && <span className="marky-frontmatter-keys">({summary})</span>}
        <button
          type="button"
          className="marky-frontmatter-remove"
          title="Remove frontmatter"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="marky-frontmatter-body">
          <textarea
            className="marky-frontmatter-textarea"
            value={value}
            spellCheck={false}
            placeholder="key: value"
            rows={Math.max(3, value.split("\n").length)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append the styles**

Add to the end of `src/App.css`:
```css
/* Frontmatter panel */
.marky-frontmatter {
  margin-bottom: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--code-bg);
}

.marky-frontmatter-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  color: var(--muted);
  outline: none;
}

.marky-frontmatter-header:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
  border-radius: 8px;
}

.marky-frontmatter-disclosure {
  width: 1em;
  text-align: center;
}

.marky-frontmatter-title {
  font-weight: 600;
  color: var(--fg);
}

.marky-frontmatter-keys {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

.marky-frontmatter-remove {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
}

.marky-frontmatter-remove:hover {
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 8%, transparent);
}

.marky-frontmatter-body {
  padding: 0 12px 12px;
}

.marky-frontmatter-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 4em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: calc(13px * var(--marky-zoom, 1));
  color: var(--code-fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  outline: none;
  white-space: pre;
  tab-size: 2;
}

.marky-frontmatter-textarea:focus {
  border-color: var(--accent);
}
```

- [ ] **Step 3: Verify the build**

Run:
```bash
npm run build
```
Expected: PASS. (The component is not yet rendered anywhere; this step only confirms it compiles.)

- [ ] **Step 4: Commit**

```bash
git add src/FrontmatterPanel.tsx src/App.css
git commit -m "Add frontmatter panel component and styles"
```

---

## Task 3: Wire frontmatter through App state and file IO

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `splitFrontmatter`, `joinFrontmatter` from `src/frontmatter.ts`; `FrontmatterPanel` from `src/FrontmatterPanel.tsx`.
- Produces: `body`, `frontmatter`, `closeDelim` state plus `handleFrontmatterChange`, `handleFrontmatterRemove`, `handleInsertFrontmatter` (used by Task 4).

- [ ] **Step 1: Add the imports**

In `src/App.tsx`, after the `FindReplace` import (line 28), add:
```tsx
import { FrontmatterPanel } from "./FrontmatterPanel";
import { splitFrontmatter, joinFrontmatter } from "./frontmatter";
```

- [ ] **Step 2: Replace the `content` state with body + frontmatter state**

Replace (line 94):
```tsx
  const [content, setContent] = useState("");
```
with:
```tsx
  const [body, setBody] = useState("");
  const [frontmatter, setFrontmatter] = useState<string | null>(null);
  const [closeDelim, setCloseDelim] = useState<"---" | "...">("---");
```

- [ ] **Step 3: Update `stateRef` to carry the new fields**

Replace (lines 168-169):
```tsx
  const stateRef = useRef({ content, path, dirty, recents });
  stateRef.current = { content, path, dirty, recents };
```
with:
```tsx
  const stateRef = useRef({ body, frontmatter, closeDelim, path, dirty, recents });
  stateRef.current = { body, frontmatter, closeDelim, path, dirty, recents };
```

- [ ] **Step 4: Split frontmatter in `loadPath`**

Replace the body of `loadPath` (lines 305-316) so it splits on read:
```tsx
  const loadPath = useCallback(
    async (target: string) => {
      const text = await readTextFile(target);
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
```

- [ ] **Step 5: Reset frontmatter in `handleNew`**

Replace the body of `handleNew` (lines 318-325):
```tsx
  const handleNew = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    setFrontmatter(null);
    setBody("");
    setCloseDelim("---");
    setPath(null);
    setDirty(false);
    setEditorKey((k) => k + 1);
    localStorage.removeItem(LAST_FILE_KEY);
  }, [confirmDiscard]);
```

- [ ] **Step 6: Join frontmatter on save in `handleSave`**

In `handleSave`, replace the write line (line 366):
```tsx
    await writeTextFile(target, stateRef.current.content);
```
with:
```tsx
    await writeTextFile(
      target,
      joinFrontmatter(
        stateRef.current.frontmatter,
        stateRef.current.body,
        stateRef.current.closeDelim,
      ),
    );
```

- [ ] **Step 7: Join frontmatter on save in `handleSaveAs`**

In `handleSaveAs`, replace the write line (line 379):
```tsx
    await writeTextFile(chosen, stateRef.current.content);
```
with:
```tsx
    await writeTextFile(
      chosen,
      joinFrontmatter(
        stateRef.current.frontmatter,
        stateRef.current.body,
        stateRef.current.closeDelim,
      ),
    );
```

- [ ] **Step 8: Split frontmatter in `handleRevert`**

In `handleRevert`, replace the success branch (lines 391-394):
```tsx
      const text = await readTextFile(p);
      setContent(text);
      setDirty(false);
      setEditorKey((k) => k + 1);
```
with:
```tsx
      const text = await readTextFile(p);
      const split = splitFrontmatter(text);
      setFrontmatter(split.fm);
      setBody(split.body);
      setCloseDelim(split.closeDelim);
      setDirty(false);
      setEditorKey((k) => k + 1);
```

- [ ] **Step 9: Update the external-change watcher**

In the watcher effect, replace the "unchanged" comparison (line 480):
```tsx
              if (fresh === stateRef.current.content) {
```
with:
```tsx
              if (
                fresh ===
                joinFrontmatter(
                  stateRef.current.frontmatter,
                  stateRef.current.body,
                  stateRef.current.closeDelim,
                )
              ) {
```
and replace the reload branch (lines 490-495):
```tsx
              if (reload) {
                lastSeen = fresh;
                setContent(fresh);
                setDirty(false);
                setEditorKey((k) => k + 1);
              }
```
with:
```tsx
              if (reload) {
                lastSeen = fresh;
                const split = splitFrontmatter(fresh);
                setFrontmatter(split.fm);
                setBody(split.body);
                setCloseDelim(split.closeDelim);
                setDirty(false);
                setEditorKey((k) => k + 1);
              }
```

- [ ] **Step 10: Update `handleChange` to set the body**

Replace `handleChange` (lines 901-904):
```tsx
  const handleChange = useCallback((md: string) => {
    setContent(md);
    setDirty(true);
  }, []);
```
with:
```tsx
  const handleChange = useCallback((md: string) => {
    setBody(md);
    setDirty(true);
  }, []);
```

- [ ] **Step 11: Add the frontmatter handlers**

Immediately after `handleChange` (after the block edited in Step 10), add:
```tsx
  const handleFrontmatterChange = useCallback((next: string) => {
    setFrontmatter(next);
    setDirty(true);
  }, []);

  const handleFrontmatterRemove = useCallback(() => {
    setFrontmatter(null);
    setDirty(true);
  }, []);

  const handleInsertFrontmatter = useCallback(() => {
    if (stateRef.current.frontmatter !== null) return;
    setFrontmatter("");
    setCloseDelim("---");
    setDirty(true);
  }, []);
```

- [ ] **Step 12: Render the panel and feed the body to Milkdown**

Replace the editor section (lines 925-932):
```tsx
      <section className="editor-wrap">
        <MarkyEditor
          key={editorKey}
          initial={content}
          onChange={handleChange}
          onReady={onEditorReady}
        />
      </section>
```
with:
```tsx
      <section className="editor-wrap">
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
        />
      </section>
```

- [ ] **Step 13: Verify the build**

Run:
```bash
npm run build
```
Expected: PASS. There must be no remaining reference to `content`/`setContent` (those would now be unused or undefined and fail `tsc`). If `tsc` reports `content` is not defined anywhere, every usage has been migrated correctly.

- [ ] **Step 14: Manual smoke test**

Run:
```bash
npm run tauri dev
```
Then verify by hand:
1. Open a `.md` file that begins with a `---` frontmatter block. The collapsed `▸ frontmatter (…)` panel appears above the body; the body shows no stray horizontal rule.
2. Edit only the body, Save, and confirm in a terminal (`head` the file) that the `---` block is byte-identical.
3. Expand the panel, change a value, Save, and confirm only the block changed.
4. Open a file with no frontmatter: no panel appears, behavior is unchanged.

- [ ] **Step 15: Commit**

```bash
git add src/App.tsx
git commit -m "Wire frontmatter through App state, load, and save"
```

---

## Task 4: "Insert Frontmatter" File menu item

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `handleInsertFrontmatter` and `frontmatter` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Derive whether frontmatter is present**

In `App.tsx`, immediately before the menu-building effect (just before line 560, `useEffect(() => {` that builds the menu), add:
```tsx
  const hasFrontmatter = frontmatter !== null;
```

- [ ] **Step 2: Add the menu item to the File submenu**

In the `fileMenu` definition, after the `revert` item (lines 627-631) and before the separator that precedes `showInFinder` (line 632), insert:
```tsx
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "insert-frontmatter",
            text: "Insert Frontmatter",
            enabled: !hasFrontmatter,
            action: () => handleInsertFrontmatter(),
          }),
```
The existing `Separator` + `showInFinder` items remain directly after this insertion.

- [ ] **Step 3: Add the new dependencies to the menu effect**

In the dependency array of the menu-building `useEffect` (lines 867-899), add these two entries (alongside the other handlers, e.g. after `handleShowInFinder`):
```tsx
    handleInsertFrontmatter,
    hasFrontmatter,
```

- [ ] **Step 4: Verify the build**

Run:
```bash
npm run build
```
Expected: PASS (no missing-dependency lint surfaced by `tsc`; `handleInsertFrontmatter` and `hasFrontmatter` are now referenced).

- [ ] **Step 5: Manual smoke test**

Run `npm run tauri dev`, then:
1. Open a file with no frontmatter. File menu → "Insert Frontmatter" is **enabled**. Click it: the panel appears expanded with an empty textarea.
2. Type `title: Test`, Save, confirm the file now begins with `---\ntitle: Test\n---\n`.
3. With frontmatter present, File menu → "Insert Frontmatter" is **disabled**.
4. Click the panel's ✕, Save, confirm the `---` block is gone.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "Add Insert Frontmatter to the File menu"
```

---

## Task 5: Documentation and version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-06-25-frontmatter-handling-design.md` (status)

**Interfaces:** none.

- [ ] **Step 1: Add the changelog entry**

In `CHANGELOG.md`, replace the `## Unreleased` section header and its content with a released `## v0.1.6` section that keeps the existing Unreleased note and adds the frontmatter entry. The top of the file becomes:
```markdown
# Changelog

## v0.1.6

### Added
- YAML frontmatter is now preserved and editable. Files that begin with a `---`
  block show a collapsible frontmatter panel above the document, and the raw
  YAML round-trips losslessly instead of being mangled into a horizontal rule.
  File menu has an "Insert Frontmatter" action for files that have none, and
  clearing the panel removes the block on save.

### Changed
- The About dialog and the bug-report template now read the app version
  dynamically via `getVersion()` instead of a hardcoded string, so they no
  longer go stale on release.

## v0.1.5
```
(No em dashes or semicolons in this prose.)

- [ ] **Step 2: Note the feature in the README**

In `README.md`, add a short line to the feature description near the top (after the "Just text." paragraph that ends "...Just text."), reading:
```markdown
YAML frontmatter is preserved and editable: files that open with a `---` block
get a collapsible metadata panel, and the block round-trips without corruption.
```
(No em dashes or semicolons.)

- [ ] **Step 3: Bump the version**

In `package.json`, change:
```json
  "version": "0.1.5",
```
to:
```json
  "version": "0.1.6",
```

- [ ] **Step 4: Mark the design doc approved**

In `docs/superpowers/specs/2026-06-25-frontmatter-handling-design.md`, change the status line:
```markdown
- **Status:** Approved (pending spec review)
```
to:
```markdown
- **Status:** Implemented
```

- [ ] **Step 5: Verify the full build and tests one last time**

Run:
```bash
npm test && npm run build
```
Expected: tests PASS, build PASS.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md README.md package.json docs/superpowers/specs/2026-06-25-frontmatter-handling-design.md
git commit -m "Release v0.1.6: frontmatter preservation and editing"
```

---

## Self-Review Notes

- **Spec coverage:** split/join/keys (Task 1) ✓; collapsed-summary editable panel (Task 2) ✓; preserve-on-load / join-on-save across load/new/revert/watcher (Task 3) ✓; add/remove via File menu + panel ✓ (Task 3/4); strict detection, `...` delimiter, CRLF, false-positive avoidance (Task 1 tests) ✓; vitest + tests ✓; CHANGELOG/README/version (Task 5) ✓.
- **`closeDelim` default** is `"---"` everywhere (`joinFrontmatter` signature, `handleInsertFrontmatter`, `handleNew`); state type is `"---" | "..."` consistently.
- **No byte-for-byte body promise** is intentional (Milkdown owns body formatting); the round-trip tests assert exact frontmatter, not normalized body.
- **Line numbers** reference the pre-edit `src/App.tsx`; apply edits top-to-bottom so later line numbers stay valid, or match on the quoted code rather than the line number.
