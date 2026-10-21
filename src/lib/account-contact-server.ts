import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import type { AccountContact } from "@/lib/account-contact";

const SETTINGS_COLLECTION = "settings";
const CONTACT_DOC_ID = "accountContact";

function contactDocRef() {
  if (!adminDb) return null;
  return adminDb.collection(SETTINGS_COLLECTION).doc(CONTACT_DOC_ID);
}

/** Env values are the fallback until an admin saves the contact from /admin/users. */
function contactFromEnv(): AccountContact {
  return {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "",
    zalo: process.env.NEXT_PUBLIC_CONTACT_ZALO?.trim() ?? "",
  };
}

export async function getAccountContact(): Promise<AccountContact> {
  const ref = contactDocRef();
  if (!ref) return contactFromEnv();
  try {
    const snap = await ref.get();
    if (!snap.exists) return contactFromEnv();
    const data = snap.data() ?? {};
    return {
      email: typeof data.email === "string" ? data.email : "",
      zalo: typeof data.zalo === "string" ? data.zalo : "",
    };
  } catch (err) {
    console.error("[account-contact] read failed", err);
    return contactFromEnv();
  }
}

export async function saveAccountContact(contact: AccountContact, updatedBy: string): Promise<void> {
  const ref = contactDocRef();
  if (!ref) throw new Error("Firebase Admin not configured");
  await ref.set({ ...contact, updatedBy, updatedAt: FieldValue.serverTimestamp() });
}
