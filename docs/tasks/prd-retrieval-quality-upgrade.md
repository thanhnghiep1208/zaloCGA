# PRD: Nâng cấp chất lượng Retrieval (RAG)

> **Trạng thái (2026-10): đã triển khai M0–M5 — tài liệu lịch sử.** Phần mô tả "hiện tại" bên dưới là trạng thái **trước** nâng cấp (vd. bug 1 chunk/doc đã sửa bằng `chunkMerge.ts`). Hành vi đang chạy: `docs/PROJECT_OVERVIEW.md` mục 5.5; số đo: `src/lib/retrieval/eval/BASELINE.md`. Những điểm thực tế khác với PRD:
> - Model rewrite: cố định phần tử cuối `GEMINI_CHAT_MODEL_FALLBACKS` (`gemini-models.ts`), **không** đọc từ `GEMINI_CHAT_MODELS`.
> - Trọng số RRF chốt **1.0 / 0 / 60** (vector / lexical / k), không phải 0.7 / 0.3 — lexical > 0 làm giảm chất lượng.
> - "Không tìm thấy" xử lý bằng LLM relevance check (`checkRelevance()` trong `FirebaseRetrievalProvider.search()`), không phải ngưỡng số trong `RetrievalService.getContext`.
> - Reranker: chọn LLM reranker, không dùng Vertex AI.

## 1) Introduction/Overview

Chat hiện tại dùng `FirebaseRetrievalProvider` (vector search qua Firestore `findNearest` + lexical search trên `documents`) để lấy ngữ cảnh cho Gemini trả lời guideline nội dung Zalo và soạn microcopy. Đánh giá gần đây (đối chiếu với kiến trúc retrieval của WeKnora — xem `docs/` thread liên quan) phát hiện các hạn chế cụ thể, đã verify trực tiếp trong code:

- **Bug xác nhận:** `vectorSearch()` trong `src/lib/retrieval/FirebaseRetrievalProvider.ts` chỉ giữ **1 chunk tốt nhất mỗi `docId`** (dòng dedup `if (!seen.has(docId))`), nên các file guideline dài có nhiều đoạn liên quan bị mất phần lớn ngữ cảnh — team hiện phải tách nhỏ file để né giới hạn này (workaround cho hạn chế của code, không phải cấu trúc nội dung hợp lý).
- Không có bước đo lường retrieval (recall/MRR) — `relevance_score` hiện tại chỉ so khớp từ giữa câu hỏi và **câu trả lời**, không đo retrieval đúng/sai.
- Không có query rewrite cho hội thoại nhiều lượt — câu follow-up ngắn ("còn snackbar thì sao?") embed gần như vô nghĩa nếu không có ngữ cảnh lượt trước.
- Vector search đã có ngưỡng khoảng cách (`distanceThreshold`), nhưng lexical search và kết quả merge cuối cùng thì chưa — không có cơ chế "không tìm thấy guideline" rõ ràng để tránh bot bịa câu trả lời tự tin nhưng sai.
- Union merge vector+lexical hiện tại (`mergeResults`, luôn chạy song song) chỉ là **ưu tiên vector rồi bù chỗ trống**, chưa phải fusion có trọng số (RRF).
- Chunk cắt theo ranh giới câu/đoạn (đã tôn trọng `\n\n`/câu) nhưng không mang theo heading path, nên một đoạn tách rời khỏi tiêu đề gốc dễ mất ngữ cảnh khi đứng một mình trong context.

**Mục tiêu PRD:** nâng chất lượng retrieval theo lộ trình milestone, đo được bằng eval set, chấp nhận đổi schema Firestore (`document_chunks`) nếu cần để đạt impact tối đa (theo lựa chọn phạm vi của stakeholder: 1C/2A/3C).

## 2) Goals

1. Xây eval set + script đo `recall@K` và `MRR` cho retrieval, chạy độc lập (không cần UI), dùng để đo trước/sau mỗi milestone.
2. Sửa dedup theo docId để một file dài có thể đóng góp nhiều đoạn liên quan (không giới hạn cứng 1 chunk/doc).
3. Thêm query rewrite cho lượt hội thoại thứ 2 trở đi, dùng model rẻ nhất trong danh sách fallback hiện có.
4. Nâng union-merge vector+lexical hiện tại lên fusion có trọng số (RRF hoặc tương đương), tune trọng số bằng eval set.
5. Thêm ngưỡng "không tìm thấy" áp dụng cho lexical search và cho danh sách merge cuối cùng (vector đã có ngưỡng riêng), để bot trả lời "chưa có guideline cho trường hợp này" thay vì bịa.
6. Thêm heading path vào đầu mỗi chunk trước khi embed, cải thiện recall cho các đoạn ngắn đứng tách rời.
7. Giảm định tính số lượng file guideline phải tách nhỏ chỉ để né giới hạn retrieval (đo qua phản hồi từ contributor/admin, không phải metric tự động).

