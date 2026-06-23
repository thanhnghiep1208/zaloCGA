"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, deleteObject } from "firebase/storage";
import { trackEvent } from "@/lib/gtag";
import { useAuth } from "@/context/AuthContext";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { useTheme } from "@/context/ThemeContext";

type FirestoreTimestampLike = { seconds: number; nanoseconds?: number };

/** Row shape for admin library table (Firestore `documents` + id). */
type LibraryDocumentRow = {
  id: string;
  status?: string;
  type?: string;
  mimeType?: string;
  fileName?: string;
  title?: string;
  tags?: string[];
  fileUrl?: string;
  storagePath?: string;
  sizeBytes?: number;
  description?: string;
  uploadedEmail?: string | null;
  uploadedAt?: FirestoreTimestampLike;
};

export default function AdminLibraryPage() {
  const [documents, setDocuments] = useState<LibraryDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const { user, role, loading: authLoading } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    if (authLoading) return;
    if (!user || (role !== "admin" && role !== "contributor")) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "documents"), orderBy("uploadedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData: LibraryDocumentRow[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<LibraryDocumentRow, "id">),
      }));
      setDocuments(docsData);
      setLoading(false);
    }, (error) => {
      // Gracefully handle permission errors during sign-out
      if (error.code === 'permission-denied') {
        console.warn("Firestore listener: Permission denied (expected during sign-out)");
      } else {
        console.error("Firestore listener error:", error);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, role, authLoading]);

  const handleDelete = async (
    id: string,
    storagePath: string | undefined,
    fileName: string,
    type?: string
  ) => {
    if (!confirm(`Are you sure you want to permanently delete "${fileName}"?`)) return;
    try {
      if (type === "inline_doc") {
        if (!user) throw new Error("Not authenticated");
        const authHeader = await firebaseBearerAuthHeader(user);
        const res = await fetch(`/api/documents/inline/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { ...authHeader },
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || "Failed to delete inline document");
        }
      } else if (storagePath) {
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef);
        await deleteDoc(doc(db, "documents", id));
      } else {
        await deleteDoc(doc(db, "documents", id));
      }
      trackEvent("file_delete", { file_name: fileName });
    } catch (e) {

      console.error("Failed to delete", e);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: string) => {
    try {
      // Toggle between 'inactive' and the default actionable state 'uploaded'
      const newStatus = currentStatus === "inactive" ? "indexed" : "inactive";
      await updateDoc(doc(db, "documents", id), { status: newStatus });
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const getStatusColor = (status: string) => {
      if (theme === "light") {
        switch (status) {
          case "indexed": return "bg-accent/12 text-link border-accent/30";
          case "ready": return "bg-accent/16 text-link border-accent/35";
          case "processing": return "bg-accent/10 text-link border-accent/25";
          case "uploaded": return "bg-accent/18 text-link border-accent/40";
          case "failed": return "bg-cream text-charcoal border-border";
          case "inactive": return "bg-background text-muted border-border";
          default: return "bg-background text-muted border-border";
        }
      }
      switch(status) {
          case 'indexed': return 'bg-[#15be53]/20 text-[#9df2ba] border-[#15be53]/45';
          case 'ready': return 'bg-[#15be53]/16 text-[#8de5ac] border-[#15be53]/35';
          case 'processing': return 'bg-accent/18 text-accent border-accent/40';
          case 'uploaded': return 'bg-accent/22 text-accent border-accent/50';
          case 'failed': return 'bg-cream/15 text-foreground border-border';
          case 'inactive': return 'bg-background/30 text-muted border-border';
          default: return 'bg-[#9b6829]/25 text-[#ffd9a8] border-[#9b6829]/45';
      }
  };

  const filteredDocs = documents.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    
    if (filterType !== "all") {
      if (filterType === "inline" && d.type !== "inline_doc") return false;
      if (filterType === "uploaded" && d.type === "inline_doc") return false;
      if (filterType === "pdf" && !d.mimeType?.includes("pdf")) return false;
      if (filterType === "csv" && !d.mimeType?.includes("csv")) return false;
      if (filterType === "txt" && !d.mimeType?.includes("text")) return false;
      if (filterType === "docx" && !d.mimeType?.includes("document")) return false;
    }

    if (search) {
      const qs = search.toLowerCase();
      const displayName = (d.fileName || d.title || "").toLowerCase();
      const matchesName = displayName.includes(qs);
      const matchesTags = d.tags?.some((t) => t.toLowerCase().includes(qs));
      if (!matchesName && !matchesTags) return false;
    }
    return true;
  });

  return (
    <ProtectedRoute allowedRoles={["admin", "contributor"]}>
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
           <div className="space-y-1">
             <h1 className="text-2xl font-light tracking-tight">Document Library</h1>
             <p className="text-muted text-sm">Manage your uploaded internal documents.</p>
           </div>
           <Link href="/admin/upload" className="clay-hover-playful bg-cream text-charcoal border border-border px-5 py-2.5 clay-pill text-sm font-medium transition-opacity whitespace-nowrap">
              Upload New
           </Link>
        </div>

        <div className="clay-card flex flex-col sm:flex-row gap-3 pt-2 p-3">
           <input
             id="library-search"
             name="search"
             type="text"
             placeholder="Search by filename or tag..."
             value={search}
             onChange={e => setSearch(e.target.value)}
             className="flex-1 px-4 py-2 border border-border rounded-[8px] bg-surface focus:outline-none focus:ring-2 focus:ring-accent/35 text-sm"
           />
           <select
             id="library-filter-type"
             name="filterType"
             value={filterType}
             onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 border border-border rounded-[8px] bg-surface focus:outline-none text-sm text-foreground"
           >
             <option value="all">All Types</option>
             <option value="pdf">PDF</option>
             <option value="docx">DOCX</option>
             <option value="txt">TXT</option>
             <option value="csv">CSV</option>
             <option value="inline">Inline Doc</option>
             <option value="uploaded">Uploaded File</option>
           </select>
           <select
             id="library-filter-status"
             name="filterStatus"
             value={filterStatus}
             onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-border rounded-[8px] bg-surface focus:outline-none text-sm text-foreground"
           >
             <option value="all">All Statuses</option>
             <option value="uploaded">Uploaded</option>
             <option value="processing">Processing</option>
             <option value="indexed">Indexed</option>
             <option value="failed">Failed</option>
             <option value="inactive">Inactive</option>
           </select>
        </div>

        {loading ? (
          <div className="flex-1 flex justify-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="pt-8">
             <EmptyState 
               title="No documents found"
               description={documents.length === 0 ? "There are currently no documents in the central library." : "No documents match your current filter criteria."}
             />
          </div>
        ) : (
          <div className="clay-card overflow-hidden flex-1">
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-surface border-b border-border text-muted">
                   <tr>
                     <th className="font-medium p-4">File Details</th>
                     <th className="font-medium p-4">Status</th>
                     <th className="font-medium p-4">Tags</th>
                     <th className="font-medium p-4">Uploaded By</th>
                     <th className="font-medium p-4">Date</th>
                     <th className="font-medium p-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                   {filteredDocs.map(doc => (
                    <tr key={doc.id} className={`${theme === "dark" ? "hover:bg-accent/8" : "hover:bg-cream/40"} transition-colors`}>
                       <td className="p-4">
                          {doc.fileUrl ? (
                            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline block truncate max-w-[200px]">
                              {doc.fileName || doc.title}
                            </a>
                          ) : (
                            <span className="font-medium text-foreground block truncate max-w-[200px]">
                              {doc.fileName || doc.title}
                            </span>
                          )}
                          <div className="text-xs text-muted mt-1 flex gap-2 items-center">
                             <span>{doc.type === "inline_doc" ? "Inline document" : `${((doc.sizeBytes || 0) / 1024 / 1024).toFixed(2)} MB`}</span>
                             {doc.description && <span className="truncate max-w-[150px]">— {doc.description}</span>}
                          </div>
                       </td>
                       <td className="p-4">
                         <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(doc.status ?? "")}`}>
                           {doc.status}
                         </span>
                       </td>
                       <td className="p-4 text-muted">
                          <div className="flex gap-1 flex-wrap max-w-[200px]">
                            {doc.tags?.length ? doc.tags.map((t) => (
                               <span key={t} className="bg-border/50 text-xs px-2 py-0.5 rounded text-foreground">{t}</span>
                            )) : "—"}
                          </div>
                       </td>
                       <td className="p-4 text-muted">
                          {doc.uploadedEmail || "—"}
                       </td>
                       <td className="p-4 text-muted">
                          {doc.uploadedAt ? new Date(doc.uploadedAt.seconds * 1000).toLocaleDateString("en-GB") : "Just now"}
                       </td>
                       <td className="p-4 text-right">
                         {doc.type === "inline_doc" ? (
                           <Link
                             href={`/admin/upload?compose=1&edit=${encodeURIComponent(doc.id)}`}
                             className="text-foreground hover:text-link font-medium px-3 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors mr-2"
                           >
                             Edit
                           </Link>
                         ) : null}
                          <button
                            onClick={() => handleToggleActive(doc.id, String(doc.status ?? ""))} 
                            className="text-foreground hover:text-link font-medium px-3 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors mr-2"
                          >
                            {doc.status === "inactive" ? "Activate" : "Deactivate"}
                          </button>
                          <button 
                            onClick={() =>
                              handleDelete(
                                doc.id,
                                doc.storagePath,
                                String(doc.fileName || doc.title || "document"),
                                doc.type
                              )
                            } 
                            className="text-muted hover:text-foreground font-medium px-3 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors"
                          >
                            Delete
                          </button>

                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
