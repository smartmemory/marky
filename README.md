# Marky

A fast, lightweight, cross-platform markdown editor. Tauri 2 + Milkdown + React.

**Pitch**: Typora-style WYSIWYG editing in a 10MB binary, $5 instead of $15.

## Stack

- **Shell**: Tauri 2 (Rust + native webviews)
- **Editor**: Milkdown 7 (ProseMirror-based, true WYSIWYG)
- **Frontend**: React 19 + TypeScript + Vite
- **Targets**: macOS, Windows, Linux

## Status

v0 skeleton. Open and save `.md` files; full WYSIWYG editing via Milkdown
(CommonMark + GFM, history, clipboard).

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

### v0 (skeleton — done)
- [x] Tauri 2 shell, React + TS frontend
- [x] Milkdown editor with CommonMark + GFM
- [x] Open / save `.md` files via Tauri dialog + fs plugins
- [x] Basic dark-mode toolbar

### v0.1 (MVP polish)
- [ ] Keyboard shortcuts (⌘O, ⌘S, ⌘N)
- [ ] Recent files
- [ ] Dirty-state warning on close
- [ ] File watcher (live external edits)
- [ ] Better typography defaults (iA Writer-quality)
- [ ] Image paste → `assets/` folder + relative path rewrite

### v0.2 (differentiators)
- [ ] Theme engine + 6 ship-quality themes
- [ ] Export: HTML, PDF (via webview print), DOCX (pandoc shellout)
- [ ] File tree pane + outline pane
- [ ] Slash-command menu
- [ ] Math (KaTeX), Mermaid, syntax highlighting (Shiki)

### v1 (paid)
- [ ] Auto-update (Tauri updater + GitHub Releases)
- [ ] Code signing: macOS notarization, Windows EV cert
- [ ] Distribution: direct download, MAS, Microsoft Store, Flathub
- [ ] AI inline commands (BYOK Claude/OpenAI)
- [ ] Optional sync (folder + git, no server)

## Notes

- The `fs:scope` capability is currently `**` for dev convenience. Tighten
  before shipping — Tauri's dialog-driven access pattern (allow only files
  the user picked) is the correct production model.
- Linux uses WebKitGTK and may have minor rendering differences from macOS
  (WKWebView) and Windows (WebView2). Shipped as best-effort, not pixel-parity.

## License

MIT — see [LICENSE](LICENSE).
