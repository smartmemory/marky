<!--
Prior-art check (2026-10-13, before writing):
- `ls docs docs/features ROADMAP.md`: no `docs/features/` folder and no ROADMAP.md existed. Existing planning docs:
  `docs/plans/2026-05-11-pluggable-renderers-roadmap.md` (the open "on-demand rendering" item),
  `docs/superpowers/specs/2026-06-25-frontmatter-handling-design.md`, `docs/superpowers/plans/2026-06-25-frontmatter-handling.md`.
- `grep -niE 'share|export|copy|clipboard|upload|collab|sync|http|fetch\(|url' src/*.ts src/*.tsx src-tauri/src/*.rs`:
  no share, export, upload or collaboration code. The only network paths are the updater (GitHub Releases) and
  `openUrl` in `src/App.tsx:444,614,620,626`. Print (`src/App.tsx:647`, `window.print()`) is the only "export".
- `grep -l @tauri-apps src/*.ts src/*.tsx`: only `src/App.tsx`. The editor (`src/Editor.tsx`) and its plugins are platform-free.
- npm registry (2026-10-13): `@milkdown/plugin-collab` 7.22.3 (peer deps yjs, y-protocols, y-prosemirror), yjs 13.6.33,
  y-prosemirror 1.3.7, `@hocuspocus/server`/`provider` 4.7.1, y-indexeddb 9.0.12, `@automerge/prosemirror` 0.2.0.
  Installed `@milkdown/core` is 7.22.2 (`node_modules/@milkdown/core/package.json`).
- Fix round 1 (2026-10-13, after review r1): re-read every file:line below at HEAD f3e3dbc; read `@hocuspocus/server` and
  `@hocuspocus/provider` 4.7.1 from their npm tarballs (read-only mode, scope message, hooks); read the Hocuspocus
  provider overview page (provider compatibility). Nothing installed.
-->

# SHARE-1: Online sharing and collaborative editing (design)

**Status:** PLANNED (design only, nothing built)
**Created:** 2026-10-13
**Feature ID:** SHARE-1

## Related Documents

- Plan: [plan.md](plan.md)
- Contract (draft, frozen in plan step 0.2): [share-contract.json](share-contract.json)
- Roadmap row: [../../../ROADMAP.md](../../../ROADMAP.md)
- Prior art, shares the "Marky talks to a server we host" questions (host, pinning, approval scope):
  [Pluggable Renderers roadmap, Feature 1](../../plans/2026-05-11-pluggable-renderers-roadmap.md)
- Frontmatter model this feature must carry through sync:
  [frontmatter design](../../superpowers/specs/2026-06-25-frontmatter-handling-design.md)

## Goal

From an open document, the user picks **File > Share…**, gets a link, and sends it. Anyone with the link can read
the document (view link) or edit it live with them (edit link), in Marky or in a browser. Edits merge without
"which version wins" dialogs, and working offline is safe.

## What exists today (facts at HEAD f3e3dbc)

| Fact | Evidence |
|---|---|
| Editor is Milkdown 7 (ProseMirror) with `@milkdown/plugin-history` for undo | `src/Editor.tsx:4` (import), `:44` (`.use(history)`), `package.json` |
| Document state is three React values: `body` (markdown), `frontmatter` (string or null), `closeDelim` | `src/App.tsx:105-107` |
| Save serialises with `joinFrontmatter(frontmatter, body, closeDelim)` and writes the file | `src/App.tsx:523-545` |
| The editor is remounted (`editorKey`) on load, new, revert and external reload | `src/App.tsx:361,484,579,703` |
| External-change watcher prompts "Reload / Keep mine" when the file changes on disk | `src/App.tsx:665-718` |
| Frontmatter is edited in a plain `<textarea>`, outside the editor | `src/FrontmatterPanel.tsx:54` |
| Mermaid renders as a node view over `code_block`, `securityLevel: "strict"`, then an async render sets the SVG via `innerHTML` and runs `bindFunctions` | `src/mermaidPlugin.ts:11-15` (strict at `:13`), render `:87-99` (`innerHTML` `:98`, `bindFunctions` `:99`) |
| Raw HTML in markdown renders as text, not markup (`span.textContent`) | `node_modules/@milkdown/preset-commonmark/lib/index.js:1572-1584` (`span.textContent` at `:1579`) |
| Webview has **no CSP** and fs scope `**` with write permission | `src-tauri/tauri.conf.json:24` (`"csp": null`), `src-tauri/capabilities/default.json:25` (`fs:allow-write-text-file`), `:28-29` (`fs:scope` `**`) |
| Only `src/App.tsx` imports Tauri APIs | `grep -l @tauri-apps src/*.ts src/*.tsx` |
| Milkdown's collab service installs its own `yUndoPlugin` and binds Mod-z / Mod-y / Mod-Shift-z | `@milkdown/plugin-collab@7.22.3` `src/collab-service.ts:110-123` (read from `npm pack @milkdown/plugin-collab@7.22.3`) |
| Collab service seeds an empty shared doc from markdown via `applyTemplate` | same file, `applyTemplate` at `:190` |