## 3) User Stories

- **Là một nhân viên tra guideline**, khi tôi hỏi về một quy tắc nằm trong file guideline dài (nhiều mục), tôi muốn nhận được tất cả các đoạn liên quan trong file đó, không chỉ đoạn khớp nhất.
- **Là một nhân viên hỏi tiếp theo dòng hội thoại** ("còn snackbar thì sao?"), tôi muốn hệ thống hiểu câu hỏi dựa trên ngữ cảnh câu trước, không coi đó là câu hỏi độc lập.
- **Là người dùng hỏi về trường hợp chưa có trong guideline nội bộ**, tôi muốn bot nói rõ "chưa có guideline cho trường hợp này" thay vì tự tin đưa ra câu trả lời không có căn cứ.
- **Là contributor quản lý tài liệu**, tôi không còn phải tách một file guideline lớn thành nhiều file nhỏ chỉ để retrieval hoạt động đúng.
- **Là người vận hành (admin/dev)**, tôi muốn có một bộ eval chạy tay để biết chắc mỗi thay đổi retrieval thực sự cải thiện chất lượng, không phải đoán.

## 4) Functional Requirements

### Milestone 0 — Eval nền tảng (làm trước, chạy song song với M1)

1. Hệ thống phải có một golden set 15–30 cặp (câu hỏi, docId/chunk đúng kỳ vọng), lưu dưới dạng file JSON/TS trong repo (ví dụ `src/lib/retrieval/eval/golden-set.json`). **Ưu tiên câu hỏi thật** lấy từ log `query_sent` trong `analyticsEvents` và các câu bị phản hồi 👎 (`user_feedback`); nếu log thật chưa đủ 15–30 câu đại diện (thiếu case biên, thiếu đa dạng chủ đề), **bổ sung thêm câu tự viết** để lấp khoảng trống — câu tự viết phải ghi chú rõ nguồn gốc (`source: "real" | "synthetic"` trong golden set) để phân biệt khi phân tích kết quả sau này.
2. Hệ thống phải có một script/test (Vitest, chạy tay qua `npm run` hoặc `vitest run`) tính **recall@6** (tỷ lệ câu hỏi mà docId đúng nằm trong top 6 kết quả trả về) và **MRR** (vị trí trung bình nghịch đảo của docId đúng) trên golden set.
3. Script eval phải chạy được độc lập với UI, không cần deploy, dùng thẳng `FirebaseRetrievalProvider` hiện có.
4. Kết quả eval (recall@6, MRR) phải được ghi lại (file log hoặc console output) trước khi bắt đầu M1, để làm baseline so sánh.

### Milestone 1 — Merge thay dedup theo docId

5. Vector search phải lấy top 20–30 chunk ứng viên (tăng từ `VECTOR_CANDIDATES` hiện tại nếu cần) thay vì chỉ giữ 1 chunk/doc ngay từ bước đầu.
6. Hệ thống phải dedup theo `chunkId` (không phải chỉ theo `docId`) và theo content signature (hash nội dung) để loại chunk trùng lặp thật sự.
7. Các chunk liên tiếp cùng `docId` (chunkIndex liền kề, ví dụ 4-5-6) phải được gộp thành một snippet duy nhất thay vì tách rời.
8. Mỗi `docId` chỉ được đóng góp tối đa 2–3 snippet vào kết quả cuối cùng (giới hạn có thể cấu hình qua env), để một file lớn không chiếm hết ngân sách context.
9. Thay đổi này không được yêu cầu đổi schema Firestore `document_chunks` (đã có `chunkIndex`, `docId`, `text`, `embedding`) — chỉ sửa logic ở tầng ứng dụng (`FirebaseRetrievalProvider.ts`).
10. Sau khi triển khai M1, phải chạy lại script eval (M0) và ghi nhận recall@6/MRR mới, so sánh với baseline.

### Milestone 2 — Query rewrite

11. Khi `conversationHistory.length > 0`, hệ thống phải gọi một lệnh LLM nhỏ (model rẻ nhất trong `GEMINI_CHAT_MODELS`) để sinh `{ rewrite_query: string, intent: "guideline" | "microcopy" }` dựa trên câu hỏi hiện tại + lịch sử gần nhất.
12. Khi `conversationHistory.length === 0` (lượt đầu tiên), hệ thống không được gọi thêm lệnh rewrite — giữ nguyên latency lượt đầu.
13. `rewrite_query` phải được dùng để embed/tìm kiếm (thay vì câu hỏi gốc thô), còn câu hỏi gốc vẫn dùng để hiển thị UI và lưu `chatSessions` (không đổi hành vi hiển thị).
14. `intent` trả về từ bước rewrite phải thay thế heuristic `inferQueryType()` hiện tại làm nguồn ghi nhận `scope_message_type` trong analytics.
15. Nếu lệnh rewrite lỗi hoặc timeout, hệ thống phải fallback về câu hỏi gốc (không rewrite) — không được để lỗi rewrite làm hỏng toàn bộ luồng chat.

