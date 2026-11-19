import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";

import "@milkdown/theme-nord/style.css";
import { mermaidPlugin } from "./mermaidPlugin";
import { searchPlugin } from "./searchPlugin";
import { createLinkFollowPlugin } from "./linkFollowPlugin";

export type EditorGetter = () => Editor | undefined;

type Props = {
  initial: string;
  onChange: (readMarkdown: () => string) => void;
  onReady?: (getEditor: EditorGetter) => void;
  /** Cmd/Ctrl+click on a link that isn't an in-doc anchor (App owns the current file path). */
  onFollowLink?: (href: string) => void;
};

function MilkdownEditor({ initial, onChange, onReady, onFollowLink }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFollowLinkRef = useRef(onFollowLink);
  onFollowLinkRef.current = onFollowLink;

  const { get, loading } = useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initial);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use($prose(ctx => new Plugin({
        view: () => ({
          update(view, previous) {
            const doc = view.state.doc;
            if (doc !== previous.doc) {
              // Publish edits before the next native Close/Save/Quit command.
              // Serialize the immutable snapshot only when its text is needed.
              onChangeRef.current(() => ctx.get(serializerCtx)(doc));
            }
          },
        }),
      })))
      .use(mermaidPlugin)
      .use(searchPlugin)
      .use(createLinkFollowPlugin((href) => onFollowLinkRef.current?.(href))),
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
