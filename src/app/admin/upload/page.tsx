"use client";

import { useState, useCallback } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/gtag";
import { InlineDocumentEditor } from "@/components/InlineDocumentEditor";
import { buildUploadedFileBasePayload } from "@/lib/documents/indexing";
import { useEffect } from "react";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { toFriendlyErrorMessage } from "@/lib/user-error";


export default function AdminUploadPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editInlineId = searchParams.get("edit");
  const [mode, setMode] = useState<"upload" | "compose">(
    searchParams.get("compose") === "1" || !!editInlineId ? "compose" : "upload"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [progress, setProgress] = useState(0);

  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [inlineInitialDraft, setInlineInitialDraft] = useState<{
    title: string;
    category: string;
    tags: string[];
    contentHtml: string;
  } | null>(null);
  const [inlineLoading, setInlineLoading] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFiles([]);
    setDescription("");
    setTagsInput("");
  };

  const handleUpload = async () => {
    if (files.length === 0 || !user) return;
    setUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileIndex(i);
        setProgress(0);

        const storagePath = `documents/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        // 1. Upload to Storage
        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setProgress(p);
            },
            (err) => reject(err),
            () => resolve(true)
          );
        });

        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

        const authHeader = await firebaseBearerAuthHeader(user);
        await fetch("/api/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            eventName: "file_uploaded",
            payload: {
              file_type: file.type || "unknown",
              size: file.size,
            },
          }),
        }).catch(() => {});

        // 2. Initial Firestore save
        const newDocRef = await addDoc(collection(db, "documents"), {
          ...buildUploadedFileBasePayload({
            fileName: file.name,
            fileUrl: downloadURL,
            storagePath,
            mimeType: file.type,
            sizeBytes: file.size,
            tags,
            description,
          }),
          uploadedBy: user.uid,
          uploadedEmail: user.email,
          uploadedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 3. AI Extraction
        try {
          const ingestRes = await fetch("/api/ingest", {
             method: "POST",
             headers: {
               "Content-Type": "application/json",
               ...authHeader,
             },
             body: JSON.stringify({
               fileUrl: downloadURL,
               mimeType: file.type,
               fileName: file.name,
               docId: newDocRef.id,
             }),
          });

          const ingestData = await ingestRes.json();
          if (ingestRes.ok && ingestData.textContent) {
            await updateDoc(newDocRef, { textContent: ingestData.textContent, status: "indexed" });
            trackEvent("file_upload", { 
              file_name: file.name, 
              file_type: file.type,
              status: "indexed"
            });
          } else {
          await updateDoc(newDocRef, { status: "failed", description: `AI Error: ${ingestData.error || "Failed"}` });
          trackEvent("file_upload_failed", { 
            file_name: file.name, 
            error: ingestData.error || "Failed"
          });
        }
        } catch (apiError) {
          console.error("Ingest error", apiError);
          await updateDoc(newDocRef, { status: "failed", description: "Network Error" });
        }
      }

      setUploading(false);
      router.push("/admin/library");

    } catch (e: unknown) {
      console.error("Batch upload error", e);
      setUploading(false);
      alert(toFriendlyErrorMessage(e));
    }
  };

  useEffect(() => {
    const loadInlineForEdit = async () => {
      if (!editInlineId) {
        setInlineInitialDraft(null);
        return;
      }
      setInlineLoading(true);
      try {
        const snap = await getDoc(doc(db, "documents", editInlineId));
        const data = snap.data() as
          | {
              type?: string;
              title?: string;
              category?: string | null;
              tags?: string[];
              contentHtml?: string;
            }
          | undefined;
        if (!snap.exists() || data?.type !== "inline_doc") {
          throw new Error("Inline document not found");
        }
        setInlineInitialDraft({
          title: data.title || "",
          category: data.category || "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          contentHtml: data.contentHtml || "<p></p>",
        });
      } catch (err: unknown) {
        alert(toFriendlyErrorMessage(err));
      } finally {
        setInlineLoading(false);
      }
    };
    loadInlineForEdit();
  }, [editInlineId]);

  const handleInlineDraftSubmit = async (payload: {
    title: string;
    category: string;
    tags: string[];
    contentHtml: string;
    contentPlain: string;
  }) => {
    if (!user) return;
    const authHeader = await firebaseBearerAuthHeader(user);
    const endpoint = editInlineId
      ? `/api/documents/inline/${encodeURIComponent(editInlineId)}`
      : "/api/documents/inline";
    const res = await fetch(endpoint, {
      method: editInlineId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        title: payload.title,
        category: payload.category,
        tags: payload.tags,
        contentHtml: payload.contentHtml,
        uploadedEmail: user.email || null,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string; id?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to save inline document");
    }
    trackEvent("file_upload", {
      file_name: payload.title,
      file_type: "inline_doc",
      status: "indexed",
    });
    alert(editInlineId ? "Da cap nhat inline document." : "Da luu inline document thanh cong.");
    router.push("/admin/library");
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "contributor"]}>
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
        <div className="space-y-1">
           <h1 className="text-2xl font-light tracking-tight">Upload Documents</h1>
           <p className="text-muted text-sm">
             Add documents to the knowledge base (PDF, TXT, DOCX, CSV) or compose inline docs.
           </p>
        </div>

        <div className="inline-flex rounded-[10px] border border-border p-1 bg-surface/80">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`px-3 py-1.5 text-sm rounded-[8px] transition-colors ${
              mode === "upload"
                ? "bg-accent/18 text-foreground border border-accent/35"
                : "text-muted hover:text-foreground"
            }`}
          >
            Upload PDF/DOCX
          </button>
          <button
            type="button"
            onClick={() => setMode("compose")}
            className={`px-3 py-1.5 text-sm rounded-[8px] transition-colors ${
              mode === "compose"
                ? "bg-accent/18 text-foreground border border-accent/35"
                : "text-muted hover:text-foreground"
            }`}
          >
            Soan tai lieu
          </button>
        </div>

        {mode === "upload" && (files.length === 0 ? (
          <label 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="mt-8 flex-1 border border-dashed border-accent/50 rounded-[16px] bg-surface/50 flex flex-col items-center justify-center p-12 text-center hover:bg-accent/5 transition-colors min-h-[40vh] cursor-pointer group"
          >
             <div className="w-16 h-16 bg-background border border-border shadow-sm rounded-full flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
               <svg className="w-8 h-8 text-muted" fill="none" strokeWidth={1.5} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
             </div>
             <span className="text-sm font-medium text-foreground">Select multiple files here</span>
             <span className="text-xs text-muted mt-2">or drag and drop them anytime</span>
             <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.txt,.docx,.csv" multiple />
          </label>
        ) : (
          <div className="clay-card mt-8 p-8 flex flex-col max-w-3xl mx-auto w-full space-y-8">
            
            {/* File List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Selected Files ({files.length})</h3>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                {files.map((f, idx) => (
                  <div key={idx} className={`p-4 rounded-[16px] border flex items-center justify-between transition-colors ${idx === currentFileIndex ? "border-accent/45 bg-accent/10 ring-1 ring-accent/30" : "border-border bg-background"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center">
                         <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground line-clamp-1">{f.name}</span>
                        <span className="text-[10px] text-muted">{(f.size / 1024 / 1024).toFixed(2)} MB {idx === currentFileIndex && "• Processing..."}</span>
                      </div>
                    </div>
                    {!uploading && (
                      <button onClick={() => removeFile(idx)} className="p-2 hover:bg-accent/12 text-muted hover:text-foreground rounded-[8px] transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted">Description (for all files)</label>
                <input 
                   disabled={uploading}
                   value={description}
                   onChange={e => setDescription(e.target.value)}
                   className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
                   placeholder="E.g., Batch upload Q3 docs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted">Tags (comma separated)</label>
                <input 
                   disabled={uploading}
                   value={tagsInput}
                   onChange={e => setTagsInput(e.target.value)}
                   className="w-full px-4 py-2 border border-border rounded-[8px] bg-background focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
                   placeholder="policy, rules"
                />
              </div>
            </div>

            {uploading && (
               <div className="w-full space-y-3 pt-4 border-t border-border">
                  <div className="flex justify-between text-xs font-medium text-foreground mb-1">
                    <span>File {currentFileIndex + 1} of {files.length}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                  <p className="text-xs text-center text-muted italic">
                    {progress < 100 
                      ? `Uploading ${files[currentFileIndex].name}...` 
                      : `AI Analysis in progress for ${files[currentFileIndex].name}...`}
                  </p>
               </div>
            )}

            {!uploading && (
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={resetForm}
                  className="clay-hover-playful flex-1 py-3 rounded-[8px] border border-border font-medium hover:bg-accent/15 text-foreground transition-colors"
                >
                  Clear All
                </button>
                <button 
                  onClick={handleUpload}
                  className="clay-hover-playful flex-1 py-3 rounded-[8px] bg-cream text-charcoal border border-border font-medium transition-opacity"
                >
                  Start Batch Processing
                </button>
              </div>
            )}
          </div>
        ))}

        {mode === "compose" ? (
          inlineLoading ? (
            <div className="clay-card mt-8 p-6 max-w-4xl mx-auto w-full text-sm text-muted">
              Dang tai noi dung inline document...
            </div>
          ) : (
            <InlineDocumentEditor
              initialDraft={inlineInitialDraft || undefined}
              submitLabel={editInlineId ? "Cap nhat tai lieu" : "Luu tai lieu"}
              onSubmitDraft={handleInlineDraftSubmit}
            />
          )
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