### Milestone 3 — Hybrid fusion (RRF) thay union-merge

16. Hệ thống phải thay `mergeResults()` (hiện tại: ưu tiên vector, bù lexical cho docId chưa có) bằng công thức fusion có trọng số theo rank: `score = w_vector / (k + rank_vector) + w_lexical / (k + rank_lexical)`, với `w_vector`, `w_lexical`, `k` cấu hình được qua env (giá trị khởi tạo gợi ý: 0.7/0.3/60, cần tune lại bằng eval set — không copy nguyên giá trị từ WeKnora mà không kiểm chứng).
17. Kết quả từ vector-only hoặc lexical-only (không có trong tập kia) vẫn phải được tính điểm hợp lệ (rank ở nhánh kia coi như "ngoài top N", không bị loại thẳng).
18. Thay đổi này không được làm tăng số lượt gọi Firestore so với hiện tại (lexical search đã chạy song song mỗi query rồi — đây chỉ là đổi công thức xếp hạng, không đổi số query).
19. Sau M3, phải chạy lại eval và so sánh recall@6/MRR với M1 baseline; nếu MRR giảm so với M1, phải rollback trọng số về cấu hình cũ qua env (không cần deploy code mới).

### Milestone 4 — Ngưỡng "không tìm thấy" + rerank (tuỳ chọn nếu ngân sách cho phép)

20. Lexical search phải có ngưỡng điểm tối thiểu (tương tự `VECTOR_DISTANCE_THRESHOLD` đã có cho vector) — loại bỏ kết quả có `countTermHits` = 0 hoặc dưới ngưỡng khỏi danh sách "extras".
21. Danh sách merge cuối cùng (sau M3) phải có một ngưỡng tổng hợp: nếu không snippet nào vượt ngưỡng, `RetrievalService.getContext` phải trả về mảng rỗng và prompt phải chỉ rõ cho model trả lời "chưa có guideline cho trường hợp này" (đã có sẵn câu fallback trong system prompt — chỉ cần đảm bảo điều kiện trigger đúng).
22. (Tuỳ chọn, cần so giá trước khi chọn) Hệ thống có thể thêm một bước rerank (Vertex AI Ranking API hoặc Gemini làm LLM-reranker chấm điểm batch) cho top 15–20 kết quả trước bước lọc ngưỡng — quyết định triển khai bước này dựa trên kết quả eval M3 (chỉ làm nếu recall đã đủ nhưng ranking thứ tự vẫn kém).

### Milestone 5 — Heading path trong chunk

23. Khi ingest tài liệu (`src/lib/documents/chunking.ts` hoặc bước gọi nó trong `/api/ingest`), hệ thống phải trích xuất đường dẫn heading (nếu tài liệu có cấu trúc heading Markdown/HTML rõ ràng) và lưu vào **field riêng `headingPath`** trên document `document_chunks` (không chỉ prefix vào `text`) — cho phép hiển thị/lọc theo heading sau này mà không phải parse lại `text`. Khi embed, `headingPath` vẫn được nối vào đầu nội dung chunk (dạng `[Heading cấp 1 > Heading cấp 2 > ...] nội dung chunk`) để vector search hưởng lợi ngữ nghĩa.
24. Tài liệu không có cấu trúc heading rõ ràng (ví dụ TXT thuần) phải fallback về hành vi chunk hiện tại — `headingPath` để `null`, không lỗi, không prefix rỗng gây nhiễu.
25. Vì `headingPath` là field mới trên `document_chunks`, hệ thống phải có **script migrate** chạy tay (ví dụ `scripts/reindex-embeddings.mjs` mở rộng hoặc script mới `scripts/migrate-heading-path.mjs`) để re-chunk + re-embed toàn bộ tài liệu `indexed` hiện có, ghi `headingPath` cho chunks cũ. Script phải chạy được theo batch (không timeout), log tiến độ, và an toàn để chạy lại nhiều lần (idempotent — bỏ qua chunk đã có `headingPath`).
26. Chunks cũ chưa migrate (`headingPath` không tồn tại) vẫn phải tìm kiếm được bình thường qua vector/lexical search trong lúc migrate đang chạy — không được có downtime retrieval.

## 5) Non-Goals (Out of Scope)

