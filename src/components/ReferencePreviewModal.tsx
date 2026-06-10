"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { postClientAnalyticsEvent } from "@/lib/client-analytics-event";

type ReferenceDoc = {
  fileName?: string;
  title?: string;
  type?: string;
  fileUrl?: string;
};

type ReferencePreviewModalProps = {
  docId: string | null;
  onClose: () => void;
};

export function ReferencePreviewModal({ docId, onClose }: ReferencePreviewModalProps) {
  const { user } = useAuth();
  const [data, setData] = useState<ReferenceDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!docId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const snap = await getDoc(doc(db, "documents", docId));
        if (!active) return;
        if (!snap.exists()) {
          setData(null);
          setNotFound(true);
        } else {
          const docData = snap.data() as ReferenceDoc;
          setData(docData);
          if (user) {
            void postClientAnalyticsEvent(user, "document_viewed", {
              doc_id: docId,
              file_name: docData.fileName ?? docData.title ?? "",
            });
          }
        }
      } catch (err) {
        console.error("Failed to load reference preview", err);
        if (active) {
          setData(null);
          setNotFound(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [docId]);

  if (!docId) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng xem tham khảo"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative z-[91] w-full max-w-4xl max-h-[85vh] clay-card rounded-[16px] overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border bg-surface">
          <div className="min-w-0">
            <p className="text-xs text-muted font-medium">Nội dung tham khảo</p>
            <h3 className="text-lg font-medium text-foreground truncate">
              {data?.fileName || data?.title || "Đang tải tài liệu..."}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {docId && (data?.fileUrl || data?.type === "inline_doc") ? (
              <a
                href={`/references/file/${docId}?download=1`}
                download
                className="clay-hover-playful px-3 py-1.5 rounded-[8px] border border-border text-sm text-foreground font-medium"
              >
                Download
              </a>
            ) : null}
          </div>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? <p className="text-muted">Đang tải nội dung...</p> : null}
          {!loading && notFound ? <p className="text-foreground">Không tìm thấy tài liệu tham khảo.</p> : null}
          {!loading && !notFound && data ? (
            <iframe
              title={data.fileName || "Reference preview"}
              src={`/references/file/${docId}`}
              className="w-full min-h-[65vh] rounded-[8px] border border-border bg-background"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
