import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

const missingClientEnvKeys = [
  !firebaseApiKey ? "NEXT_PUBLIC_FIREBASE_API_KEY" : null,
  !firebaseAuthDomain ? "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" : null,
  !firebaseProjectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
  !firebaseStorageBucket ? "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" : null,
  !firebaseMessagingSenderId ? "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" : null,
  !firebaseAppId ? "NEXT_PUBLIC_FIREBASE_APP_ID" : null,
].filter(Boolean) as string[];
if (missingClientEnvKeys.length > 0) {
  throw new Error(
    `[Firebase] Missing required env vars: ${missingClientEnvKeys.join(", ")}. ` +
      "Please set them in your environment (App Hosting -> Environment variables)."
  );
}

const firebaseConfig = {
  apiKey: firebaseApiKey!,
  authDomain: firebaseAuthDomain!,
  projectId: firebaseProjectId!,
  storageBucket: firebaseStorageBucket!,
  messagingSenderId: firebaseMessagingSenderId!,
  appId: firebaseAppId!,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
