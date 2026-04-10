"use client";

import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/gtag";


export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const syncUserToFirestore = async (user: any) => {
    try {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      
      const targetRole = user.email === 'thanhnghiep1208@gmail.com' ? 'admin' : 'user';

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: targetRole,
          createdAt: serverTimestamp()
        });
      } else {
        // Nếu user đã tồn tại nhưng có email là thanhnghiep1208@gmail.com mà chưa là admin thì tự động nâng cấp  
        if (targetRole === 'admin' && docSnap.data().role !== 'admin') {
           await setDoc(docRef, { role: 'admin' }, { merge: true });
        }
      }
    } catch (err) {
      console.error("Could not sync user to firestore", err);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await syncUserToFirestore(cred.user);
      trackEvent("login", { method: "Google" });
      router.push("/chat");

    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-surface min-h-screen animate-in fade-in duration-500">
      <div className="bg-background border border-border rounded-xl shadow-sm p-10 w-full max-w-[28rem] space-y-8">
        <div className="text-center space-y-4 pb-2">
          <div className="w-16 h-16 bg-surface border border-border shadow-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent" fill="none" strokeWidth={1.5} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.38.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" /></svg>
          </div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Internal Portal</h1>
          <p className="text-muted text-[15px] max-w-sm mx-auto leading-relaxed">Sign in securely using your company Google account to access the knowledge base.</p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 text-[13px] p-3 rounded-lg border border-red-100 text-center font-medium">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button 
            type="button" 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-surface border border-border hover:bg-black/5 text-foreground py-3.5 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-3 shadow-sm hover:border-black/20"
          >
            {loading ? (
               <div className="flex gap-1.5 items-center">
                 <div className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }}></div>
               </div>
            ) : (
                <>
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  <span className="text-[15px]">Sign in with Google</span>
                </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
