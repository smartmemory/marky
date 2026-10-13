<!--
Prior-art check (2026-10-13, re-run for fix round 1): same greps as design.md's header. No share/collab/export code
exists. The related open item is the Pluggable Renderers roadmap (docs/plans/2026-05-11-pluggable-renderers-roadmap.md,
RENDER-1), which raises the same "host we run, CSP allowlist, approval scope" questions. This plan sets a CSP BASELINE
(step 1.3) that RENDER-1 will later extend with its bundle host. It does NOT complete RENDER-1's Phase 1a "CSP allowlist
for the bundle host" item: that item stays open until RENDER-1 picks its host and verifies dynamic loading.
Test setup today: vitest ^4.1.9 (package.json), pure-logic tests only (src/frontmatter.test.ts, links.test.ts,
navHistory.test.ts, startup.test.ts), no `test` block and no DOM environment in vite.config.ts.
Hocuspocus 4.7.1 facts below were read from the published npm tarballs (server src/MessageReceiver.ts,
src/ClientConnection.ts, src/OutgoingMessage.ts; provider src/HocuspocusProvider.ts, src/types.ts), not installed.
-->

**Owner answers (recorded 2026-10-14, overnight ruling by the owner's chat session under owner-delegated authority; owner to confirm):**
- Q1 = (a): self-host the relay (Hocuspocus) on a server we already run. No new vendor.
- Q2 = (a): in v1 the server operator can read shared documents, and the Share dialog says so plainly. End-to-end
  encryption is claimed only after it is built and proven.
- Q3-Q6: open. Step 0.1 still needs an explicit Q3 answer before Phase 0 completes.


# SHARE-1: Online sharing and collaborative editing (plan)

**Status:** PLANNED (nothing built). Revised 2026-10-13 after review round 1 (R1-R9).
**Created:** 2026-10-13
**Feature ID:** SHARE-1

## Related Documents

- Design (options, decision, security): [design.md](design.md)
- Contract (DRAFT until step 0.2): [share-contract.json](share-contract.json)
- Roadmap row: [../../../ROADMAP.md](../../../ROADMAP.md)
- Shares the CSP baseline and hosting questions with: [Pluggable Renderers roadmap (RENDER-1)](../../plans/2026-05-11-pluggable-renderers-roadmap.md)

## Shape

Recommended in design.md: **Yjs CRDT through `@milkdown/plugin-collab`, a small self-hosted Hocuspocus relay,
room-bound capability links (view / edit), a browser client for people without Marky.** Both clients talk the
Hocuspocus protocol through `HocuspocusProvider` (contract `RelayAuth.transport`). That protocol is a lock-in: moving to
a managed host (Y-Sweet, Liveblocks, Cloudflare) is **not** a relay-only change. It replaces the client provider in
`src/share/client.ts` and the web entry too, or needs a gateway that speaks Hocuspocus. That migration is unsized and
unverified (design.md, Hosting). Q1 picks the host before Phase 3 starts for this reason.

## Order and size

Sizes are authoring estimates (S under half a day, M about a day, L two to three days), not dates. Owner gates are
listed per phase. The full gate policy is the table under `## Questions`; this table and that one say the same thing.

| Phase | What | Size | Depends on | Owner gate | Ships to users? |
|---|---|---|---|---|---|
| 0 | Owner gate, freeze contract, two spikes | S | none | Q2, Q3 answered (no default) | no |
| 1 | Security hardening: DOM test env, CSP baseline, sink-level XSS tests, link-confirm predicate | L | none | none | yes, as a normal release (CSP only; the rest is tests and an unused predicate) |
| 2a | Shared document view: editor + frontmatter bound to a `Y.Doc`, read-only mode, no network | L | 0, 1.1, 1.6 | none | no (dev flag) |
| 2b | Session lifecycle: one switch point for every document change | M | 2a | none | no (dev flag) |
| 3 | Relay server with room-bound tokens | L | 0 | Q1 answered (a) before start | no |
| 4 | Desktop share and join | L | 1, 2b, 3 | none | yes, behind a Settings toggle until 6 |
| 5 | Browser client | M | 1.6, 2a, 3 | none | yes, with 4 |
| 6 | Presence and offline merge UX | M | 4 | none | yes |
| 7 | Deploy relay and web client | M | 3, 4, 5 | Q1 (server), Q5, Q6 answered; Q2 storage gate 7.3 passes | owner-gated |

Phase 1 needs nothing from any other phase or from the owner, so it can start now. Phases 2a and 3 run in parallel
once 0 is done. Total is roughly 3 to 4 weeks of authoring at these estimates: a hint, not a commitment.

## Phase 0: Owner gate, contract, spikes

- [ ] 0.1 Owner gate. Q2 and Q3 have explicit owner answers recorded at the top of this file (date + answer). They have
      no default because the alternatives change the architecture. **If Q2 = (b) end-to-end encryption or Q3 = (b)
      accounts: stop.** Revise design.md, share-contract.json, the phase list and the sizes, and send the revised plan
      back to plan review before any step below. Q4 unanswered at this point = the recommended values.
- [ ] 0.2 Freeze `docs/features/SHARE-1/share-contract.json` (existing, DRAFT): set `_status` to FROZEN, apply the Q4
      answer to `Limits` (config defaults, see `Limits._note`), keep `contractVersion: 1`. `ShareLink.format` keeps the
      `{shareHost}` placeholder: the real host is a deploy setting chosen in Phase 7 (Q5), not a contract value.
      Check: `python3 -c 'import json;d=json.load(open("docs/features/SHARE-1/share-contract.json"));assert d["_status"].startswith("FROZEN")'` exits 0.
- [ ] 0.3 Spike: add `@milkdown/plugin-collab`, `yjs`, `y-prosemirror`, `y-protocols` at versions matching the
      installed Milkdown (`node_modules/@milkdown/core` is 7.22.2, plugin-collab latest is 7.22.3; package.json allows
      `^7.5.8`). Record in `docs/features/SHARE-1/spike-notes.md` (new) whether all `@milkdown/*` must move to one
      version and whether `npm run build` and `npm test` stay green (paste the last line of each).
- [ ] 0.4 Spike: with collab on, check that the native **Edit > Undo** menu item (`PredefinedMenuItem` Undo,
      `src/App.tsx:890`) undoes through `yUndoPlugin`, not `@milkdown/plugin-history`. Unverified today. Record the
      result in `spike-notes.md`. If it does not route, Phase 2a adds explicit Undo/Redo `MenuItem`s that call
      y-prosemirror's `undo`/`redo` (step 2a.9).

## Phase 1: Security hardening (before any network code)

No step in this phase uses shared-document state, the relay or an owner answer.

- [ ] 1.1 DOM test environment: `package.json` (existing) adds `happy-dom` as a dev dependency. Every DOM test file is
      named `*.dom.test.ts(x)` and starts with the docblock `// @vitest-environment happy-dom`, so existing tests stay in
      node and no `vite.config.ts` change is needed (vitest 4 removed `environmentMatchGlobs`; the per-file docblock
      still working in vitest 4 is **unverified**, checked by this step). Check:
      `npx vitest run src/env.dom.test.ts` (new, one test asserting `typeof document !== "undefined"`) passes, and
      `grep -L '@vitest-environment happy-dom' $(find src -name '*.dom.test.ts*')` prints nothing.
- [ ] 1.2 Probe, recorded in `spike-notes.md`: does `mermaid.render` produce an `<svg>` under happy-dom (it needs SVG
      layout APIs such as `getBBox`; **unverified**)? If yes, all Mermaid sink replays (1.6, 2a.8, 5.5) run under
      happy-dom. If no, all of them run in a real browser via `@vitest/browser` + Playwright Chromium as
      `*.browser.test.ts(x)`, and this step adds
      that runner and a `test:browser` script to `package.json` (existing). Either way, 1.6's control row must reach
      the SVG sink or the test fails.
- [ ] 1.3 `src-tauri/tauri.conf.json` (existing, `"csp": null` at `:24`): set a CSP baseline: `default-src 'self'`,
      `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (only if Milkdown or mermaid need it; say which in
      `spike-notes.md`, JSON has no comments), `img-src 'self' data: https: asset:`, `connect-src 'self'` plus the IPC
      sources Tauri 2 needs. **No relay origin here**: Phase 4 (4.1) adds the dev relay origin and Phase 7 (7.2) the
      deployed one. Whether the updater needs a `connect-src` entry is **unverified** (its HTTP may run in Rust); add it
      only if 1.4 shows a violation.
- [ ] 1.4 Checks recorded in `spike-notes.md`, each with the console output pasted:
  - [ ] `npm run tauri dev`: open a doc with mermaid, images (local, `data:`, `https:`), tables and links; zero CSP
        violations in the webview console.
  - [ ] Bundled-webview check: `npx tauri build --debug` (bundled assets, same CSP, devtools on). In its console:
        `fetch("https://example.com")` is blocked by CSP, an injected `<script src="https://example.com/x.js">` is
        blocked, and the 1.6 fixture document passes the same render, callback-click and load/error/link-event
        assertions in the bundled webview, including 1.6's cleanup on failure.
  - [ ] Tauri access boundary unchanged: `git diff --exit-code f3e3dbc -- src-tauri/capabilities/` exits 0 (SHARE-1
        never widens capabilities; `fs:scope` `**` stays as today, see design.md Security).
- [ ] 1.5 `src/links.ts` (existing): new pure function `needsFileLinkConfirm(target: LinkTarget, docOrigin: "local" |
      "shared"): boolean`, true only for `kind: "file"` with `docOrigin: "shared"`. Phase 1 adds the function only; it
      is wired into `handleFollowLink` (`src/App.tsx:439`) in step 4.6, when shared documents exist. Test
      `src/links.test.ts` (existing), one table, one row per `LinkTarget.kind` x origin that matters: file+shared true,
      file+local false, external+shared false, anchor+shared false, unsupported+shared false.
- [ ] 1.6 `src/security.dom.test.tsx` (new; `.browser.test.tsx` if 1.2 says so): mounts the real `MarkyEditor`
      (`src/Editor.tsx`, all plugins) per fixture row, waits until every mermaid preview holds an `<svg>` or a
      `.marky-mermaid-error` (render path `src/mermaidPlugin.ts:87-99`, SVG assigned via `innerHTML` at `:98`,
      `bindFunctions` at `:99`), waits for `bindFunctions` to settle, then runs the shared fixture event actions
      and assertions below. Fixture table, one row each, every payload attempts to set `window.__xss = 1`:
  - [ ] control: a benign `graph TD; A-->B` mermaid block. Assert its preview contains an `<svg>` (proves the sink ran;
        the test fails if no row reaches it)
  - [ ] raw inline HTML `<img src=x onerror="window.__xss=1">`
  - [ ] raw block HTML `<script>window.__xss=1</script>`
  - [ ] raw HTML `<svg onload="window.__xss=1">`, `<iframe srcdoc="<script>parent.__xss=1</script>">`
  - [ ] raw HTML `<a href="javascript:window.__xss=1">x</a>` and markdown `[x](javascript:window.__xss=1)`
  - [ ] markdown image `![x](javascript:window.__xss=1)` and `![x](x" onerror="window.__xss=1)`
  - [ ] mermaid callback: complete diagram `graph TD; A-->B; click A markyXssProbe "x"`. Before mount, define
        `window.markyXssProbe` as a tracked callback that sets `window.__xss = 1`. Require this fixture's `<svg>`
        and A node to exist, wait for `bindFunctions` to settle, then perform a real click on A. Assert the callback
        was never invoked and `window.__xss` remains undefined (a render error does not pass this row).
  - [ ] mermaid link: complete diagram `graph TD; A-->B; click A href "javascript:window.__xss=1" "x"`
  - [ ] mermaid node label: complete diagram `graph TD; A["<img src=x onerror=window.__xss=1>"]-->B`

  Shared event actions per relevant fixture: exercise image/SVG load and image error events, iframe load when
  present, and ordinary plus modifier (Ctrl/Meta) clicks on rendered HTML/markdown links and Mermaid link nodes.
  After each event settles, assert the probe invocation count is zero and `window.__xss` is undefined. Assertions
  per row, after render and events settle: no element inside the editor root has an attribute whose name starts
  with `on`; no `script`, `iframe`, `object` or `embed` element exists in the editor root; no `href`, `src` or
  `xlink:href` value starts with `javascript:`; `classifyLink(href, null)` for every rendered link is never `external`
  for a `javascript:` or `data:` href. Export the fixture table and the same render waits, event actions and
  assertions from `src/security.fixtures.ts` (new). Direct markdown (1.6), shared-state (2a.8) and web delivery
  (5.5), plus the bundled-webview check (1.4), all use this gate. Before each replay, save the globals, clear the
  sentinel and install the tracked probe. Every replay uses `try/finally` cleanup on failure too: unmount the editor,
  dispose owned docs/providers/observers/persistence and test state, and restore or remove `window.markyXssProbe`
  and `window.__xss`. All Mermaid sink replays follow 1.2's runner decision.
- [ ] 1.7 CHANGELOG.md (existing) line under the next version: CSP added, XSS sink tests added.

## Phase 2a: Shared document view (no network)

- [ ] 2a.1 `src/Editor.tsx` (existing): new optional prop `shared?: { doc: Y.Doc; awareness?: Awareness; editable:
      boolean }`. When set: no `.use(history)` (today `src/Editor.tsx:44`), `.use(collab)` instead, bind the doc's
      `prosemirror` fragment (contract `YDocLayout`), `connect()`, and set `editorViewOptionsCtx` (exported by
      `@milkdown/core`, `node_modules/@milkdown/core/lib/index.js:444`) `editable: () => shared.editable`. When unset,
      behaviour is unchanged (existing tests pass untouched).
- [ ] 2a.2 `src/share/readOnlyGuard.ts` (new): ProseMirror plugin, active when `editable` is false, whose
      `filterTransaction` rejects every `docChanged` transaction not produced by y-prosemirror's sync plugin (remote
      updates). This makes read-only fail closed for programmatic commands (`callCommand`, find/replace), not just
      typing. How y-prosemirror tags its own transactions (`ySyncPluginKey` meta) is **unverified**; this step confirms
      it and records the file:line in `spike-notes.md`.
- [ ] 2a.3 `src/share/ydoc.ts` (new): `seedDoc(doc, {frontmatter, body, closeDelim})` and
      `readDoc(doc) -> {frontmatter, body, closeDelim}` over contract `YDocLayout`; `applyTextDiff(ytext, next)`
      writes a minimal prefix/suffix diff; `setFrontmatterPresent(doc, present)` sets `meta.hasFrontmatter` and clears
      or seeds `frontmatter` in one transaction.
- [ ] 2a.4 `src/share/ydoc.dom.test.ts` (new), table-driven over the fixtures already used by
      `src/frontmatter.test.ts` plus a GFM table, a task list and a mermaid block: `seedDoc` then `readDoc` then
      `joinFrontmatter` equals what today's Save (`src/App.tsx:523-545`) writes for the same input (same
      normalisation, not byte-identical to the source file).
- [ ] 2a.5 Same test file: two `Y.Doc`s exchange updates after concurrent edits to different frontmatter keys; both
      keys survive. Concurrent edits to the same paragraph converge to identical `readDoc` output on both sides.
- [ ] 2a.6 `src/FrontmatterPanel.tsx` (existing, props `value`, `onChange`, `onRemove` at `:4-10`): add
      `readOnly?: boolean` (textarea `readOnly`, Remove button hidden). `src/share/SharedDocView.tsx` (new): the ONE
      component both clients render for a shared document. It renders `FrontmatterPanel` and `MarkyEditor` (`shared`
      prop) bound to the same `Y.Doc`:
  - [ ] panel value comes from observing `frontmatter` (`Y.Text`) and `meta` (`hasFrontmatter`, `closeDelim`); a
        remote change re-renders the panel without remounting the editor
  - [ ] panel `onChange` calls `applyTextDiff`; `onRemove` calls `setFrontmatterPresent(doc, false)`
  - [ ] an `insertFrontmatter()` handle calls `setFrontmatterPresent(doc, true)` with `closeDelim` `---` (the shared
        equivalent of `handleInsertFrontmatter`, `src/App.tsx:639-644`)
  - [ ] `editable: false` sets the editor read-only (2a.1), the guard (2a.2), the panel `readOnly`, and makes
        `insertFrontmatter` and every frontmatter write a no-op that logs a WARNING
- [ ] 2a.7 `src/share/SharedDocView.dom.test.tsx` (new): two mounted `SharedDocView`s on two `Y.Doc`s wired to
      exchange updates. Edits go through the real UI (textarea `input` events, editor text input), not helper calls.
      One table, one row each: edit a key on A; add different keys on A and B concurrently; remove the block on B;
      insert the block on A when absent; a `...` closing delimiter survives an edit. After each row: both panels show the
      same textarea value and both `joinFrontmatter(readDoc(doc))` are equal.
- [ ] 2a.8 `src/share/security.dom.test.tsx` (new; browser runner if 1.2 says so): hostile content delivered as shared
      state. Replays every row of `src/security.fixtures.ts` by seeding a second `Y.Doc` with `seedDoc` and applying its
      update to a mounted `SharedDocView`, plus hand-built `Y.XmlFragment` rows that bypass the markdown parser: an
      `image` element with `src` `javascript:window.__xss=1`, a `link` mark with that `href`, an element carrying an
      extra `onerror` attribute, and an element named `script` (not in the schema). Use 1.6's exported render waits,
      event actions, callback-click assertions and cleanup on failure; all Mermaid sink rows follow 1.2's runner
      decision. What y-prosemirror does with unknown nodes or attributes is **unverified**; the test records it and
      must show no script execution and no `on*` attribute either way.
- [ ] 2a.9 Read-only client mode, tested in `src/share/SharedDocView.dom.test.tsx`: with `editable: false`, one row
      per mutation path, each followed by `readDoc` unchanged and zero `Y.Doc` `update` events whose origin is local:
      typing in the body; textarea input in the panel; Remove; `insertFrontmatter()`; each `callCommand` in the Format
      and Heading menus (`src/App.tsx` menu ids `fmt-*`, `heading-*`); `replaceAll` / `replaceCurrent`; Undo and Redo;
      paste. A remote update from an editable doc still appears in the read-only view (last row).
- [ ] 2a.10 Dev-only flag `MARKY_DEV_SHARED=1` opens the current doc in `SharedDocView` against an in-memory `Y.Doc`,
      so 2a and 2b can be exercised by hand before Phase 4. Removed in 4.9.

## Phase 2b: Session lifecycle

Today every document change remounts the editor through `editorKey` (`src/App.tsx:361` in `loadPath`, `:484` New,
`:579` Revert, `:703` external reload). Shared mode must keep one editor alive across remote edits, but a switch to a
different document must still tear the old one down.

- [ ] 2b.1 `src/share/session.ts` (new): `ClientSession` per contract (`ClientSession` in share-contract.json): an
      identity (`local` path, `shared` roomId + shareHost, or `untitled`) plus the resources it owns. `closeSession()`
      flushes local Yjs persistence, then destroys in this order: provider (Phase 4), awareness, `Y.Doc` observers,
      persistence writer, `Y.Doc`. Idempotent.
- [ ] 2b.2 `src/App.tsx` (existing): one `switchDocument(nextIdentity, load)` used by every entry point that changes
      the open document. Sites (from `grep -nE 'setEditorKey|navigateTo\(|loadPath\(' src/App.tsx` at HEAD):
      `loadPath` `:350-365` (reached from `navigateTo` `:369` via Open `:488`, Open Recent `:496`, link follow `:439`,
      drag-drop `:769`; and from history `travelHistory` `:387-414`), New `:472-486`, Revert `:568-583`, Close
      `:585-591` (closes the window), startup reopen `:730-745`, external reload `:690-703`, and Open Shared Link (4.4). Rules:
  - [ ] the target is loaded first; only on success is the old session closed (2b.1), the new one opened, and
        `editorKey` bumped
  - [ ] a cancelled discard prompt (`confirmDiscard`, `:328-335`) or a failed load leaves the old session open, bound and
        editable exactly as before
  - [ ] within one shared session (remote edits, "Push disk version", reconnect) `editorKey` is not bumped
  - [ ] Save / Save As write `joinFrontmatter(readDoc(session.doc))` of the CURRENT session only
- [ ] 2b.3 `src/share/session.dom.test.ts` (new), controller-level with real `Y.Doc`s and a real file in the test's
      temp dir (removed in teardown). One table, one row each:
  - [ ] shared A -> open local B -> type -> Save: B's file holds B plus the typed text; A's doc is unchanged; A's
        session reports closed
  - [ ] shared A -> open shared C -> type: the edit is in C only
  - [ ] shared A -> New -> type: A unchanged
  - [ ] shared A -> open B, discard prompt cancelled: A still open and editable, B not loaded
  - [ ] shared A -> open a missing file: A still open and editable
  - [ ] shared A -> history Back to local B: as the first row
- [ ] 2b.4 Manual check recorded in `spike-notes.md` (App.tsx imports Tauri APIs, so its wiring is checked by hand):
      with `MARKY_DEV_SHARED=1`, run the 2b.3 rows through the real menus and the Back button.

## Phase 3: Relay server

Starts only after Q1 = (a). Hocuspocus 4.7.1 behaviour cited here was read from its npm tarball, not run.

- [ ] 3.1 `relay/` (new): Node package (`relay/package.json`, `relay/src/server.ts`) on `@hocuspocus/server` 4.x with
      SQLite persistence (`@hocuspocus/extension-sqlite`), one process serving `wss /sync`, the REST routes, and the
      static web client (Phase 5). Limits read from env with contract `Limits` values as defaults.
- [ ] 3.2 Token store exactly as contract `RelayStore`: rows hold the SHA-256 of each token (rotate revokes the old row and adds a new one),
      never plaintext. Every lookup is by `(roomId, tokenHash)`, never by `tokenHash` alone (contract
      `RelayAuth.roomBinding`).
- [ ] 3.3 REST routes exactly as contract `ShareCreateRequest/Response`, `ShareRotateRequest`, `ShareRevokeRequest`,
      `ShareStatusRequest`, errors as `ErrorBody`. Rotate, revoke and status authorise the bearer token as the
      `owner` row of the `{roomId}` in the path; any other token (including another room's owner token) gets 401
      `unauthorized` with no field from that room and no state change.
- [ ] 3.4 `onAuthenticate`: looks up `(documentName, sha256(token))`. No room with that id: close with
      `CloseCode.roomNotFound`. Room exists but no matching live row (wrong, rotated or other-room token): close with
      `CloseCode.forbidden`. Revoked room: `CloseCode.revoked`. Match: role `view` sets `connectionConfig.readOnly =
      true` (Hocuspocus then refuses that connection's updates, server `src/MessageReceiver.ts:234,276`, and tells the
      client its scope, `src/ClientConnection.ts:556-557`, `src/OutgoingMessage.ts:83-88`).
- [ ] 3.5 View role logging: Hocuspocus drops read-only updates without a hook call, so the relay registers
      `beforeHandleMessage` (server `src/types.ts:176`) and logs a WARNING with `roomId` for each update message on a
      read-only connection (contract `RelayAuth.serverRule`). Which message types reach that hook is **unverified**;
      3.7's view row checks that the WARNING appears.
- [ ] 3.6 Limits from contract `Limits`: doc size (`CloseCode.docTooLarge`), connections per room, connects per IP
      per minute, shares per IP per day (`rate_limited`). Idle expiry and revoke grace run as a sweep every hour.
- [ ] 3.7 `relay/test/golden.test.ts` (new), real server on an ephemeral port, real SQLite in a temp dir removed in
      teardown (pass or fail): create share, two `@hocuspocus/provider` clients with the edit token see each other's
      edit, a view client receives edits and its own edit never reaches the others and produces one WARNING log line,
      the view client's provider reports `authorizedScope` `readonly` and the edit client `read-write` (provider
      `src/HocuspocusProvider.ts:749-753`), rotate closes the old token's connection, revoke closes everything with
      4401, restart the server and the content is still there. Two more rows: the hourly sweep run directly with a
      clock 25 hours after a revoke and 31 days after a room's last activity deletes both rooms' data (design.md
      Retention); and the relay's captured log output for the whole flow contains no token value (design.md says
      tokens never reach logs).
- [ ] 3.8 `relay/test/errors.test.ts` (new), one table, one row per error: bad token, rotated token, revoked room,
      unknown room, oversized doc, rate limit, missing owner token on rotate/revoke, wrong `Authorization` scheme.
- [ ] 3.9 `relay/test/cross-room.test.ts` (new), two real rooms A and B with distinct content. One table, seven rows:
      A's view, edit and owner token each used to connect to B over WS; A's owner token used to rotate B's view link,
      rotate B's edit link, revoke B, and read B's status. Per row:
  - [ ] WS rows close with 4403 and the client's `Y.Doc` for B stays empty (provider never reports `synced`)
  - [ ] REST rows return 401 `unauthorized` whose body has no B field (`connected`, `lastActivityAt`, `sizeBytes`,
        `token`, `url`)
  - [ ] afterwards a client with B's real edit token reads B's original content, B's view, edit and owner tokens
        all still work, B is not deleted, and A is unaffected
- [ ] 3.10 `relay/README.md` (new): run locally, env vars (names only), data dir, backup note.

## Phase 4: Desktop share and join

- [ ] 4.1 `src/share/client.ts` (new): REST calls per contract, `HocuspocusProvider` per room, local persistence of
      Yjs state and `LocalShareRecord` under the app data dir (contract paths). Needs `fs` scope for the app data dir
      only (already covered by `**`; do not widen anything). `src-tauri/tauri.conf.json` (existing): add the dev relay
      origin (`ws://127.0.0.1:<port>`) to `connect-src` for dev builds only; the deployed origin waits for 7.2.
- [ ] 4.2 Client mode (contract `ClientMode`): both desktop and web clients use `ClientMode.transitionTable`
      verbatim, reproduced below. `LocalShareRecord.role` identifies the token role, never offline permission.
      Persist `authenticatedScope` in the desktop record and equivalent web IndexedDB metadata. On refusal,
      disable local mutations immediately and durably invalidate the cache before reload can reopen it. A fresh
      join or legacy record with no authenticated scope stays read-only until successful authentication.

  | Event | authenticatedScope | Mode | Cache action |
  |---|---|---|---|
  | Fresh join (no authenticated cache) | None | readonly | Persist null; ignore LocalShareRecord.role for permission |
  | authenticated scope 'read-write' | read-write | editable | Persist read-write before enabling edits |
  | authenticated scope 'readonly' | readonly | readonly | Persist readonly; cached edit/owner role cannot enable edits |
  | Temporary transport loss (1000 normal closure, 1001 going away, 1006 abnormal closure, network failure or timeout; no authenticated refusal) | Retain last successfully authenticated scope | editable only for read-write; otherwise readonly | Keep cached scope; editors queue offline edits and viewers stay readonly |
  | Offline reload of an existing session | Use persisted authenticatedScope, never role | editable only for read-write; otherwise readonly | A cleared/null scope stays readonly until successful authentication |
  | 4401 revoked / 4403 forbidden / authentication failure | Invalidate | readonly | Disable mutations immediately and persist null before reload; stale role cannot restore edit mode |
  | 4404 roomNotFound | Invalidate | readonly | Persist null; no offline edit permission |
  | 4413 docTooLarge | Invalidate | readonly | Persist null; no offline edit permission until successful authentication |
  | 4429 rateLimited | Invalidate | readonly | Persist null; retry starts readonly until successful authentication |
  | 4426 clientTooOld | Invalidate | readonly | Persist null; compatible client must authenticate before editing |
- [ ] 4.3 `src/share/ShareDialog.tsx` (new): **File > Share…** creates the room (seeded from the open doc via
      `seedDoc`), shows view and edit links with Copy buttons, the privacy sentence from design.md (wording per Q2 and
      7.3), and Rotate / Stop sharing (revoke) for the owner.
- [ ] 4.4 `src/App.tsx` (existing) File menu: Share…, Open Shared Link… (paste a link, joins through `switchDocument`,
      2b.2), enabled only when the Settings toggle "Enable sharing (beta)" is on.
- [ ] 4.5 In read-only mode `src/App.tsx` disables (menu `enabled: false`) every mutating item: Format `fmt-*`,
      Heading `heading-*`, Find and Replace `replace`, Insert Frontmatter `insert-frontmatter`, Undo/Redo, Cut, Paste.
      Find, Copy, Select All, Save As and Print stay enabled.
- [ ] 4.6 `handleFollowLink` (`src/App.tsx:439`) calls `needsFileLinkConfirm(target, session.kind === "shared" ?
      "shared" : "local")` (1.5) and asks "Open local file {path}?" before following when true.
- [ ] 4.7 Joined documents open untitled ("Shared: {title}"); Save As writes a local copy and keeps the session live.
- [ ] 4.8 `src/share/StatusPill.tsx` (new): Live (n) / Offline, changes will sync / Read-only / Link revoked, driven by
      provider status, `ClientMode` and `CloseCode`.
- [ ] 4.9 Remove the `MARKY_DEV_SHARED` flag from 2a.10.
- [ ] 4.10 External-change watcher (`src/App.tsx:665-718`, existing): in shared mode the prompt is "Push disk version
      into shared document / Keep shared version", default Keep; Push applies one transaction. Never shown in read-only
      mode.
- [ ] 4.11 Reopen: a shared doc in Recent Files or reopen-last reconnects using its `LocalShareRecord`; offline it opens
      from local Yjs state with the Offline pill and the mode from 4.2.
- [ ] 4.12 `src/share/client.dom.test.ts` (new) against a real local relay (from `relay/`, ephemeral port, temp data
      dir removed in teardown). One row each:
  - [ ] share, join as edit, edit from both, then the authenticated editor loses transport (4.2's temporary-loss
        row): mode remains editable, real body/panel mutations emit local Yjs updates queued offline; reconnect
        authenticates and both clients converge
  - [ ] join with the view token: the 2a.9 mutation rows run against the live session, `readDoc` stays equal to the
        relay's copy, and an edit from an edit client arrives
  - [ ] authenticated viewer loses transport, then reloads from local Yjs state with the relay stopped: mode
        remains read-only at both stages; all 2a.9 rows leave `readDoc` unchanged and emit zero local Yjs updates;
        after reconnect, remote edits still arrive
  - [ ] one row each for 4401 revoked, 4403 forbidden and authentication failure after authenticated edit mode:
        mode immediately becomes read-only; all 2a.9 mutations leave `readDoc` unchanged and emit zero local Yjs
        updates; persisted `authenticatedScope` is null. Stop the relay and reload: still read-only with the same
        mutation assertions despite the previously cached edit/owner role
  - [ ] shared A with two clients, observer kept connected: assert ShareStatus for A `connected` is 2; open local
        B in the departing client, then assert A's room count falls to 1 and the departing session/provider is closed.
        Type in B and Save: B's file contains the edit, while the observer's A content and relay A content remain
        unchanged (2b.3 against a live relay)
  - [ ] revoke shows "Link revoked" and leaves the owner's local file untouched
- [ ] 4.13 README.md and CHANGELOG.md (existing): sharing (beta) described, including what the relay stores.

## Phase 5: Browser client

- [ ] 5.1 `web.html` + `src/web/main.tsx` (new): second Vite entry rendering `SharedDocView` (2a.6, so the frontmatter
      panel and read-only mode come with it) with `y-indexeddb` persistence, the status pill, and no file menu.
      `vite.config.ts` (existing) builds both entries.
- [ ] 5.2 Reads `roomId` from the path and the token from the fragment; clears the fragment from the address bar
      after reading (token stays in sessionStorage for the tab). Use `ClientMode.transitionTable` verbatim, as
      reproduced in 4.2, including persisted `authenticatedScope` in IndexedDB and invalidation on refusal.
- [ ] 5.3 Served by the relay with `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, and a CSP no looser than
      1.3's (no remote scripts). If Q6 = (a), every page shows a "Report abuse" link to the inbox Q6 names, with the
      owner's wording (checked in 7.4).
- [ ] 5.4 "Download .md" button produces the same markdown as desktop Save (reuse `readDoc` + `joinFrontmatter`).
- [ ] 5.5 `src/web/web.dom.test.tsx` (new; Mermaid sink replays use `.browser.test.tsx` if 1.2 says so) against a
      real local relay:
  - [ ] the 3.7 golden flow with one desktop-shaped and one web-shaped client converges to identical `readDoc`
  - [ ] frontmatter edited through the web panel's textarea appears in the desktop panel, and "Download .md" equals
        desktop Save output
  - [ ] the 2a.9 read-only rows with a view token in the web client
  - [ ] authenticated web editor loses transport (4.2's temporary-loss row): mode remains editable, real body/panel
        mutations emit local Yjs updates queued offline; reconnect authenticates and desktop/web converge
  - [ ] authenticated web viewer loses transport, then reloads with the relay stopped: mode remains read-only
        at both stages; all 2a.9 rows leave `readDoc` unchanged and emit zero local Yjs updates; remote edits arrive
        after reconnect
  - [ ] one web row each for 4401 revoked, 4403 forbidden and authentication failure after authenticated edit mode:
        mode immediately becomes read-only; all 2a.9 mutations leave `readDoc` unchanged and emit zero local Yjs
        updates; IndexedDB `authenticatedScope` is null. Stop the relay and reload: still read-only with the same
        mutation assertions despite the previously cached edit/owner role
  - [ ] the 1.6 fixture rows delivered from an edit client to the web client: use the same exported render waits,
        event actions, callback-click assertions and cleanup on failure; every Mermaid sink replay follows 1.2's
        runner decision

## Phase 6: Presence and offline merge UX

- [ ] 6.1 Awareness per contract `AwarenessUser`: name from Settings (default the OS user name on desktop, "Guest" on
      web), colour derived from client id; remote cursors via `yCursorPlugin`.
- [ ] 6.2 On reconnect after more than 5 minutes offline or more than 50 local transactions, keep a snapshot of the
      pre-merge text and show "Merged with N collaborator changes. [Show my offline version]", opening it read-only.
- [ ] 6.3 `src/share/merge.dom.test.ts` (new): offline edit on A plus concurrent edit on B; after reconnect the
      snapshot equals A's pre-merge text and both docs converge.

## Phase 7: Deploy (owner-gated)

- [ ] 7.1 Gate: Q1 names the server, Q5 the domain, Q6 the abuse wording. No deploy before all three are recorded at
      the top of this file.
- [ ] 7.2 Container image for `relay/`, deployed by the repo's runbook scripts (Actions are manual-only by owner
      decision 2026-10-09, `.github/workflows/release.yml:1`). Add `wss://{shareHost}` and `https://{shareHost}` to
      the release CSP `connect-src` (1.3).
- [ ] 7.3 Storage protection gate (Q2 (a) promises "encrypted on disk"). Each item recorded in `spike-notes.md` with
      the command and its output, before the Share dialog's privacy sentence ships:
  - [ ] the relay data dir sits on an encrypted volume on the chosen host (for example LUKS: `cryptsetup status
        <mapping>`, or the provider's encrypted block storage, with its console or API evidence)
  - [ ] daily SQLite backups are encrypted before leaving the host (for example `age` or `restic`), and the key is not
        stored on the backup target
  - [ ] one restore from an encrypted backup into a scratch relay succeeds and serves a test room
  - [ ] if any item cannot be met on the Q1 host, the privacy sentence is reworded to what is verified and the owner
        approves that wording before 7.4 (Q2 note)
- [ ] 7.4 Live check: create a share from a release build, open the edit link in a browser on another machine,
      edit both ways, revoke, confirm both sides show revoked. Recorded in `spike-notes.md`.

## Out of scope

Accounts and "shared with me", comments and suggestions, version history browser, folder sharing, `marky://`
deep links (needs `tauri-plugin-deep-link`, absent from `src-tauri/Cargo.toml`), end-to-end encryption unless Q2
picks it (which triggers the 0.1 replan), a managed-host migration (needs its own plan, see Shape), and narrowing the
existing `fs:scope` `**` (worth doing, but a separate change).

## Questions

Owner calls. One policy, used by the phase table above:

| Question | Needed before | If unanswered at that point | Answer that forces a replan |
|---|---|---|---|
| Q1 host | Phase 3 starts (protocol and architecture); 7.1 (which server) | Phase 3 does not start | (b) or (c): new plan for relay, client provider and web entry (Shape) |
| Q2 server can read | 0.1 | Phase 0 stops | (b): replan per 0.1 |
| Q3 accounts | 0.1 | Phase 0 stops | (b): replan per 0.1 |
| Q4 limits | 0.2 | recommended values freeze as config defaults | none: (b) or (c) only change `Limits` |
| Q5 domain | 7.1 | Phase 7 does not start; dev uses a local relay | none |
| Q6 abuse | 7.1 (customer-facing wording) | Phase 7 does not start | none: (b) drops the report link from 5.3 pages |

- **Q1. Who hosts the shared documents?**
  (a) A small relay we run ourselves on a server we already pay for. Cheapest, we own the data, we do the patching.
  **(recommended)**
  (b) A managed collaboration host (Y-Sweet, Liveblocks). No ops, monthly bill grows with users, data at a vendor.
  It speaks a different protocol, so the desktop and web clients change too, not just the server (cost unsized).
  (c) Cloudflare Durable Objects. Cheap at small scale, a new platform to learn. Same client change as (b).
- **Q2. Can we (the server) read shared documents?**
  (a) Yes in v1: encrypted in transit and on disk, but the operator could read them. The Share dialog says so.
  Simpler, ships sooner. "On disk" is only promised once step 7.3 proves it on the chosen host; otherwise the
  sentence is reworded and comes back to you. **(recommended for v1, revisit after launch)**
  (b) No, end-to-end encrypted from day one: the link carries the key, the server only stores scrambled bytes.
  Strong privacy pitch, about doubles the relay work, and a lost link means a lost document. Needs a replanned design.
- **Q3. Do people need an account?**
  (a) No: whoever has the link gets in, with view or edit, for that one document only. Owner can rotate or kill links.
  **(recommended)**
  (b) Sign-in required (adds an auth provider, a cost, and a login screen for every guest). Needs a replanned design.
- **Q4. Limits and retention.** Proposed: delete a shared doc after 30 days with nobody connected, 5 MB per doc,
  25 people per doc, 50 new shares per IP per day. (a) these values **(recommended)**, (b) no expiry (storage grows
  forever), (c) other numbers.
- **Q5. Which web address do links use?** (a) a subdomain of a domain we already own, for example
  `share.smartmemory.ai` **(recommended, no new spend)**, (b) a new Marky domain (small yearly cost, cleaner brand).
- **Q6. Abuse handling.** Public links can host anything, including phishing text. (a) noindex every page, a
  "Report abuse" link to an email inbox, and the right to delete rooms in the terms **(recommended)**, (b) no
  reporting path in v1. Customer-facing wording is the owner's.
