export interface RetrievedSnippet {
  fileName: string;
  excerpt?: string;
  reference?: string;
}

export interface RetrievalProvider {
  /**
   * Search uploaded documents based on the query, returning snippets.
   */
  search(query: string, limit?: number): Promise<RetrievedSnippet[]>;
}
