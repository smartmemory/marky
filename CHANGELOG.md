# Changelog

## v0.1.8

### Fixed
- Release CI builds again on all platforms. Removed the stale macOS-only
  lockfile and only pass Apple signing environment variables when secrets exist,
  restoring signed updater artifacts and `latest.json` so in-app "Check for Updates"
  works again. Tauri npm packages are pinned to the Rust crates' minor versions
  so CI no longer fails on a version-mismatch check.

## v0.1.7

### Added
- Print support (File > Print… or Cmd+P). Opens the native macOS print panel,
  which includes Save as PDF, Open in Preview, and other PDF options via the
  built-in PDF dropdown. The editor chrome (Find/Replace bar, frontmatter panel)
  is hidden during printing so only the document content renders on the page.
- Reopen the last document on launch by default. Toggle this behavior via
  Marky > Reopen Last Document on Launch. Files opened by the OS take priority.

### Changed
- `npm run release` script for manual macOS releases.

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
