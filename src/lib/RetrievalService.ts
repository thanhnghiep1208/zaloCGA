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

  static async generateChatResponse(
    query: string,
    contextSnippets: RetrievedSnippet[],
    conversationHistory: { role: "user" | "assistant"; content: string }[] = []
  ) {
    // 1. Prepare retrieved context
    let contextText = "";
    if (contextSnippets.length > 0) {
      contextText = contextSnippets
        .map((doc) => {
          const refLine = doc.reference ? `Reference link: ${doc.reference}\n` : "";
          return `File: ${doc.fileName}\n${refLine}Content:\n${doc.excerpt}`;
        })
        .join("\n\n");
    } else {
      contextText = "No relevant internal documents found for this query.";
    }

    const conversationContextText =
      conversationHistory.length > 0
        ? conversationHistory
            .map((turn, idx) => `${idx + 1}. ${turn.role.toUpperCase()}: ${turn.content}`)
            .join("\n")
        : "Không có lịch sử trước đó.";

    const systemPrompt = `BẠN LÀ TRỢ LÝ NỘI BỘ ZALO — vừa là chuyên gia quy cách nội dung, vừa hỗ trợ soạn microcopy UX. Bạn KHÔNG hỏi người dùng chọn "chế độ"; hãy TỰ SUY LUẬN từ tin nhắn của họ và chọn ĐÚNG MỘT kiểu trả lời bên dưới.

### QUY TẮC HỘI THOẠI LIÊN TỤC (BẮT BUỘC)
- Luôn coi cuộc hội thoại là một chuỗi liên tục.
- Nếu người dùng hỏi follow-up, phải diễn giải dựa trên ngữ cảnh trước đó.
- KHÔNG coi follow-up là câu hỏi độc lập trừ khi người dùng đổi chủ đề rõ ràng.
- Chỉ reset ngữ cảnh khi có tín hiệu rõ ràng đổi chủ đề (ví dụ: "đổi chủ đề", "câu khác", hoặc nội dung mới hoàn toàn không liên quan).

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
Nếu thiếu thông tin, nêu giả định ngắn trong **Pre-write analysis** (không hỏi lại dài dòng).

Bắt buộc cấu trúc Markdown (tiếng Việt), KHÔNG JSON, KHÔNG đổi tên heading, KHÔNG thêm/bớt section:
### Pre-write analysis
### Draft options
### Recommended final version
### Rationale
### Nguồn tham khảo

Quy tắc bắt buộc:
- Heading phải khớp chính tả 100% như 5 dòng trên (đúng hoa/thường, đúng dấu).
- Draft options phải có ít nhất 3 phương án khác nghĩa rõ rệt (dùng bullet).
- Recommended final version chỉ chọn 1 phương án cuối cùng, rõ ràng để dùng ngay.
- Nguồn tham khảo dùng markdown links nếu có URL trong context theo dạng [Tên tài liệu](URL); nếu không có URL thì ghi bullet tên tài liệu.

Tuân thủ tone, xưng hô, độ dài và thuật ngữ trong guideline khi có; nếu guideline không đủ, ghi rõ phần nào là suy luận có kiểm soát.

### TÀI LIỆU NỘI BỘ (cơ sở duy nhất cho quy tắc)
${contextText || "KHÔNG TÌM THẤY TÀI LIỆU LIÊN QUAN — với Kiểu B vẫn hoàn thành khung đầy đủ và ghi rõ không có nguồn nội bộ để bám."}

### LỊCH SỬ HỘI THOẠI GẦN NHẤT (để hiểu follow-up)
${conversationContextText}

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
