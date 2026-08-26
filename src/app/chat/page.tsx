"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReferencePreviewModal } from "@/components/ReferencePreviewModal";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { useChatPage } from "@/hooks/useChatPage";

export default function ChatView() {
  const chat = useChatPage();

  return (
    <ProtectedRoute>
      <div className="h-[calc(100dvh-8.5rem)] min-h-[560px] flex flex-col pt-2 animate-in fade-in duration-500 w-full">
        <div
          className={`flex-1 min-h-0 py-4 pr-3 space-y-8 scrollbar-thin ${
            chat.showConversationLayout ? "overflow-y-auto" : "overflow-y-hidden"
          }`}
        >
          {!chat.showConversationLayout && <ChatEmptyState />}

          {chat.showConversationLayout && (
            <ChatMessageList
              messages={chat.messages}
              isLoading={chat.isLoading}
              bottomRef={chat.bottomRef}
              onPreviewDoc={(docId) => chat.setPreviewDocId(docId)}
              onFeedback={chat.handleFeedback}
              onCopy={(text, messageId) => void chat.copyToClipboard(text, messageId)}
            />
          )}
        </div>

        <ChatComposer
          input={chat.input}
          setInput={chat.setInput}
          isLoading={chat.isLoading}
          selectedImages={chat.selectedImages}
          isDropTarget={chat.isDropTarget}
          attachmentInputRef={chat.attachmentInputRef}
          scope={chat.scope}
          onScopeChange={chat.setScope}
          onSend={() => void chat.handleSend()}
          onPickAttachments={chat.onPickAttachments}
          onAttachmentFilesSelected={chat.onAttachmentFilesSelected}
          onRemovePendingImage={chat.removePendingImage}
          onDragEnter={chat.handleComposerDragEnter}
          onDragOver={chat.handleComposerDragOver}
          onDragLeave={chat.handleComposerDragLeave}
          onDrop={chat.handleComposerDrop}
        />
      </div>
      <ReferencePreviewModal docId={chat.previewDocId} onClose={() => chat.setPreviewDocId(null)} />
    </ProtectedRoute>
  );
}
