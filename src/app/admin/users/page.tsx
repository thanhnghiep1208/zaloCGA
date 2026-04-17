"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser, role, loading: authLoading } = useAuth(); // Prevent self-deletion
  const { theme } = useTheme();

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || role !== "admin") {
      setLoading(false);
      return;
    }

    // Listen to changes on the users collection
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        // Canonical profile path for Storage/Firestore rules is always users/{auth.uid}
        profileUid: (d.data() as { uid?: string }).uid ?? d.id,
      }));
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      // Gracefully handle permission errors during sign-out transition
      if (error.code === 'permission-denied') {
        console.warn("User listener: Permission denied (expected during sign-out)");
      } else {
        console.error("Permission denied reading users collection:", error);
        alert("Access error: You may not have administrative permissions to view this list.");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser, role, authLoading]);

  const handleRoleChange = async (profileUid: string, newRole: string) => {
    try {
      await setDoc(
        doc(db, "users", profileUid),
        { role: newRole, uid: profileUid },
        { merge: true }
      );
    } catch (e) {
      console.error("Failed to update user role", e);
    }
  };

  const handleDelete = async (profileUid: string) => {
    if (profileUid === currentUser?.uid) {
       alert("You cannot delete your own active administrator account.");
       return;
    }
    
    // Note: This deletes the database record. It doesn't instantly sign them out of Firebase Auth
    // unless you implement a secure edge function, but this wipes out their stored context & roles.
    if (!confirm("Are you sure you want to delete this user profile?")) return;
    
    try {
      await deleteDoc(doc(db, "users", profileUid));
    } catch (e) {
      console.error("Failed to delete user", e);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
        <div className="space-y-1">
           <h1 className="text-2xl font-light tracking-tight">Manage Users</h1>
           <p className="text-muted text-sm">Control access, view roles, and manage internal user permissions.</p>
        </div>

        {loading ? (
          <div className="flex-1 flex justify-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : users.length === 0 ? (
           <div className="pt-8 text-center text-muted">No users found.</div>
        ) : (
          <div className="clay-card overflow-hidden flex-1">
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-surface border-b border-border text-muted">
                   <tr>
                     <th className="font-medium p-4">Email</th>
                     <th className="font-medium p-4">UID</th>
                     <th className="font-medium p-4">Role</th>
                     <th className="font-medium p-4">Joined</th>
                     <th className="font-medium p-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                   {users.map(u => (
                    <tr key={u.profileUid} className={`${theme === "dark" ? "hover:bg-accent/8" : "hover:bg-cream/40"} transition-colors`}>
                       <td className="p-4 font-medium text-foreground">{u.email}</td>
                       <td className="p-4 text-muted text-[11px] font-mono tracking-tighter opacity-70 truncate max-w-[150px]">{u.uid}</td>
                       <td className="p-4">
                           <select 
                              value={u.role || "user"}
                              onChange={(e) => handleRoleChange(u.profileUid, e.target.value)}
                              disabled={u.uid === currentUser?.uid}
                              className={`text-xs font-semibold rounded-[8px] px-2.5 py-1.5 outline-none border transition-colors cursor-pointer ${
                                 u.role === 'admin' 
                                   ? theme === "dark"
                                     ? "bg-accent/20 text-accent border-accent/45"
                                     : "bg-accent/18 text-link border-accent/40"
                                   : u.role === 'contributor'
                                     ? theme === "dark"
                                       ? "bg-accent/14 text-accent border-accent/40"
                                       : "bg-accent/12 text-link border-accent/30"
                                     : theme === "dark"
                                       ? "bg-background/30 text-foreground border-border"
                                       : "bg-background text-muted border-border"
                              }`}
                           >
                              <option value="user">User</option>
                              <option value="contributor">Contributor</option>
                              <option value="admin">Admin</option>
                           </select>
                       </td>
                       <td className="p-4 text-muted text-xs">
                          {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB") : "Just now"}
                       </td>
                       <td className="p-4 text-right space-x-2">
                          <button 
                            onClick={() => handleDelete(u.profileUid)} 
                            disabled={u.uid === currentUser?.uid}
                            className="text-muted hover:text-foreground font-medium px-3 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
