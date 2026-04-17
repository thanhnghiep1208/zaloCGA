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
import { useTheme } from "@/context/ThemeContext";


export default function AdminLibraryPage() {
  const [documents, setDocuments] = useState<any[]>([]);
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
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

  const handleDelete = async (id: string, storagePath: string, fileName: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${fileName}"?`)) return;
    try {
      if (storagePath) {
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef);
      }
      await deleteDoc(doc(db, "documents", id));
      trackEvent("file_delete", { file_name: fileName });
    } catch (e) {

      console.error("Failed to delete", e);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: string) => {
    try {
      // Toggle between 'inactive' and the default actionable state 'uploaded'
      const newStatus = currentStatus === "inactive" ? "uploaded" : "inactive";
      await updateDoc(doc(db, "documents", id), { status: newStatus });
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const getStatusColor = (status: string) => {
      if (theme === "light") {
        switch (status) {
          case "indexed": return "bg-green-100 text-green-700 border-green-200";
          case "ready": return "bg-emerald-100 text-emerald-700 border-emerald-200";
          case "processing": return "bg-indigo-100 text-indigo-700 border-indigo-200";
          case "uploaded": return "bg-purple-100 text-purple-700 border-purple-200";
          case "failed": return "bg-rose-100 text-rose-700 border-rose-200";
          case "inactive": return "bg-slate-100 text-slate-700 border-slate-200";
          default: return "bg-amber-100 text-amber-700 border-amber-200";
        }
      }
      switch(status) {
          case 'indexed': return 'bg-[#15be53]/20 text-[#9df2ba] border-[#15be53]/45';
          case 'ready': return 'bg-[#15be53]/16 text-[#8de5ac] border-[#15be53]/35';
          case 'processing': return 'bg-[#533afd]/18 text-[#cfc9ff] border-[#b9b9f9]/45';
          case 'uploaded': return 'bg-[#533afd]/24 text-[#dcd8ff] border-[#b9b9f9]/55';
          case 'failed': return 'bg-[#ea2261]/20 text-[#ffb3cb] border-[#ea2261]/45';
          case 'inactive': return 'bg-white/8 text-white/70 border-white/20';
          default: return 'bg-[#9b6829]/25 text-[#ffd9a8] border-[#9b6829]/45';
      }
  };

  const filteredDocs = documents.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    
    if (filterType !== "all") {
      if (filterType === "pdf" && !d.mimeType?.includes("pdf")) return false;
      if (filterType === "csv" && !d.mimeType?.includes("csv")) return false;
      if (filterType === "txt" && !d.mimeType?.includes("text")) return false;
      if (filterType === "docx" && !d.mimeType?.includes("document")) return false;
    }

    if (search) {
      const qs = search.toLowerCase();
      const matchesName = d.fileName?.toLowerCase().includes(qs);
      const matchesTags = d.tags?.some((t: string) => t.toLowerCase().includes(qs));
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
           <Link href="/admin/upload" className="clay-hover-playful bg-[#533afd] hover:bg-[#4434d4] border border-transparent text-white px-5 py-2.5 clay-pill text-sm font-normal transition-colors shadow-[var(--stripe-shadow-elevated)] whitespace-nowrap">
              Upload New
           </Link>
        </div>

        <div className="clay-card flex flex-col sm:flex-row gap-3 pt-2 p-3">
           <input 
             type="text"
             placeholder="Search by filename or tag..."
             value={search}
             onChange={e => setSearch(e.target.value)}
             className="flex-1 px-4 py-2 border border-border rounded-[4px] bg-surface focus:outline-none focus:ring-2 focus:ring-[#533afd]/30 text-sm"
           />
           <select 
             value={filterType} 
             onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 border border-border rounded-[4px] bg-surface focus:outline-none text-sm text-foreground"
           >
             <option value="all">All Types</option>
             <option value="pdf">PDF</option>
             <option value="docx">DOCX</option>
             <option value="txt">TXT</option>
             <option value="csv">CSV</option>
           </select>
           <select 
             value={filterStatus} 
             onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-border rounded-[4px] bg-surface focus:outline-none text-sm text-foreground"
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
                    <tr key={doc.id} className="hover:bg-white/5 transition-colors">
                       <td className="p-4">
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline block truncate max-w-[200px]">
                            {doc.fileName}
                          </a>
                          <div className="text-xs text-muted mt-1 flex gap-2 items-center">
                             <span>{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                             {doc.description && <span className="truncate max-w-[150px]">— {doc.description}</span>}
                          </div>
                       </td>
                       <td className="p-4">
                         <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(doc.status)}`}>
                           {doc.status}
                         </span>
                       </td>
                       <td className="p-4 text-muted">
                          <div className="flex gap-1 flex-wrap max-w-[200px]">
                            {doc.tags?.length ? doc.tags.map((t: string) => (
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
                          <button 
                            onClick={() => handleToggleActive(doc.id, doc.status)} 
                            className="text-foreground hover:text-accent font-medium px-3 py-1.5 rounded-[4px] hover:bg-white/10 transition-colors mr-2"
                          >
                            {doc.status === "inactive" ? "Activate" : "Deactivate"}
                          </button>
                          <button 
                            onClick={() => handleDelete(doc.id, doc.storagePath, doc.fileName)} 
                            className="text-[#ff8fb3] hover:text-[#ffb3cb] font-medium px-3 py-1.5 rounded-[4px] hover:bg-[#ea2261]/20 transition-colors"
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