- Không triển khai GraphRAG/Neo4j, agent ReAct framework, hay auto-sync connector (Confluence/Notion/GitLab) — quá mức cần thiết so với quy mô nội dung guideline hiện tại.
- Không đổi UI trích dẫn nguồn (citation ở mức chunk/highlight đoạn gốc trong file viewer) trong PRD này — ghi nhận là ý tưởng cho PRD riêng sau.
- Không xây MCP server để expose knowledge base ra ngoài (Claude Code/Cursor) — ghi nhận là ý tưởng riêng, không thuộc phạm vi nâng cấp retrieval này.
- Không đổi mô hình chunking sang parent-child (child nhỏ để match, parent lớn để trả về) — chỉ làm nếu M1 (merge theo chunk liền kề) vẫn chưa đủ sau khi đo eval; không làm song song để tránh đổi quá nhiều biến cùng lúc khó debug.
- Không bắt buộc phải giữ nguyên schema `document_chunks` nếu một milestone cần trường mới (theo lựa chọn 2A) — nhưng mọi thay đổi schema phải đi kèm migration script cho dữ liệu cũ, không được để tài liệu cũ mất khả năng tìm kiếm.

## 6) Design Considerations

- Không có thay đổi UI/UX trực tiếp — toàn bộ nằm ở tầng backend retrieval (`src/lib/retrieval/`, `src/lib/RetrievalService.ts`, `src/lib/documents/`).
- Câu trả lời "chưa có guideline cho trường hợp này" (M4) cần khớp giọng văn hệ thống hiện có trong system prompt (`RetrievalService.ts` dòng ~118) — không cần thiết kế UI mới, chỉ đảm bảo model nhận đúng tín hiệu "không có context".

## 7) Technical Considerations

- Toàn bộ thay đổi nằm trong `src/lib/retrieval/FirebaseRetrievalProvider.ts`, `src/lib/RetrievalService.ts`, `src/lib/documents/chunking.ts`, `src/lib/documents/embeddings.ts`, và có thể thêm file mới trong `src/lib/retrieval/eval/`.
- Mọi tham số mới (trọng số RRF, ngưỡng lexical, số snippet/doc) phải cấu hình qua biến môi trường theo pattern `envInt`/`envFloat` đã có trong `FirebaseRetrievalProvider.ts`, để tune được qua eval mà không cần deploy code.
- Query rewrite (M2) dùng model rẻ nhất trong `GEMINI_CHAT_MODELS`/`DEFAULT_GEMINI_CHAT_MODELS` — không thêm dependency LLM mới.
- Nếu M4 chọn dùng Vertex AI Ranking API, cần so sánh giá với việc dùng Gemini làm LLM-reranker trước khi quyết định (đã nêu trong PRD, chưa chốt phương án).
- Thay đổi schema `document_chunks` (nếu cần cho M1/M5) phải cập nhật `firestore.indexes.json` và chạy `firebase deploy --only firestore:indexes` theo quy trình đã ghi trong `docs/PROJECT_OVERVIEW.md` mục 10.2.
- Mọi milestone phải có test Vitest tương ứng (unit test cho logic merge/fusion/threshold), theo convention hiện có (`src/lib/retrieval/*.test.ts` nếu có, hoặc tạo mới).

## 8) Success Metrics

- **Recall@6** trên golden set: chấp nhận **"cải thiện tương đối"** so với baseline M0 sau mỗi milestone — không đặt ngưỡng tuyệt đối (ví dụ "phải đạt 80%"), vì golden set ban đầu nhỏ và một phần synthetic. Miễn là recall@6 không giảm và có xu hướng tăng qua các milestone là đạt.
- **MRR** trên golden set: tăng hoặc giữ nguyên qua từng milestone; nếu milestone nào làm giảm MRR, phải rollback tham số (theo yêu cầu #19) trước khi tiếp tục.
- **Định tính:** giảm số lần contributor/admin phải tách nhỏ file guideline để "né" giới hạn retrieval — theo dõi qua phản hồi trực tiếp, không cần dashboard riêng.
- **Vận hành:** tất cả tham số mới đều chỉnh được qua env, không yêu cầu deploy lại để tune sau khi có baseline eval.

## 9) Decisions (đã chốt với stakeholder)

1. **Golden set:** ưu tiên câu thật từ log (`query_sent`/`user_feedback`), bổ sung câu tự viết nếu log chưa đủ đa dạng — xem yêu cầu #1.
2. **Ngưỡng recall/MRR:** không đặt số tuyệt đối, chấp nhận "cải thiện tương đối" qua từng milestone — xem mục 8) Success Metrics.
3. **M4 (rerank):** giữ tuỳ chọn, quyết định triển khai dựa trên kết quả eval của M3 — xem yêu cầu #22.
4. **Schema `document_chunks`:** chấp nhận thêm field mới `headingPath` + migrate chunks cũ bằng script riêng — xem yêu cầu #23–26.
5. **Thứ tự M4/M5 và các quyết định kỹ thuật phát sinh khi triển khai:** do **tech lead** quyết định.
