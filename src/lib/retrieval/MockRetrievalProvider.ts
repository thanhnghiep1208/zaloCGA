import { RetrievalProvider, RetrievedSnippet } from "./interfaces";

export class MockRetrievalProvider implements RetrievalProvider {
  async search(query: string, limit = 3): Promise<RetrievedSnippet[]> {
    // In the MVP, this is an integration boundary placeholder. 
    // In Phase 8/custom deployment, you can swap this class out for Vertex AI Search,
    // a managed Gemini File API search call, or a custom Pinecone/pgvector lookup.
    
    // Simulate lookup latency
    await new Promise(resolve => setTimeout(resolve, 800));

    return [
      {
        fileName: "Corporate_Travel_Policy_v4.pdf",
        excerpt: "Flights over 6 hours in duration are eligible for premium economy class upgrades with manager approval.",
        reference: "Section 2.1 - Air Travel"
      },
      {
        fileName: "WFH_Guidelines.docx",
        excerpt: "Employees are granted flexible remote work opportunities up to 3 days per week provided core hours overlap. Commutes are not reimbursed.",
        reference: "Page 2"
      }
    ];
  }
}
