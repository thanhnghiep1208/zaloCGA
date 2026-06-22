"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  clearAuthSessionId,
  getOrCreateAuthSessionId,
  registerAuthSession,
  subscribeCurrentAuthSessionRevoked,
  touchAuthSession,
} from "@/lib/auth-sessions";
import { doc, getDoc } from "firebase/firestore";

const SESSION_COOKIE = "__session";

function setSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=1; path=/; SameSite=Strict; max-age=86400`;
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; SameSite=Strict; max-age=0`;
}

export type UserRole = "admin" | "contributor" | "user";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
});

function parseRole(value: unknown): UserRole | null {
  if (value === "admin" || value === "contributor" || value === "user") {
    return value;
  }
  return null;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        clearSessionCookie();
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, "users", firebaseUser.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          clearSessionCookie();
          await signOut(auth);
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        const r = parseRole(data.role);
        if (!r) {
          clearSessionCookie();
          await signOut(auth);
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        setSessionCookie();
        setUser(firebaseUser);
        setRole(r);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== "permission-denied") {
          console.error("Error fetching user role", error);
        }
        clearSessionCookie();
        await signOut(auth);
        setUser(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const sessionId = getOrCreateAuthSessionId();
    if (!sessionId) return;

    void registerAuthSession(user.uid).catch((err) => {
      console.error("Failed to register auth session", err);
    });

    const unsubRevoked = subscribeCurrentAuthSessionRevoked(sessionId, () => {
      clearAuthSessionId();
      void signOut(auth);
    });

    const heartbeat = setInterval(() => {
      void touchAuthSession(sessionId).catch(() => {});
    }, 60_000);

    return () => {
      unsubRevoked();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
