# Marky Frontmatter Handling — Design

- **Date:** 2026-06-25
- **Status:** Implemented
- **Topic:** YAML frontmatter preservation and editing
- **Target version:** 0.1.6

## Related Documents

- Implementation plan: _to be written (writing-plans)_
- Code touched: `src/App.tsx`, `src/Editor.tsx`, new `src/frontmatter.ts`, new `src/FrontmatterPanel.tsx`

## Problem

Marky edits markdown through Milkdown (commonmark + gfm), a WYSIWYG editor. The
load → edit → save flow treats the whole file as one markdown string:

1. `loadPath` reads the file into `content` (`src/App.tsx`).
2. `content` is handed to Milkdown as `initial` and parsed by commonmark/gfm.
3. Edits round-trip back through `markdownUpdated` → `onChange` → `content`,
   which is written to disk on save.

There is no frontmatter handling anywhere. When a file begins with a YAML
frontmatter block:

```
---
title: My Post
date: 2026-06-25
tags: [md, notes]
---

# My Post
```

Milkdown's commonmark parser interprets the leading `---` as a **thematic break
(horizontal rule)** and the `key: value` lines as a **plain paragraph**. On the
next save the block is rewritten as a horizontal rule plus prose, so the
frontmatter is **corrupted on round-trip**.

This matters for Obsidian / Jekyll / Hugo notes and for the user's own
SmartMemory memory files and docs contracts, all of which lead with `---`
frontmatter.

## Goals

- Frontmatter is **never corrupted**. Its content round-trips losslessly,
  including comments, key ordering, and value formatting.
- Frontmatter is **visible and editable** inside Marky as raw YAML text, without
  imposing a schema.
- Files **without** frontmatter behave exactly as today.
- The user can **add** an empty frontmatter block to a file that has none, and
  **remove** an existing one.

## Non-Goals

- No structured / typed field editor (no key-value form, no type coercion).
- No YAML validation or schema enforcement. The panel edits opaque text.
- No TOML (`+++`) or JSON frontmatter. YAML `---` fences only. (Noted as a
  possible future extension.)
- No byte-for-byte preservation of the **body**. Milkdown owns body formatting
  and normalizes it today; that is unchanged. The lossless promise applies to
  the **frontmatter block only**.

## Approach

**Handle frontmatter entirely outside Milkdown.** On load, split the file into
`{ frontmatter, body }`. Feed only the body to Milkdown, exactly as today.
Render a separate React panel above the editor for the frontmatter, with its own
state. On save, join the two back together. Milkdown never sees the `---` block,
so it cannot mangle it, and there is no risk of commonmark/gfm interactions.

Alternatives considered and rejected:

- **Custom Milkdown/ProseMirror node** for frontmatter inside the single editor
  surface. Requires a schema node + parser + serializer + NodeView for the
  collapse UI, and reintroduces the parser-interaction risk we are removing.
  Over-engineered.
- **String pre/post-process but render read-only.** Rejected because the
  frontmatter must be editable.

## Components

### 1. `src/frontmatter.ts` (new, pure, dependency-free)

The single source of truth for splitting and joining. Pure functions, unit
tested.

```ts
export type FrontmatterSplit = {
  /** Verbatim inner YAML (between the fences), or null if no frontmatter. */
  fm: string | null;
  /** Everything after the closing fence line. Fed to Milkdown. */
  body: string;
  /** The closing delimiter that was used, so it can be preserved on join. */
  closeDelim: "---" | "...";
};

export function splitFrontmatter(text: string): FrontmatterSplit;
export function joinFrontmatter(
  fm: string | null,
  body: string,
  closeDelim?: "---" | "...",
): string;
export function frontmatterKeys(fm: string): string[];
```

**Detection rules (`splitFrontmatter`):**

- Frontmatter exists only when the **first line** matches `/^---[ \t]*\r?\n/`
  (the very first characters of the file; a leading BOM or blank line means no
  detection).
- Scanning subsequent lines, the block closes at the **first line** that is
  exactly `---` or `...` (matching `/^(---|\.\.\.)[ \t]*$/`).
- If no closing fence is found, there is no frontmatter: return
  `{ fm: null, body: text, closeDelim: "---" }`. A document that genuinely opens
  with a thematic rule is therefore left untouched.
- `fm` is the verbatim text between the opening fence's newline and the closing
  fence line (no surrounding delimiter lines, no trailing newline).
- `body` is everything strictly after the closing fence line's terminating
  newline (may be empty).
- Line endings: detection tolerates `\r?\n`. Output is normalized to `\n`
  (Milkdown normalizes the body to `\n` regardless).

**Reconstruction (`joinFrontmatter`):**

- If `fm` is `null` or trimmed-empty → return `body` unchanged (this is how
  "remove" works, and how a cleared panel drops the block).
- Otherwise → `"---\n" + fm + "\n" + closeDelim + "\n" + body`.

**Round-trip invariant:** for any `text`,
`joinFrontmatter(split.fm, split.body, split.closeDelim)` reproduces the
frontmatter block exactly (delimiters + inner content), with the body following.
Body whitespace normalization by Milkdown is out of scope of this invariant.

**`frontmatterKeys(fm)`:** returns top-level keys for the collapsed summary via a
light regex over non-indented lines (`/^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:/`). No
YAML library. Used for display only; never for round-trip.

### 2. `src/FrontmatterPanel.tsx` (new)

```ts
type Props = {
  value: string;                 // raw inner YAML
  onChange: (next: string) => void;
  onRemove: () => void;
};
```

- **Collapsed (default):** a single-line header,
  `▸ frontmatter (title, date, tags…)`, listing the first few keys from
  `frontmatterKeys`. Clicking toggles expansion. Collapse state is local
  component state.
