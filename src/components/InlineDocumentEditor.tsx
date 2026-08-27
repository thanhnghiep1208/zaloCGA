"use client";

import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { toFriendlyErrorMessage } from "@/lib/user-error";
import {
  DOC_MESSAGE_TYPE_OPTIONS,
  DOC_UI_PATTERN_OPTIONS,
  DocMessageType,
  DocUiPattern,
} from "@/lib/chat/scope-options";

type InlineDraftPayload = {
  title: string;
  category: string;
  tags: string[];
  contentHtml: string;
  contentPlain: string;
  messageType: DocMessageType | null;
  uiPattern: DocUiPattern | null;
};

type InlineDocumentEditorProps = {
  initialDraft?: {
    title: string;
    category: string;
    tags: string[];
    contentHtml: string;
    messageType?: DocMessageType | null;
    uiPattern?: DocUiPattern | null;
  };
  submitLabel?: string;
  onSubmitDraft: (payload: InlineDraftPayload) => Promise<void> | void;
};

function ToolbarButton({
  label,
  onClick,
  isActive = false,
}: {
  label: string;
  onClick: () => void;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-[8px] text-xs border transition-colors ${
        isActive
          ? "bg-accent/18 border-accent/40 text-foreground"
          : "bg-background border-border text-muted hover:text-foreground hover:bg-accent/10"
      }`}
    >
      {label}
    </button>
  );
}

export function InlineDocumentEditor({
  onSubmitDraft,
  initialDraft,
  submitLabel = "Luu tai lieu",
}: InlineDocumentEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(initialDraft?.title || "");
  const [category, setCategory] = useState(initialDraft?.category || "");
  const [tagsInput, setTagsInput] = useState((initialDraft?.tags || []).join(", "));
  const [messageType, setMessageType] = useState<DocMessageType | "">(initialDraft?.messageType || "");
  const [uiPattern, setUiPattern] = useState<DocUiPattern | "">(initialDraft?.uiPattern || "");
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[320px] px-4 py-3 text-sm leading-6 focus:outline-none prose prose-sm max-w-none",
      },
    },
    content:
      initialDraft?.contentHtml ||
      "<h2>Tieu de noi dung</h2><p>Nhap guideline/microcopy tai day.</p>",
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!initialDraft) return;
    setTitle(initialDraft.title || "");
    setCategory(initialDraft.category || "");
    setTagsInput((initialDraft.tags || []).join(", "));
    setMessageType(initialDraft.messageType || "");
    setUiPattern(initialDraft.uiPattern || "");
    if (editor) {
      editor.commands.setContent(initialDraft.contentHtml || "<p></p>");
    }
  }, [initialDraft, editor]);

  const isInvalid = useMemo(() => {
    const plain = editor?.getText().trim() || "";
    return !title.trim() || plain.length === 0;
  }, [title, editor]);

  const handleAddLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Nhap URL", previous || "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const handleSubmit = async () => {
    if (!editor || isInvalid || submitting) return;
    setSubmitting(true);
    try {
      const payload: InlineDraftPayload = {
        title: title.trim(),
        category: category.trim(),
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        contentHtml: editor.getHTML(),
        contentPlain: editor.getText(),
        messageType: messageType || null,
        uiPattern: uiPattern || null,
      };
      await onSubmitDraft(payload);
    } catch (err: unknown) {
      alert(toFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickImage = () => {
    imageInputRef.current?.click();
  };

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor || !user) return;

    setImageUploading(true);
    try {
      const authHeader = await firebaseBearerAuthHeader(user);
      const form = new FormData();
      form.append("file", file);
      form.append("docId", "draft-inline");

      const res = await fetch("/api/upload/image", {
        method: "POST",
        headers: {
          ...authHeader,
        },
        body: form,
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        downloadURL?: string;
      };
      if (!res.ok || !data.downloadURL) {
        throw new Error(data.error || "Image upload failed");
      }

      editor
        .chain()
        .focus()
        .setImage({
          src: data.downloadURL,
          alt: file.name,
        })
        .run();
    } catch (err: unknown) {
      alert(toFriendlyErrorMessage(err));
    } finally {
      setImageUploading(false);
    }
  };

  return (
    <div className="clay-card mt-8 p-6 md:p-8 space-y-5 max-w-4xl mx-auto w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-muted">Title</label>
          <input
            id="doc-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Guideline thong diep Empty State"
            className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-muted">Category</label>
          <input
            id="doc-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="VD: onboarding, auth, payment"
            className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase text-muted">Tags (comma separated)</label>
        <input
          id="doc-tags"
          name="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="microcopy, guideline, warning"
          className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-muted">Loại thông báo (chat scope)</label>
          <select
            id="doc-message-type"
            name="messageType"
            value={messageType}
            onChange={(e) => setMessageType(e.target.value as DocMessageType | "")}
            className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
          >
            <option value="">—</option>
            {DOC_MESSAGE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-muted">Kiểu UI (chat scope)</label>
          <select
            id="doc-ui-pattern"
            name="uiPattern"
            value={uiPattern}
            onChange={(e) => setUiPattern(e.target.value as DocUiPattern | "")}
            className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
          >
            <option value="">—</option>
            {DOC_UI_PATTERN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-border rounded-[12px] overflow-hidden">
        <div className="bg-surface px-3 py-2 border-b border-border flex flex-wrap gap-2">
          <ToolbarButton
            label="H2"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor?.isActive("heading", { level: 2 }) || false}
          />
          <ToolbarButton
            label="H3"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor?.isActive("heading", { level: 3 }) || false}
          />
          <ToolbarButton
            label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            isActive={editor?.isActive("bold") || false}
          />
          <ToolbarButton
            label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            isActive={editor?.isActive("italic") || false}
          />
          <ToolbarButton
            label="Bullet"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            isActive={editor?.isActive("bulletList") || false}
          />
          <ToolbarButton
            label="Quote"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            isActive={editor?.isActive("blockquote") || false}
          />
          <ToolbarButton label="Link" onClick={handleAddLink} isActive={editor?.isActive("link") || false} />
          <ToolbarButton label={imageUploading ? "Uploading..." : "Image"} onClick={handlePickImage} />
        </div>

        <EditorContent editor={editor} />
      </div>
      <input
        ref={imageInputRef}
        id="doc-image-input"
        name="doc-image"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageFileChange}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Noi dung duoc luu vao `documents` voi type `inline_doc`; server se tu strip HTML sang plain text.
        </p>
        <button
          type="button"
          disabled={isInvalid || submitting}
          onClick={handleSubmit}
          className="clay-hover-playful px-5 py-2.5 rounded-[8px] bg-cream text-charcoal border border-border text-sm font-medium disabled:opacity-60"
        >
          {submitting ? "Dang xu ly..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