## Options considered

### Sync model

| Option | What it is | Offline | Fit with Marky | Verdict |
|---|---|---|---|---|
| **A. CRDT: Yjs** via `@milkdown/plugin-collab` + `y-prosemirror` | Every client holds the full doc; edits merge by math, a server only relays and stores | Strong: edits queue locally and merge on reconnect | Official Milkdown binding, same major version as ours (7.22.x). Presence cursors come free (`yCursorPlugin`) | **Recommended** |
| B. CRDT: Automerge (`@automerge/prosemirror`) | Same idea, different library | Strong | Binding is 0.2.0, no Milkdown integration; we would write the glue | Rejected: young binding, more glue for the same result |
| C. OT: `prosemirror-collab` + central authority (or ShareDB) | Server orders every step; clients rebase | Weak: long offline edits rebase badly or are rejected | Built into ProseMirror, but needs a stateful authority server and our own persistence | Rejected: worse offline story, more server logic |
| D. File sync (shared Dropbox/iCloud/git folder) | Each person edits their own copy of the file; the sync tool moves files | Each copy is offline, conflicts become duplicate files | Already "works" via the external-change prompt (`src/App.tsx:665-718`), but that prompt is all-or-nothing ("Reload / Keep mine") | Rejected as the feature: no live editing, conflicts lose work. Kept as what people do today |
| E. Peer-to-peer Yjs (`y-webrtc`) | Browsers connect directly, server only introduces them | Only while someone is online; no async hand-off | No storage server, but still a signalling server and TURN for NATs | Rejected: a shared link must work when the owner's laptop is closed |

**Decision: A.** Yjs is the only option with a maintained Milkdown binding, real offline merging, and a stock
server (Hocuspocus). Markdown is still the file format: the shared doc holds the ProseMirror tree, and Marky
serialises it to markdown on Save exactly as it does today (Milkdown already normalises markdown on every edit).

### Where the shared document lives (hosting)

| Option | Monthly cost (order of magnitude, unverified) | Ops | Data location |
|---|---|---|---|
| **A. Self-hosted Hocuspocus** (Node, SQLite or Postgres persistence) in one container on a server we already run | a share of an existing VM | we patch and back it up | ours |
| B. Managed Yjs host (Y-Sweet / Jamsocket, Liveblocks) | per-connection or per-MAU pricing | none | vendor |
| C. Cloudflare Durable Objects (`y-partyserver`) | usage-based, low at our scale | low, but a new platform | Cloudflare |

**Recommendation: A.** This is a cost and data-location call, so it is Question Q1.

