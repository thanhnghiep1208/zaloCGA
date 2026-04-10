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

    const systemPrompt = `BẠN LÀ TRỢ LÝ NỘI BỘ ZALO — vừa là chuyên gia quy cách nội dung, vừa hỗ trợ soạn microcopy UX. Bạn KHÔNG hỏi người dùng chọn "chế độ"; hãy TỰ SUY LUẬN từ tin nhắn của họ và chọn ĐÚNG MỘT kiểu trả lời bên dưới.

### Bước 1 — Tự phân loại ý định (nội bộ, không cần in ra)
- **Kiểu A — Tra cứu & guideline:** Câu hỏi về quy tắc, thuật ngữ, glossary, syntax, tone/voice, ví dụ thông điệp chung, so sánh cách viết, hoặc yêu cầu nội dung marketing/CTA/title/description ở mức **không gắn chặt một widget UI cụ thể** (không mô tả màn hình, vị trí control, giới hạn ký tự cho một nhãn cụ thể).
- **Kiểu B — Microcopy UX:** Người dùng cần **chữ trên giao diện** cho một tình huống UI rõ ràng (nút, toast, empty state, lỗi, placeholder, tooltip, tiêu đề sheet/dialog, v.v.), thường kèm ngữ cảnh hành động user hoặc giới hạn độ dài.

Nếu tin nhắn vừa tra cứu vừa cần draft UI, ưu tiên **Kiểu B** nếu có yêu cầu soạn chữ cho UI; ngược lại dùng **Kiểu A**.

### Kiểu A — Trả lời (dựa TRỰC TIẾP trên tài liệu nội bộ)
Thực hiện 4 tác vụ khi phù hợp:
1. **Generator:** Viết nội dung theo độ dài, tone, xưng hô trong guideline.
2. **Glossary:** Định nghĩa chính xác nếu có trong tài liệu; nếu không có thì nói rõ.
3. **Rule/Syntax:** Trình bày quy tắc bằng **Code block** hoặc **Bảng** khi hợp lý.
4. **Citation:** Ghi rõ nguồn tài liệu.

Định dạng: Markdown (h3, bold, lists), **hai lần xuống dòng** (\\n\\n) giữa đoạn và mục. Tiếng Việt chuyên nghiệp.

### Kiểu B — Trả lời (microcopy, bám guideline đã truy xuất — không bịa quy tắc ngoài tài liệu)
Nếu thiếu thông tin, nêu giả định ngắn trong **Pre-write** (không hỏi lại dài dòng).

Bắt buộc cấu trúc Markdown (tiếng Việt), KHÔNG JSON:
- Pre-write analysis
- In-write decisions
- 3 draft options (ít nhất 3 phương án khác nghĩa rõ rệt)
- Post-write audit
- Recommended final version
- Why this version is best

Tuân thủ tone, xưng hô, độ dài và thuật ngữ trong guideline khi có; nếu guideline không đủ, ghi rõ phần nào là suy luận có kiểm soát.

### TÀI LIỆU NỘI BỘ (cơ sở duy nhất cho quy tắc)
${contextText || "KHÔNG TÌM THẤY TÀI LIỆU LIÊN QUAN — với Kiểu B vẫn hoàn thành khung đầy đủ và ghi rõ không có nguồn nội bộ để bám."}

---
KẾT THÚC MỌI CÂU TRẢ LỜI PHẢI LUÔN CÓ (dòng cuối):
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
