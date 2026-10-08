import { useEffect, useMemo, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $generateNodesFromDOM } from "@lexical/html";
import {
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { DecoratorNode, type NodeKey } from "lexical";
import type { JSX } from "react";

export class ArticleImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __caption: string;

  static getType(): string {
    return "article-image";
  }

  static clone(node: ArticleImageNode): ArticleImageNode {
    return new ArticleImageNode(node.__src, node.__caption, node.__key);
  }

  static importDOM() {
    return {
      img: () => ({
        conversion: (element: HTMLElement) => {
          const src = element.getAttribute("src");
          if (!src) return null;
          const figure = element.closest("figure");
          const caption = figure?.querySelector("figcaption")?.textContent?.trim() || "";
          return { node: new ArticleImageNode(src, caption) };
        },
        priority: 2 as const,
      }),
    };
  }

  static importJSON(serializedNode: {
    type: string;
    version: number;
    src: string;
    caption?: string;
  }): ArticleImageNode {
    return new ArticleImageNode(serializedNode.src, serializedNode.caption || "");
  }

  constructor(src: string, caption = "", key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__caption = caption;
  }

  exportJSON() {
    return {
      type: "article-image",
      version: 1,
      src: this.__src,
      caption: this.__caption,
    };
  }

  exportDOM() {
    const figure = document.createElement("figure");
    figure.className = "my-6";

    const image = document.createElement("img");
    image.setAttribute("src", this.__src);
    image.setAttribute("alt", "");
    image.setAttribute("class", "w-full rounded-lg");
    figure.appendChild(image);

    if (this.__caption.trim()) {
      const caption = document.createElement("figcaption");
      caption.className = "mt-2 text-center text-sm italic leading-6 text-muted-foreground";
      caption.textContent = this.__caption.trim();
      figure.appendChild(caption);
    }

    return { element: figure };
  }

  createDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "article-image-node";
    return wrapper;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    const caption = this.__caption.trim();
    return (
      <figure className="my-6">
        <img src={this.__src} alt="" className="w-full rounded-lg" />
        {caption ? (
          <figcaption className="mt-2 text-center text-sm italic leading-6 text-muted-foreground">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    );
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeInitialHtml(value: string, imageUrls: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/<(?:p|div|figure|img|strong|em|u|s|code|blockquote|ul|ol|li)\b/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const imageOnly = paragraph.match(/^\{\{image:(\d+)\}\}$/i);
      if (imageOnly) {
        const src = imageUrls[Number(imageOnly[1]) - 1];
        if (src) {
          const safe = escapeHtml(src);
          return `<figure class="my-6"><img src="${safe}" alt="" class="w-full rounded-lg" /></figure>`;
        }
        return "";
      }
      return `<p>${escapeHtml(paragraph)}</p>`;
    })
    .filter(Boolean)
    .join("");
}
function EditorInitializer({ html, imageUrls }: { html: string; imageUrls: string[] }) {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  const normalized = useMemo(() => normalizeInitialHtml(html, imageUrls), [html, imageUrls]);

  useEffect(() => {
    if (!normalized || initializedRef.current) return;
    initializedRef.current = true;

    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(normalized, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.selectEnd();
      $insertNodes(nodes);
    });
  }, [normalized, editor]);

  return null;
}

function ToolbarButton({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent px-2 text-sm font-medium hover:border-border hover:bg-secondary disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function InsertImagePlugin({
  imageUrl,
  imageCaption,
  onImageInserted,
}: {
  imageUrl?: string | null;
  imageCaption?: string;
  onImageInserted?: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!imageUrl) return;

    editor.focus();
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([$createArticleImageNode(imageUrl, imageCaption || "")]);
      }
    });
    onImageInserted?.();
  }, [editor, imageUrl, imageCaption, onImageInserted]);

  return null;
}

function EditorToolbar({ onRequestImage }: { onRequestImage?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  const format = (type: "bold" | "italic" | "underline" | "strikethrough" | "code") => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
  };

  const align = (type: "left" | "center" | "right" | "justify") => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, type);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/40 px-2 py-2">
      <ToolbarButton label="↶" title="Undo" disabled={!canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
      <ToolbarButton label="↷" title="Redo" disabled={!canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
      <span className="mx-1 h-6 w-px bg-border" />
      <ToolbarButton label="B" title="Bold" onClick={() => format("bold")} />
      <ToolbarButton label="I" title="Italic" onClick={() => format("italic")} />
      <ToolbarButton label="U" title="Underline" onClick={() => format("underline")} />
      <ToolbarButton label="S" title="Strikethrough" onClick={() => format("strikethrough")} />
      <ToolbarButton label="</>" title="Inline code" onClick={() => format("code")} />
      {onRequestImage ? (
        <ToolbarButton label="ছবি" title="Cloudinary Gallery থেকে ছবি বসান" onClick={onRequestImage} />
      ) : null}
      <span className="mx-1 h-6 w-px bg-border" />
      <ToolbarButton label="≡" title="বামে align" onClick={() => align("left")} />
      <ToolbarButton label="☰" title="মাঝে align" onClick={() => align("center")} />
      <ToolbarButton label="≣" title="ডানে align" onClick={() => align("right")} />
      <ToolbarButton label="☷" title="Justify" onClick={() => align("justify")} />
    </div>
  );
}

export default function RichArticleEditor({
  onChange,
  initialHtml = "",
  imageUrls = [],
  insertImageUrl,
  insertImageCaption,
  onImageInserted,
  onRequestImage,
}: {
  onChange: (html: string) => void;
  initialHtml?: string;
  imageUrls?: string[];
  insertImageUrl?: string | null;
  insertImageCaption?: string;
  onImageInserted?: () => void;
  onRequestImage?: () => void;
}) {
  const initialConfig = {
    namespace: "TheConnectArticleEditor",
    theme: {},
    onError: (error: Error) => console.error("Lexical error:", error),
    nodes: [ArticleImageNode],
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorInitializer html={initialHtml} imageUrls={imageUrls} />
      <InsertImagePlugin imageUrl={insertImageUrl} imageCaption={insertImageCaption} onImageInserted={onImageInserted} />

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <EditorToolbar onRequestImage={onRequestImage} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="min-h-[620px] px-6 py-5 font-serif text-[18px] leading-8 outline-none" />
            }
            placeholder={
              <div className="pointer-events-none absolute left-6 top-5 font-serif text-lg text-muted-foreground">
                এখানে মূল সংবাদ লিখুন...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <div className="border-t border-border bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
            সরাসরি formatted লেখা লিখুন। Undo/Redo, text formatting, alignment এবং লেখার মধ্যে ছবি বসানো যাবে।
          </div>
        </div>
      </div>

      <HistoryPlugin />
      <OnChangePlugin
        onChange={(editorState, editor) => {
          editorState.read(() => {
            const root = editor.getRootElement();
            onChange(root?.innerHTML || "");
          });
        }}
      />
    </LexicalComposer>
  );
}

export function $createArticleImageNode(src: string, caption = "") {
  return new ArticleImageNode(src, caption);
}
