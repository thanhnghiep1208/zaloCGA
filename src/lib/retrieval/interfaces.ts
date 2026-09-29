import type { ChatScope, DocMessageType, DocUiPattern } from "@/lib/chat/scope-options";
import type { UsageSink } from "@/lib/llm-usage";

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
  /** Receives token usage of any Gemini call made during the search. */
  onUsage?: UsageSink;
}

export interface RetrievalProvider {
  search(query: string, options?: SearchOptions): Promise<RetrievedSnippet[]>;
}
