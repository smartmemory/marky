# Changelog

## Unreleased

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
