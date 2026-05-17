# Marky

[![Release](https://img.shields.io/github/v/release/smartmemory/marky?include_prereleases&sort=semver)](https://github.com/smartmemory/marky/releases)
[![License](https://img.shields.io/github/license/smartmemory/marky)](LICENSE)

**A simple, fast markdown viewer and editor that just works.**

Open any `.md` file, read it the way it's meant to be read, edit it the way you'd
edit a doc. No mode switches, no sidebars in the way, no syntax noise. Just text.

Cross-platform (macOS, Windows, Linux), open source, ~10 MB.

## Install

Download the latest release for your platform:
[**Releases →**](https://github.com/smartmemory/marky/releases/latest)

- **macOS** (Apple Silicon / Intel): `.dmg`. Builds are not yet notarized, so
  after dragging Marky to Applications, clear the download quarantine flag once:

  ```bash
  /usr/bin/xattr -dr com.apple.quarantine /Applications/Marky.app
  ```

  (Use the full `/usr/bin/xattr` path — a Homebrew/Python `xattr` earlier in
  your `PATH` may not support the `-r` flag.)

  Then open Marky normally. (Right-click → Open does **not** bypass this on
  current macOS — you'll see a misleading "is damaged" error until you run the
  command above. The app is fine; it's just unsigned.) Once installed, future
  versions auto-update without this step.
- **Windows**: `.msi` — SmartScreen warning expected until we sign.
- **Linux**: `.deb` / `.AppImage`.

Then double-click any `.md` file, or run `marky path/to/file.md` after installing
the optional CLI shim (`sudo sh scripts/install-cli.sh` on macOS).

## What works today

- Double-click a `.md` file → it opens in Marky
- WYSIWYG editing (CommonMark + GFM): bold, italic, headings, lists, quotes, code, links, tables
- File menu: New, Open, Save, Save As, Revert, Recent Files, Show in Finder
- Keyboard shortcuts (⌘N / ⌘O / ⌘S / ⌘⇧S, ⌘B / ⌘I / ⌘K, ⌘1–6 for headings, …)
- Dirty-state tracking — warns before closing or discarding
- File watcher — prompts to reload if the file changes on disk
- Drag a `.md` file onto the window to open it
- Light / Dark / System theme
- Zoom in/out (⌘+ / ⌘− / ⌘0 to reset) — persists across sessions
- Auto-update — checks GitHub Releases on launch (and via Marky → Check for Updates…), installs signed updates with one click
- Help menu: Report a Bug, Suggest a Feature, View on GitHub

## Stack

- **Shell**: Tauri 2 (Rust + native webviews)
- **Editor**: Milkdown 7 (ProseMirror-based, true WYSIWYG)
- **Frontend**: React 19 + TypeScript + Vite
- **Targets**: macOS, Windows, Linux

## Run

```bash
npm install
npm run tauri dev
```

First run will compile the Rust dependencies — expect 3-5 minutes.

## Build

```bash
npm run tauri build
```

Outputs:
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/`
- Linux: `src-tauri/target/release/bundle/{deb,appimage}/`

## Roadmap

### v0.1 (shipped)
- [x] Tauri 2 shell, React + TS frontend
- [x] Milkdown editor with CommonMark + GFM
- [x] Open / save `.md` files via native dialogs
- [x] Keyboard shortcuts (⌘N/O/S/⇧S, ⌘B/I/K, ⌘1–6, …)
- [x] Recent files menu
- [x] Dirty-state warning on close / discard
- [x] File watcher — reload prompt on external edits
- [x] Drag-and-drop to open
- [x] Light / dark / system theme
- [x] Help menu — bug report and feature suggestion

### v0.2 (next)
- [ ] Better typography defaults (iA Writer-quality)
- [ ] Image paste → `assets/` folder + relative path rewrite

### v0.2 (differentiators)
- [ ] Theme engine + 6 ship-quality themes
- [ ] Export: HTML, PDF (via webview print), DOCX (pandoc shellout)
- [ ] File tree pane + outline pane
- [ ] Slash-command menu
- [ ] Math (KaTeX), Mermaid, syntax highlighting (Shiki)

## Notes

- The `fs:scope` capability is currently `**` for dev convenience. Tighten
  before shipping — Tauri's dialog-driven access pattern (allow only files
  the user picked) is the correct production model.
- Linux uses WebKitGTK and may have minor rendering differences from macOS
  (WKWebView) and Windows (WebView2). Shipped as best-effort, not pixel-parity.

## License

MIT — see [LICENSE](LICENSE).
