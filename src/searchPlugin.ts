import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";

export type Match = { from: number; to: number };

export type SearchState = {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  /** Index into `matches` of the active match, or -1 when there is none. */
  current: number;
};

const EMPTY: SearchState = {
  query: "",
  caseSensitive: false,
  matches: [],
  current: -1,
};

export const searchKey = new PluginKey<SearchState>("marky-search");

type SearchMeta =
  | { type: "set"; query: string; caseSensitive: boolean }
  | { type: "select"; current: number };

function findMatches(
  doc: ProseNode,
  query: string,
  caseSensitive: boolean,
): Match[] {
  const matches: Match[] = [];
  if (!query) return matches;
  const needle = caseSensitive ? query : query.toLowerCase();
  const len = query.length;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      matches.push({ from: pos + i, to: pos + i + len });
      i = hay.indexOf(needle, i + Math.max(len, 1));
    }
  });
  return matches;
}

export const searchPlugin = $prose(
  () =>
    new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => EMPTY,
        apply(tr, value, _oldState, newState) {
          const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
          if (meta?.type === "set") {
            const matches = findMatches(
              newState.doc,
              meta.query,
              meta.caseSensitive,
            );
            return {
              query: meta.query,
              caseSensitive: meta.caseSensitive,
              matches,
              current: matches.length ? 0 : -1,
            };
          }
          if (meta?.type === "select") {
            return { ...value, current: meta.current };
          }
          // Keep matches in sync as the document changes underneath us.
          if (tr.docChanged && value.query) {
            const matches = findMatches(
              newState.doc,
              value.query,
              value.caseSensitive,
            );
            let current = value.current;
            if (current >= matches.length) current = matches.length - 1;
            if (current < 0 && matches.length) current = 0;
            return { ...value, matches, current };
          }
          return value;
        },
      },
      props: {
        decorations(state) {
          const s = searchKey.getState(state);
          if (!s || !s.matches.length) return DecorationSet.empty;
          const decos = s.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class:
                i === s.current
                  ? "marky-search-match marky-search-current"
                  : "marky-search-match",
            }),
          );
          return DecorationSet.create(state.doc, decos);
        },
      },
    }),
);

export function getSearchState(view: EditorView): SearchState {
  return searchKey.getState(view.state) ?? EMPTY;
}

/** Move the editor selection onto a match and scroll it into view. */
function selectMatch(view: EditorView, index: number) {
  const s = getSearchState(view);
  const match = s.matches[index];
  if (!match) return;
  const tr = view.state.tr
    .setMeta(searchKey, { type: "select", current: index })
    .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
    .scrollIntoView();
  view.dispatch(tr);
}

/** Run a search; highlights all matches and jumps to the first one. */
export function setSearch(
  view: EditorView,
  query: string,
  caseSensitive: boolean,
) {
  view.dispatch(
    view.state.tr.setMeta(searchKey, { type: "set", query, caseSensitive }),
  );
  const s = getSearchState(view);
  if (s.current >= 0) selectMatch(view, s.current);
}

export function nextMatch(view: EditorView) {
  const s = getSearchState(view);
  if (!s.matches.length) return;
  selectMatch(view, (s.current + 1) % s.matches.length);
}

export function prevMatch(view: EditorView) {
  const s = getSearchState(view);
  if (!s.matches.length) return;
  selectMatch(view, (s.current - 1 + s.matches.length) % s.matches.length);
}

/** Replace the active match, then advance onto the next one. */
export function replaceCurrent(view: EditorView, replacement: string) {
  const s = getSearchState(view);
  const match = s.matches[s.current];
  if (!match) return;
  view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
  // The doc-changed branch recomputed matches; `current` now points at the
  // next occurrence (or was clamped). Re-select so repeated replaces walk down.
  const after = getSearchState(view);
  if (after.current >= 0) selectMatch(view, after.current);
}

export function replaceAll(view: EditorView, replacement: string) {
  const s = getSearchState(view);
  if (!s.matches.length) return;
  let tr = view.state.tr;
  // Replace back-to-front so earlier match positions stay valid.
  for (let i = s.matches.length - 1; i >= 0; i--) {
    const m = s.matches[i];
    tr = tr.insertText(replacement, m.from, m.to);
  }
  view.dispatch(tr);
}

/** Clear highlights (e.g. when the find bar closes). */
export function clearSearch(view: EditorView) {
  view.dispatch(
    view.state.tr.setMeta(searchKey, {
      type: "set",
      query: "",
      caseSensitive: false,
    }),
  );
}
