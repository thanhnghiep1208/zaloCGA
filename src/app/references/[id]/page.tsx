"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { use, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ReferenceDoc = {
  fileName?: string;
  description?: string;
  textContent?: string;
  fileUrl?: string;
  uploadedAt?: { seconds: number };
};

export default function ReferenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [docData, setDocData] = useState<ReferenceDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "documents", id));
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setDocData(snap.data() as ReferenceDoc);
        }
      } catch (err) {
        console.error("Failed to load reference document", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  return (
    <ProtectedRoute>
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted font-medium">Nội dung tham khảo</p>
            <h1 className="text-2xl font-light truncate">{docData?.fileName || "Đang tải tài liệu..."}</h1>
            {docData?.uploadedAt ? (
              <p className="text-xs text-muted mt-1">
                Cập nhật: {new Date(docData.uploadedAt.seconds * 1000).toLocaleString("vi-VN")}
              </p>
            ) : null}
          </div>
          <Link href="/chat" className="clay-hover-playful px-4 py-2 rounded-[8px] border border-border bg-surface text-foreground text-sm font-medium">
            Quay lại chat
          </Link>
        </div>

        {loading ? (
          <div className="clay-card p-6 text-muted">Đang tải nội dung...</div>
        ) : notFound ? (
          <div className="clay-card p-6">
            <p className="text-foreground font-medium">Không tìm thấy tài liệu tham khảo.</p>
          </div>
        ) : (
          <div className="clay-card p-6 space-y-4">
            {docData?.description ? <p className="text-sm text-muted">{docData.description}</p> : null}
            <div className="prose prose-base max-w-none text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {docData?.textContent || "Tài liệu chưa có nội dung text để hiển thị."}
              </ReactMarkdown>
            </div>
            {docData?.fileUrl ? (
              <a href={docData.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-link hover:underline font-medium">
                Mở file gốc
              </a>
            ) : null}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
