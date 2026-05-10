# Pluggable Renderers — Roadmap

**Status:** PLANNED
**Created:** 2026-05-11
**Owner:** ruze

## Context

Marky currently bundles every renderer (just Mermaid today, ~1MB+ added to the
`.app`). Adding more (KaTeX, Shiki, Graphviz, Vega-Lite, PlantUML) the same way
will balloon install size and parse time for users who never touch those formats.

This roadmap covers turning renderers into approval-gated, on-demand modules
fetched at runtime from a hosted bundle store.

## Feature 1: On-demand renderer loading (PLANNED)

Replace build-time bundling of heavy renderers with runtime fetch + approval.

**Acceptance criteria:**
- [ ] Base app ships without Mermaid/KaTeX/Shiki in main bundle
- [ ] First time a document contains an unrendered block type, app shows an
      approval dialog: *"This document uses {renderer}. Download and render?
      [Always / This doc only / No]"*
- [ ] Approval choice persisted per renderer (Always) and per document (This doc)
- [ ] Renderer bundles fetched from a release host, verified by SHA-256, cached
      to app data dir
- [ ] Offline path: if cached, load from disk with no network; if not cached
      and offline, fall back to showing raw source with a clear status
- [ ] Settings panel lists installed renderers with size, version, last-used,
      and a remove button

### Phase 1a: Infrastructure (PLANNED)
- [ ] Decide bundle host (GitHub Releases vs. self-hosted)
- [ ] Renderer manifest format (name, version, entry URL, sha256, size)
- [ ] Manifest endpoint or static JSON in the repo
- [ ] Tauri command for fetch+verify+cache
- [ ] CSP allowlist for the bundle host
- [ ] Notarization check: confirm dynamic `import()` from app data dir passes
      hardened runtime

### Phase 1b: Approval UX (PLANNED)
- [ ] Approval dialog component (`AskUserQuestion`-style modal in app)
- [ ] Per-renderer "Always allow" setting in app preferences
- [ ] Per-document allowlist stored in app state (not in the .md file)
- [ ] Settings → Renderers panel (list, sizes, remove)

### Phase 1c: Migrate Mermaid (PLANNED)
- [ ] Extract `mermaidPlugin.ts` to load mermaid via dynamic `import()`
- [ ] Replace bundled mermaid dep with a thin loader stub
- [ ] First-load smoke test on a fresh install

## Feature 2: Additional renderers (PLANNED)

Each lands as its own bundle once Feature 1 ships.

### Phase 2a: KaTeX (PLANNED) — math: `$x^2$`, `$$...$$`
### Phase 2b: Syntax highlighting (PLANNED) — Shiki or Prism for fenced code
### Phase 2c: Graphviz/DOT (PLANNED) — `@hpcc-js/wasm`
### Phase 2d: Vega-Lite charts (PLANNED) — ` ```chart` JSON specs
### Phase 2e: Admonitions / callouts (PLANNED) — `> [!NOTE]` (pure CSS, ship in base)
### Phase 2f: Emoji shortcodes (PLANNED) — `:smile:` → 😄 (tiny, ship in base)

## Non-goals
- Running arbitrary user-supplied renderer code (security/sandboxing scope creep)
- Sandboxing renderers in a separate webview (premature)
- Streaming partial bundles (size doesn't warrant it)

## Open questions
- Where to host bundles? GitHub Releases is free and signed-URL-friendly, but
  ties the project to GitHub.
- How to handle renderer version pinning per-document? Probably not needed —
  always-latest with breaking-change opt-out in settings.
- Should "Always" approval be global or per-source (e.g. trust diagrams from
  files in `~/Documents` but not random downloads)?

## Related
- Current bundled implementation: `src/mermaidPlugin.ts`
- Editor wiring: `src/Editor.tsx`
- Doc-change watcher (reload-on-external-edit) already lives in `src/App.tsx:277`
