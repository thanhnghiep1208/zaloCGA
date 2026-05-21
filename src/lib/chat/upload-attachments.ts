import type { ChatAttachmentMeta } from "@/lib/chatHistory";

export async function uploadChatAttachments(
  files: File[],
  sessionId: string,
  authHeader: { Authorization: string }
): Promise<ChatAttachmentMeta[]> {
  if (files.length === 0) return [];
  const uploaded = await Promise.all(
    files.map(async (file) => {
      const form = new FormData();
      form.append("file", file);
      form.append("sessionId", sessionId);
      const res = await fetch("/api/chat/attachments", {
        method: "POST",
        headers: { ...authHeader },
        body: form,
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        attachment?: ChatAttachmentMeta;
      };
      if (!res.ok || !data.attachment) {
        throw new Error(data.error || "Failed to upload attachment");
      }
      return data.attachment;
    })
  );
  return uploaded;
}
