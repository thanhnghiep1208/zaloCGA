import type { ChatScope, DocMessageType, DocUiPattern } from "@/lib/chat/scope-options";

export interface RetrievedSnippet {
  docId?: string;
  fileName: string;
  excerpt?: string;
  reference?: string;
  messageType?: DocMessageType | null;
  uiPattern?: DocUiPattern | null;
}

export interface SearchOptions {
  limit?: number;
  precomputedEmbedding?: number[];
  scope?: ChatScope | null;
}

export interface RetrievalProvider {
  search(query: string, options?: SearchOptions): Promise<RetrievedSnippet[]>;
}
