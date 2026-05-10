import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/prose/view";
import mermaid from "mermaid";

let mermaidReady = false;
function initMermaid() {
  if (mermaidReady) return;
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: isDark ? "dark" : "default",
  });
  mermaidReady = true;
}

let idCounter = 0;

class MermaidNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private preview: HTMLDivElement;
  private renderId: string;
  private lastSource = "";
  private renderTimer: number | null = null;
  private currentLang: string;

  constructor(private node: ProseNode) {
    initMermaid();
    this.renderId = `marky-mermaid-${++idCounter}`;
    this.currentLang = (node.attrs.language as string) ?? "";

    this.dom = document.createElement("div");
    this.dom.className = "marky-mermaid-block";

    const toolbar = document.createElement("div");
    toolbar.className = "marky-mermaid-toolbar";
    toolbar.contentEditable = "false";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "marky-mermaid-edit";
    editBtn.title = "Edit diagram source";
    editBtn.setAttribute("aria-label", "Edit diagram source");
    editBtn.textContent = "✎";
    editBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.dom.classList.toggle("is-editing");
    });
    toolbar.appendChild(editBtn);
    this.dom.appendChild(toolbar);

    const pre = document.createElement("pre");
    pre.className = "marky-mermaid-source";
    const code = document.createElement("code");
    pre.appendChild(code);
    this.contentDOM = code;
    this.dom.appendChild(pre);

    this.preview = document.createElement("div");
    this.preview.className = "marky-mermaid-preview";
    this.preview.contentEditable = "false";
    this.dom.appendChild(this.preview);

    this.scheduleRender();
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    const lang = (node.attrs.language as string) ?? "";
    if (lang !== this.currentLang) return false;
    this.node = node;
    this.scheduleRender();
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return this.preview.contains(mutation.target as Node);
  }

  private scheduleRender() {
    if (this.renderTimer != null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 150);
  }

  private async render() {
    const source = this.node.textContent.trim();
    if (!source) {
      this.preview.innerHTML = "";
      this.lastSource = "";
      return;
    }
    if (source === this.lastSource) return;
    this.lastSource = source;
    try {
      const { svg, bindFunctions } = await mermaid.render(this.renderId, source);
      this.preview.innerHTML = svg;
      bindFunctions?.(this.preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.preview.innerHTML = "";
      const errEl = document.createElement("pre");
      errEl.className = "marky-mermaid-error";
      errEl.textContent = message;
      this.preview.appendChild(errEl);
    }
  }

  destroy() {
    if (this.renderTimer != null) window.clearTimeout(this.renderTimer);
  }
}

export const mermaidPlugin = $prose(
  () =>
    new Plugin({
      props: {
        nodeViews: {
          code_block: ((node: ProseNode, _view: EditorView) => {
            const lang = (node.attrs.language as string) ?? "";
            if (lang.toLowerCase() !== "mermaid") return null;
            return new MermaidNodeView(node);
          }) as unknown as (node: ProseNode, view: EditorView) => NodeView,
        },
      },
    }),
);
