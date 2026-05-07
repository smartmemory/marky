# Launch copy — drafts for review

## Hacker News (Show HN)

**Title:** Show HN: Marky – Typora-style WYSIWYG markdown editor in a 10MB binary

**Body:**

I've been frustrated paying $15 for Typora and watching Obsidian/Notion get heavier
every release. Marky is a small Tauri 2 app wrapping Milkdown (a ProseMirror-based
WYSIWYG markdown editor) — same editing model as Typora but native binaries are
~10MB instead of 100+MB.

Stack: Tauri 2 (Rust + native webview) + Milkdown 7 + React 19. Targets macOS,
Windows, Linux. v0 ships open/save, full WYSIWYG editing (CommonMark + GFM),
clipboard, history, dark-mode toolbar.

Currently unsigned (working on the cert dance). If you try it on macOS you'll need
right-click → Open the first time.

Source + downloads: https://github.com/smartmemory/marky

Roadmap: keyboard shortcuts, recent files, theme engine, slash commands, PDF/DOCX
export, then optional AI inline commands (BYOK).

Feedback welcome — especially on the editing feel vs. Typora.

---

## r/markdown / r/macapps / r/opensource

**Title:** Marky – open-source, lightweight markdown editor with WYSIWYG editing (Tauri + Milkdown)

**Body:**

Built a small markdown editor that gives you Typora-style WYSIWYG editing in a
~10MB native binary. MIT-licensed, cross-platform, no subscription.

- Tauri 2 shell — Rust core, native webview (not Electron)
- Milkdown editor — ProseMirror-based, true WYSIWYG with CommonMark + GFM
- Open/save .md files, history, clipboard, dark mode

v0 is intentionally minimal. Coming up: keyboard shortcuts, theme engine, file
tree, slash commands, math/Mermaid/Shiki, then PDF/DOCX export.

GitHub: https://github.com/smartmemory/marky

Honest caveats: binaries are unsigned right now (right-click → Open on macOS,
SmartScreen warning on Windows). Linux uses WebKitGTK so rendering may differ
slightly from macOS/Windows.

Would love feedback from people who've used Typora, iA Writer, or Obsidian about
what's missing.

---

## Twitter / X / Bluesky

🚀 Just shipped Marky v0 — open-source markdown editor with Typora-style WYSIWYG
editing in a 10MB binary.

Tauri 2 + Milkdown + React. macOS, Windows, Linux. MIT licensed.

https://github.com/smartmemory/marky

---

## Posting checklist

- [ ] Repo has at least one `vX.Y.Z` release with downloadable binaries
- [ ] README has install instructions and screenshots
- [ ] At least one screenshot or GIF of the editor in use
- [ ] CI green on `main`
- [ ] Issues template enabled
- [ ] License file present (MIT — done)
- [ ] Post to HN at 8-10am ET on a weekday (best traction window)
- [ ] Be online for the first 2 hours to respond to comments
- [ ] Cross-post to relevant subreddits AFTER HN settles, not simultaneously
