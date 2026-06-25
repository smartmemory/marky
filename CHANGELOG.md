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

### Added
- Find / Replace (Cmd+F to find, Cmd+Alt+F to replace). Highlights all matches
  with a match counter, Enter / Shift+Enter to step through results, a
  match-case toggle, and Replace / Replace All. Esc closes the bar.

### Fixed
- New / blank documents were not editable: the editor mounted without focus and
  the editable area collapsed to a single line, so there was no cursor and
  nowhere to click. The editor now focuses on mount (and after File → New) and
  fills the page, so a new file is immediately editable and can be saved.

### Changed
- Release workflow now supports Apple code signing + notarization when `APPLE_*`
  secrets are configured (falls back to unsigned builds otherwise).
- README documents the correct `xattr -dr com.apple.quarantine` workaround for
  unsigned macOS builds (the old "right-click → Open" advice no longer works).

## v0.1.4

### Fixed
- Window would not close (Close / Cmd+W did nothing) once a document was open. The `core:window:allow-close` / `allow-destroy` capabilities were missing, so Tauri silently denied `window.close()`.

## v0.1.3
- Zoom shortcuts (Cmd +/-)
- Auto-updater via GitHub Releases
- Inline Mermaid diagram rendering
</content>
</invoke>
