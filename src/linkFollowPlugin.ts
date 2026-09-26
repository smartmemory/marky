import { $prose } from "@milkdown/utils";
import { Plugin, TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { classifyLink, slugify } from "./links";

/** Class toggled on the ProseMirror root while Cmd/Ctrl is held, so links show a pointer cursor. */
export const LINK_MODIFIER_CLASS = "marky-link-modifier-active";

// On macOS, Ctrl+click is the right-click/context-menu gesture, so the
// link-follow modifier there is Cmd only; everywhere else it's Ctrl.
const isMac = /Mac/.test(navigator.platform || navigator.userAgent);

function isModifierHeld(e: KeyboardEvent | MouseEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * Find the position just inside the first heading whose slug or `id` attr
 * matches `fragment`. Slugs are computed in document order so a repeated
 * heading text gets GitHub's `-1`, `-2`, … suffix.
 */
function findHeadingPos(doc: ProseNode, fragment: string): number | null {
  const seen = new Map<string, number>();
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "heading") return;
    const base = slugify(node.textContent);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count}`;
    const id = (node.attrs.id as string) ?? "";
    if (slug === fragment || id === fragment) found = pos;
  });
  return found;
}

/** Move the selection to a matching heading and scroll it into view. No match: warn and do nothing. */
export function scrollToFragment(view: EditorView, fragment: string) {
  const pos = findHeadingPos(view.state.doc, fragment);
  if (pos === null) {
    console.warn(`Marky: no heading matches #${fragment}`);
    return;
  }
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)).scrollIntoView(),
  );
  view.focus();
}

/**
 * Cmd+click (Ctrl+click off macOS) on a link follows it: an in-doc `#anchor`
 * jumps to the matching heading right here, anything else is handed to
 * `onFollowLink` so the App layer (which owns the current file path) can open
 * it. A plain click is left alone for normal cursor placement / editing.
 */
export function createLinkFollowPlugin(onFollowLink: (href: string) => void) {
  return $prose(
    () =>
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (isModifierHeld(event)) view.dom.classList.add(LINK_MODIFIER_CLASS);
              return false;
            },
            keyup(view, event) {
              if (!isModifierHeld(event)) view.dom.classList.remove(LINK_MODIFIER_CLASS);
              return false;
            },
            blur(view) {
              view.dom.classList.remove(LINK_MODIFIER_CLASS);
              return false;
            },
            mousedown(view, event) {
              if (!isModifierHeld(event) || event.button !== 0) return false;
              const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
              if (!anchor) return false;
              // Never let the webview itself navigate on a modifier-click.
              event.preventDefault();
              const href = anchor.getAttribute("href") ?? "";
              // An in-doc anchor only needs the fragment (no App/file-path
              // state), so it's resolved here where the view lives. Anything
              // else — external URL, local file, unsupported — goes to App.
              if (href.startsWith("#")) {
                const target = classifyLink(href, null);
                if (target.kind === "anchor") scrollToFragment(view, target.fragment);
              } else {
                onFollowLink(href);
              }
              return true;
            },
            // `preventDefault` on mousedown doesn't cancel the `click` that
            // follows it, and WebKit's own Cmd+click default on a link is to
            // open it in a new window/tab. Swallow that click too, but don't
            // repeat the follow logic — mousedown above already ran it once.
            click(_view, event) {
              if (!isModifierHeld(event)) return false;
              const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
              if (!anchor) return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
  );
}