- **Expanded:** a styled monospace `<textarea>` bound to `value`, auto-sized to
  its content, plus a small remove (×) control in the header that calls
  `onRemove`.
- Styling lives in `App.css`, themed for light and dark to match the Nord
  editor. The panel sits above `.editor-wrap`, visually distinct from the prose.

### 3. `src/App.tsx` (rewired)

- **State:** replace the single `content` string with `body` (the markdown fed to
  Milkdown) and `frontmatter: string | null` plus a remembered
  `closeDelim`. `stateRef` carries all three so the static menu action callbacks
  see fresh values.
- **Derived saved string:** every write uses
  `joinFrontmatter(frontmatter, body, closeDelim)`.
- **`loadPath` / `handleRevert` / external-change watcher:** read text →
  `splitFrontmatter` → set `body`, `frontmatter`, `closeDelim`. The external
  watcher's "unchanged" comparison compares disk text against the joined output.
- **`handleNew`:** `frontmatter = null`, `body = ""`.
- **`handleChange` (from Milkdown):** `setBody(md)`, `setDirty(true)`.
- **Panel `onChange`:** `setFrontmatter(next)`, `setDirty(true)`. Panel
  `onRemove`: `setFrontmatter(null)`, `setDirty(true)`.
- **Milkdown remount:** the existing `editorKey` remount is triggered only by
  body-replacing actions (load/new/revert/external reload), not by frontmatter
  edits, so typing metadata never resets the document body.
- **"Insert Frontmatter" menu item:** added to the **File** menu. When the file
  has no frontmatter, it sets `frontmatter` from `null` to `""` so the panel
  appears (expanded) for typing. When frontmatter already exists, the item is
  **disabled**.
- **Panel visibility vs. save:** the panel renders whenever
  `frontmatter !== null` (so an empty inserted block still shows its editor).
  Saving, however, uses `joinFrontmatter`, which drops a `null` or trimmed-empty
  block. So inserting a block and saving without typing anything writes **no**
  `---` block. This is intentional: an empty frontmatter block carries no
  meaning, so it is not persisted.

### 4. Milkdown (`src/Editor.tsx`)

Unchanged in behavior. It now receives `body` instead of the full file as
`initial`. No plugin changes.

## Data Flow

```
file on disk
   │ readTextFile
   ▼
splitFrontmatter(text) ──► { fm, body, closeDelim }
   │                              │
   ▼                              ▼
FrontmatterPanel(fm)        Milkdown(initial = body)
   │ onChange                     │ markdownUpdated
   ▼                              ▼
frontmatter state            body state
   └──────────────┬───────────────┘
                  ▼
   joinFrontmatter(frontmatter, body, closeDelim)
                  │ writeTextFile
                  ▼
            file on disk
```

## Edge Cases

| Case | Behavior |
| --- | --- |
| File opens with `---` but no closing fence | Not frontmatter. Treated as body (thematic rule), exactly as today. |
| File opens with `---` (thematic rule) and has a later `---`, but the captured block has no top-level YAML key | Not frontmatter. The block must be empty or contain at least one top-level `key:` to be treated as frontmatter, so prose between two rules stays in the body. |
| Closing delimiter is `...` | Detected; `closeDelim = "..."` preserved on save. |
| Leading BOM or blank line before `---` | No detection (strict first-line rule). Documented limitation. |
| CRLF line endings | Detected; output normalized to `\n`. Body line endings already normalized by Milkdown. |
| Body contains a legitimate `---` thematic break | Unaffected. Only the *first* line participates in detection. |
| Panel cleared to empty / removed | `joinFrontmatter` drops the block; file saves with body only. |
| "Insert Frontmatter" on a file that already has it | Menu item disabled / no-op. |
| Empty `fm` value passed to join | Treated as removal (no block written). |

## Testing

Adds **vitest** as the project's first test runner (justified: pure parsing
logic, the highest-value unit-test case). `package.json` gains a `test` script
and `vitest` devDependency.

`src/frontmatter.test.ts` covers the split/join/keys contract:

- [ ] Round-trip: file with frontmatter → split → join reproduces the block.
- [ ] File with no frontmatter → `fm` is null, body unchanged, join is identity.
- [ ] `...` closing delimiter detected and preserved.
- [ ] No closing fence → treated as body (no false positive).
- [ ] Body containing a `---` thematic break is not misdetected.
- [ ] CRLF input split correctly.
- [ ] Empty / whitespace-only `fm` on join → body only (removal path).
- [ ] `frontmatterKeys` returns top-level keys only, ignoring indented/nested
      lines and comments.

Per the project testing hierarchy, the parser is pure logic, so unit tests are
the right tier here. No Milkdown integration test is added; the panel and
rewiring are verified manually against a real frontmatter file before release.

## Documentation & Release

- `CHANGELOG.md`: new entry for 0.1.6 in the same commit as the code.
- `README.md`: one line noting frontmatter is preserved and editable.
- `package.json`: version → 0.1.6.
- Follow the existing release-commit pattern used for prior versions.

## Acceptance Criteria

- [ ] Opening a file with YAML frontmatter shows a collapsed frontmatter panel
      and the body in the editor, with no thematic-rule corruption.
- [ ] Editing only the body and saving leaves the frontmatter block byte-identical.
- [ ] Editing the frontmatter panel and saving updates only the block; the body
      is preserved as Milkdown would normally serialize it.
- [ ] A file with no frontmatter behaves exactly as before (no panel).
- [ ] "Insert Frontmatter" (File menu) adds an empty editable block to a file
      that lacks one; the item is disabled when one already exists.
- [ ] Clearing/removing the panel and saving writes the file with no `---` block.
- [ ] `...` closing delimiter is preserved.
- [ ] `vitest` runs `src/frontmatter.test.ts` green.
