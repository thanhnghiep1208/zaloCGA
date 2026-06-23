export interface RetrievedSnippet {
  docId?: string;
  fileName: string;
  excerpt?: string;
  reference?: string;
}

export interface RetrievalProvider {
  search(query: string, limit?: number, precomputedEmbedding?: number[]): Promise<RetrievedSnippet[]>;
}
