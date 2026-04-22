import { RetrievalProvider, RetrievedSnippet } from "./interfaces";
import { adminDb } from "@/lib/firebase-admin";

export class FirebaseRetrievalProvider implements RetrievalProvider {
  async search(queryText: string, limit: number = 100): Promise<RetrievedSnippet[]> {
    try {
      console.log(`[AdminRetrieval] Searching Firestore for query: "${queryText}" (up to ${limit} files)`);
      
      if (!adminDb) {
        throw new Error("Firebase Admin SDK not initialized. Check server logs for details.");
      }

      // Using Admin SDK (adminDb) which bypasses Security Rules
      const snapshot = await adminDb
        .collection("documents")
        .where("status", "==", "indexed")
        .limit(limit)
        .get();
  
      console.log(`[AdminRetrieval] Successfully fetched ${snapshot.size} indexed documents.`);

      const snippets: RetrievedSnippet[] = [];
  
      snapshot.docs.forEach(doc => {
         const data = doc.data();
         if (data.textContent) {
             console.log(`[AdminRetrieval] Injecting: ${data.fileName} (${data.textContent.length} chars)`);
             snippets.push({
                 docId: doc.id,
                 fileName: data.fileName,
                 excerpt: data.textContent, 
                 reference: `/references/${doc.id}`
             });
         } else {
             console.warn(`[AdminRetrieval] Warning: Doc ${data.fileName} is indexed but has NO textContent.`);
         }
      });
  
      return snippets;

    } catch(e: any) {
      console.error("[AdminRetrieval] Fatal Error during document fetch:", e);
      return [];
    }
  }
}

