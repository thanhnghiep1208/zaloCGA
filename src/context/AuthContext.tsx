"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  clearAuthSessionId,
  getOrCreateAuthSessionId,
  registerAuthSession,
  subscribeCurrentAuthSessionRevoked,
  touchAuthSession,
} from "@/lib/auth-sessions";
import { doc, getDoc } from "firebase/firestore";
import { withTimeout } from "@/lib/with-timeout";

const SESSION_COOKIE = "__session";

async function setSessionCookie(user: User) {
  try {
    const token = await user.getIdToken();
    // max-age=3600 matches Firebase ID token lifetime; onIdTokenChanged re-fires on refresh.
    document.cookie = `${SESSION_COOKIE}=${token}; path=/; SameSite=Strict; max-age=3600`;
  } catch {
    clearSessionCookie();
  }
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; SameSite=Strict; max-age=0`;
}

export type UserRole = "admin" | "contributor" | "user";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  authError: null,
});

const ROLE_FETCH_ERROR_MESSAGE =
  "Không thể tải thông tin tài khoản. Có thể trình duyệt đang chặn kết nối tới Firebase (tiện ích chặn quảng cáo/bảo mật) hoặc mạng đang chậm — vui lòng kiểm tra rồi thử lại.";
const ACCOUNT_NOT_PROVISIONED_MESSAGE =
  "Tài khoản chưa được cấp quyền. Vui lòng liên hệ admin.";
const ROLE_FETCH_TIMEOUT_MS = 10_000;
const ROLE_FETCH_ATTEMPTS = 2;

function parseRole(value: unknown): UserRole | null {
  if (value === "admin" || value === "contributor" || value === "user") {
    return value;
  }
  return null;
}

// Firestore reads right after sign-in can be slow to connect (long-polling
// detection, cold IndexedDB cache) and time out even though the account is
// fine. Retry transient failures before giving up and signing the user out —
// otherwise a single slow network blip forces a manual page refresh to log in.
async function fetchRoleDoc(docRef: ReturnType<typeof doc>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ROLE_FETCH_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(getDoc(docRef), ROLE_FETCH_TIMEOUT_MS);
    } catch (error) {
      if ((error as { code?: string })?.code === "permission-denied") throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        clearSessionCookie();
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setAuthError(null);

      try {
        const docRef = doc(db, "users", firebaseUser.uid);
        const docSnap = await fetchRoleDoc(docRef);

        if (!docSnap.exists()) {
          setAuthError(ACCOUNT_NOT_PROVISIONED_MESSAGE);
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
          setAuthError(ACCOUNT_NOT_PROVISIONED_MESSAGE);
          clearSessionCookie();
          await signOut(auth);
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        await setSessionCookie(firebaseUser);
        setUser(firebaseUser);
        setRole(r);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== "permission-denied") {
          console.error("Error fetching user role", error);
          setAuthError(ROLE_FETCH_ERROR_MESSAGE);
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
    <AuthContext.Provider value={{ user, role, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
