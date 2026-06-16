import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";

import "@milkdown/theme-nord/style.css";
import { mermaidPlugin } from "./mermaidPlugin";
import { searchPlugin } from "./searchPlugin";

export type EditorGetter = () => Editor | undefined;

type Props = {
  initial: string;
  onChange: (markdown: string) => void;
  onReady?: (getEditor: EditorGetter) => void;
};

function MilkdownEditor({ initial, onChange, onReady }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const { get, loading } = useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initial);
        ctx.get(listenerCtx).markdownUpdated((_, md) => {
          onChangeRef.current(md);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(mermaidPlugin)
      .use(searchPlugin),
  );

  // Once the editor finishes creating, expose it and place the cursor inside it.
  // Without this an empty document mounts unfocused, so a new blank file looks
  // uneditable until you find its single editable line.
  useEffect(() => {
    if (loading) return;
    const ed = get();
    if (!ed) return;
    onReady?.(get);
    ed.action((ctx) => {
      ctx.get(editorViewCtx).focus();
    });
  }, [loading, get, onReady]);

  return <Milkdown />;
}

export function MarkyEditor(props: Props) {
  return (
    <MilkdownProvider>
      <MilkdownEditor {...props} />
    </MilkdownProvider>
  );
}
