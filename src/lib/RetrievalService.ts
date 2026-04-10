import { GoogleGenAI } from "@google/genai";
import { RetrievalProvider, RetrievedSnippet } from "./retrieval/interfaces";
import { FirebaseRetrievalProvider } from "./retrieval/FirebaseRetrievalProvider";

// Ensure process is safely typed or falls back
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "dummy",
  httpOptions: { apiVersion: "v1beta" }
});

// Abstraction layer swapped to LIVE FIREBASE MODE!
const currentProvider: RetrievalProvider = new FirebaseRetrievalProvider();

export class RetrievalService {
  static async getContext(query: string): Promise<RetrievedSnippet[]> {
     return await currentProvider.search(query);
  }

  static async generateChatResponse(query: string, contextSnippets: RetrievedSnippet[]) {
    // 1. Prepare retrieved context
    let contextText = "";
    if (contextSnippets.length > 0) {
      contextText = contextSnippets.map(doc => `File: ${doc.fileName}\nContent:\n${doc.excerpt}`).join("\n\n");
    } else {
      contextText = "No relevant internal documents found for this query.";
    }

    // 2. Combine System Prompt + Context + User Query
    const systemPrompt = `BẠN LÀ CHUYÊN GIA VỀ QUY CÁCH NỘI DUNG (ZALO CONTENT STRATEGIST).
NHIỆM VỤ: Trả lời câu hỏi dựa TRỰC TIẾP và DUY NHẤT trên các tài liệu nội bộ được cung cấp dưới đây.

### 4 TÁC VỤ CHÍNH BẠN PHẢI THỰC HIỆN:
1. **GENERATE NỘI DUNG (Generator):** Khi người dùng yêu cầu viết (Title, Description, CTA...), bạn phải tuân thủ đúng độ dài, tông điệu (Voice & Tone) và xưng hô (ví dụ: Bạn, Tôi, Zalo) có trong Guidelines.
2. **TRA CỨU THUẬT NGỮ (Glossary):** Trả về định nghĩa chính xác từ Glossary nếu có. Nếu không có, hãy báo không tìm thấy trong từ điển nội bộ.
3. **CUNG CẤP RULE/SYNTAX:** Trình bày rõ các quy tắc viết (viết hoa, dấu câu, tiếng Anh...) dưới dạng **Code Block** hoặc **Bảng** để người dùng dễ theo dõi.
4. **DẪN NGUỒN (Citation):** Luôn ghi rõ thông tin này nằm ở tài liệu nào.

### QUY TẮC ĐỊNH DẠNG (BẮT BUỘC):
- Sử dụng Markdown phân cấp rõ ràng (h3, bold, lists).
- **KHOẢNG CÁCH (Dãn dòng):** Phải sử dụng 2 lần xuống dòng (\n\n) giữa mỗi đoạn văn, giữa tiêu đề và nội dung, và giữa các mục trong danh sách. Nếu không có khoảng cách này, người dùng sẽ không đọc được.
- Ngôn ngữ: Tiếng Việt chuyên nghiệp, tinh tế.

### TÀI LIỆU NỘI BỘ ĐƯỢC CUNG CẤP:
${contextText || "KHÔNG TÌM THẤY TÀI LIỆU LIÊN QUAN."}

---
KẾT THÚC CÂU TRẢ LỜI PHẢI LUÔN CÓ:
[SOURCES_USED: tên_file1.pdf, tên_file2.pdf]`;

    // 3. Initiate Stream
    try {
      console.log(`[ChatService] Sending ${contextText.length} chars of context to Gemini 3.`);
      const responseStream = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: query }] }],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          temperature: 0.1
        }
      });
      return responseStream;
    } catch (error) {
      console.error("Gemini API Error", error);
      throw new Error("Failed to generate response.");
    }
  }
}