**Portability is limited, and that is a trade-off of A.** The contract pins the wire protocol to Hocuspocus
(`RelayAuth.transport`), and both clients use `HocuspocusProvider`. The Hocuspocus provider overview says it is not
compatible with other y-providers since v2 (it multiplexes documents over one socket), and that server
implementations other than Hocuspocus will probably not work with its provider
([provider overview](https://tiptap.dev/docs/hocuspocus/provider/overview), read 2026-10-13). So moving to B or C
later replaces the client provider in the desktop app and the web client as well as the relay, or needs a gateway
that speaks Hocuspocus, which is self-hosted infrastructure again. That migration is **unsized and unverified**, and
it is why Q1 must be answered before the relay is built (plan.md Questions).

### Who can open a link (auth and link permissions)

- **v1: capability links, no accounts.** Creating a share returns three secrets: a `view` token, an `edit` token and
  an `owner` token (kept only in the owner's Marky app data, never in a link). Shapes: `ShareCreateResponse`,
  `RelayAuth` in the contract.
- **Every token is bound to one room.** The relay looks a token up by the pair (room id, token hash), never by the
  hash alone, on the WebSocket and on every owner route. Room A's tokens, of any role, open nothing in room B
  (contract `RelayStore`, `RelayAuth.roomBinding`, `OwnerRouteAuth`; tests in plan 3.9).
- **Read-only is enforced at both ends.** The server marks a `view` connection read-only (Hocuspocus
  `connectionConfig.readOnly`), which refuses its updates and tells the client its scope (`readonly` or
  `read-write`). The client starts read-only and becomes editable only on a `read-write` scope (contract
  `ClientMode`), so a viewer's screen never drifts from the shared document.
- The owner can **revoke** (kills both links, room deleted after the grace period) or **rotate** one link (new token,
  old one stops working). Both need the `owner` token.
- Tokens are 128-bit random, URL-safe. A link carries the room id in the path and the token in the **URL fragment**
  (`#t=`), so it never reaches server access logs or `Referer` headers.
- Accounts (sign-in, "shared with me" list) are out of scope for v1 (Question Q3).

### Privacy of the shared content

- v1: TLS in transit, the relay stores Yjs updates per room, and the relay operator can read shared documents. The
  Share dialog says so in one sentence.
- "Encrypted on disk" (data dir and backups) is promised only after plan step 7.3 proves it on the chosen host with
  recorded evidence. If the host cannot meet it, the sentence is reworded to what is true and the owner approves it.
  SQLite itself is not encrypted; the protection is the volume and the backup tool.
- Option kept for later: end-to-end encryption (key in the URL fragment, relay stores ciphertext only, compaction done
  by clients). It is a real selling point for a notes editor and would roughly double the relay and sync work (an estimate, not sized). Question Q2, which forces a replan if picked.
- Retention: a room with no connections for N days is deleted (Question Q4). Revoke deletes after a short grace period.

### Offline

- Marky persists each shared doc's Yjs state locally (app data dir, one file per room, keyed by `roomId`) so a shared
  doc reopens offline and queued edits sync on reconnect. Browser clients use `y-indexeddb`.
- The owner's `.md` file stays the owner's own copy. Save writes it as today. "Shared" never silently rewrites a
  file on disk.

### Conflict UX

CRDT merges never ask "which version wins", so the UX job is to make merges visible, not to resolve them:

1. **Status pill** in the title area: Live (n people) / Offline, changes will sync / Read-only / Link revoked.
2. **Presence**: collaborator cursors and names (`yCursorPlugin`, awareness shape `AwarenessUser` in the contract).
3. **After a long offline stretch** (more than 5 minutes or more than 50 local edits), on reconnect Marky keeps a
   snapshot of the user's pre-merge text and shows "Merged with N collaborator changes. [Show my offline version]",
   which opens that version read-only in a new window. Nothing is lost, nothing blocks.
4. **The owner's file changed on disk while shared** (the watcher at `src/App.tsx:665-718`): the prompt becomes
   "Push the disk version into the shared document / Keep shared version". Push replaces the shared content in
   one transaction (plan 4.10). Default button is Keep.
5. **Frontmatter** syncs as a separate `Y.Text` (name in contract `YDocLayout`), applied as a minimal prefix/suffix
   diff of the textarea value, so two people editing different keys both survive. One component,
   `src/share/SharedDocView.tsx`, binds the frontmatter panel and the editor to the shared doc for both the desktop
   and the browser client, so neither client can edit a local copy that never syncs (plan 2a.6).
6. **Switching documents** (Open, New, Recent, Back/Forward, Open Shared Link) closes the old shared session only
   after the new document loads, so edits and Save always go to the document on screen (contract `ClientSession`,
   plan 2b).

### Where the code lives

- **Relay:** new top-level `relay/` folder in this repo (Node, Hocuspocus), so the contract, the app and the relay
  version together.
- **Web client:** a second Vite entry (`web.html` + `src/web/main.tsx`) that renders `MarkyEditor` in shared mode
  with no file menu. Feasible because only `src/App.tsx` imports Tauri.
- **Desktop:** a `src/share/` module (provider, local persistence, status, `SharedDocView`, session lifecycle) wired
  into `src/App.tsx` and `src/Editor.tsx`. `src/App.tsx` is already 1,238 lines, so the share UI goes in new components, not inline.

## Security (must hold before any network code ships)

Sharing is the first feature that puts **someone else's content** into a webview that can write any file
(`fs:scope` `**`). One script injection in a shared doc would be arbitrary file write on the owner's machine.

- [ ] A CSP baseline replaces `"csp": null`: `default-src 'self'`, no remote scripts, `connect-src` limited to the
      app itself; the relay origin is added when network code lands (plan 1.3, 4.1, 7.2). Checked in a bundled
      webview, not only in dev (plan 1.4).
- [ ] Mermaid stays `securityLevel: "strict"` (`src/mermaidPlugin.ts:13`) and a test mounts the real editor, waits
      for the async mermaid render to reach its `innerHTML` sink, and shows hostile diagrams, raw HTML, and
      `javascript:` links and images execute nothing (plan 1.6).
- [ ] The same hostile fixtures delivered as shared Yjs state, plus hand-built shared nodes that skip the markdown
      parser, execute nothing (plan 2a.8, 5.5).
- [ ] Raw HTML keeps rendering as text (preset-commonmark html node), pinned by the same tests.
- [ ] Cmd+click on a **local file** link inside a shared doc asks before opening (a collaborator could point it at any
      path). External links keep today's behaviour.
- [ ] The relay enforces `view` = read-only server-side (a view client's update is dropped and logged), rate-limits
      connects per IP, caps doc size (contract `Limits`).
- [ ] A token only opens its own room: two-room denial tests over WS and every owner route (plan 3.9).
- [ ] A viewer's client is read-only too, so its copy never diverges (plan 2a.9, 4.12, 5.5).
- [ ] Web client pages send `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

## Out of scope (v1)

- Accounts, "shared with me" lists, comments, suggestion mode, version history browser.
- Sharing folders or multiple files. One link = one document.
- Opening share links straight into the desktop app via a `marky://` handler (needs `tauri-plugin-deep-link`, not in
  `src-tauri/Cargo.toml`). v1: **File > Open Shared Link…** pastes a link.
- End-to-end encryption (Q2), unless the owner picks it for v1.

## Questions

Owner calls are listed in the plan's `## Questions` (Q1 to Q6) with options and a recommendation. None are
decided inside this doc.
