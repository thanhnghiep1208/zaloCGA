import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { docId?: string; fileName: string; excerpt?: string; reference?: string }[];
  attachments?: ChatAttachmentMeta[];
  timestamp: number; // Unix ms
};

export type ChatAttachmentMeta = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  downloadURL: string;
  expiresAt: number; // Unix ms
};

export type ChatSession = {
  id: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messages: StoredMessage[];
};

/** Create a new chat session for the user (optionally with first messages). */
export async function createChatSession(
  userId: string,
  initialMessages: StoredMessage[] = []
): Promise<string> {
  const firstUserMsg = initialMessages.find((m) => m.role === "user");
  const title = firstUserMsg
    ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "")
    : "New Chat";

  const sanitizedMessages = initialMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
    ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
  }));

  const docRef = await addDoc(collection(db, "chatSessions"), {
    userId,
    title,
    messages: sanitizedMessages,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Save updated messages to a session. Auto-generates title from first user message. */
export async function updateChatSession(
  sessionId: string,
  messages: StoredMessage[]
): Promise<void> {
  const firstUserMsg = messages.find((m) => m.role === "user");
  const title = firstUserMsg
    ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "")
    : "New Chat";

  // Sanitize: Firestore does not accept `undefined` values
  const sanitizedMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
    ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
  }));

  await updateDoc(doc(db, "chatSessions", sessionId), {
    messages: sanitizedMessages,
    title,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a specific chat session */
export async function deleteChatSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, "chatSessions", sessionId));
}

/** Delete all sessions for a user older than 7 days */
export async function cleanupOldSessions(userId: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, "chatSessions"),
      where("userId", "==", userId),
      where("updatedAt", "<", Timestamp.fromDate(sevenDaysAgo))
    );

    const snapshot = await getDocs(q);
    const deletes = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "permission-denied") {
      console.warn("[cleanupOldSessions] permission denied (check Firestore rules / indexes)");
      return;
    }
    throw e;
  }
}
