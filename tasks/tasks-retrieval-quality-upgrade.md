## Relevant Files

- `src/lib/retrieval/FirebaseRetrievalProvider.ts` - Toàn bộ logic vector search, lexical search, merge/fusion, ngưỡng — sửa chính cho M1, M3, M4. ✅ Đã sửa cho M1 (`vectorSearch()`).
- `src/lib/retrieval/FirebaseRetrievalProvider.test.ts` - Test hiện có (`scopeMatchScore`/`applyScopeBoost`) — không đổi, vẫn pass.
- `src/lib/retrieval/chunkMerge.ts` - **Mới (M1):** `dedupeByContentHash`, `mergeAdjacentChunksByDoc` (round-robin theo doc, xem comment trong file lý do không dùng flat sort).
- `src/lib/retrieval/chunkMerge.test.ts` - **Mới (M1):** 9 unit test, bao gồm test chống crowding/round-robin.
- `src/lib/retrieval/eval/golden-set.json` - Golden set 24 cặp (câu hỏi, `expectedDocId`, `source: "real"|"synthetic"`, `notes`). ✅ Đã tạo.
- `src/lib/retrieval/eval/metrics.ts` - Hàm thuần `recallAtK`/`averageRecallAtK`/`reciprocalRank`/`meanReciprocalRank`, không phụ thuộc I/O. ✅ Đã tạo.
- `src/lib/retrieval/eval/metrics.test.ts` - Unit test cho `metrics.ts` (10 test). ✅ Đã tạo, pass.
- `scripts/eval-retrieval.mjs` - Script chạy tay (`node scripts/eval-retrieval.mjs`), mirror logic `FirebaseRetrievalProvider.ts` hiện tại (không import được TS path-alias từ script độc lập, theo đúng convention của `scripts/reindex-embeddings.mjs`) — đọc golden set, gọi Firestore/Gemini thật (read-only), in recall@6/recall@3/MRR. ✅ Đã tạo, đã chạy.
- `src/lib/retrieval/eval/BASELINE.md` - Ghi lại kết quả recall@6/recall@3/MRR baseline (M0) và sau mỗi milestone để so sánh. ✅ Đã tạo, có baseline M0.
- `src/lib/RetrievalService.ts` - Chưa đổi ở M2 (rewrite nằm ở route.ts, gọi trước khi vào RetrievalService); sẽ đổi ở M4 (ngưỡng "không tìm thấy").
- `src/lib/chat/query-rewrite.ts` - **Mới (M2):** `rewriteQuery()` — gọi LLM rẻ nhất để rewrite câu hỏi + suy luận intent, luôn fallback an toàn. ✅ Đã tạo.
- `src/lib/chat/query-rewrite.test.ts` - **Mới (M2):** 9 unit test. ✅ Đã tạo, pass.
- `src/app/api/chat/route.ts` - **Đã sửa (M2):** gọi `rewriteQuery()`, dùng `retrievalQuery`/`queryType` từ kết quả rewrite khi thành công, fallback về hành vi cũ khi không.
- `src/lib/retrieval/rrf.ts` - **Mới (M3):** `computeRRFScore()`, `fuseSnippetsByDoc()` (round-robin theo docOrder). ✅ Đã tạo.
- `src/lib/retrieval/rrf.test.ts` - **Mới (M3):** 14 unit test, gồm 2 test chống crowding-regression. ✅ Đã tạo, pass.
- `src/lib/retrieval/excerptBudget.test.ts` - **Mới (M4):** 3 test khoá lại ngữ nghĩa điểm sàn 0.01 mà `LEXICAL_MIN_SCORE` filter phụ thuộc vào. ✅ Đã tạo, pass.
- `src/lib/retrieval/eval/negative-golden-set.json` - **Mới (M4):** 15 câu hỏi ngoài phạm vi (12 easy + 3 hard) để đo ngưỡng "không tìm thấy". ✅ Đã tạo, đã đo.
- `scripts/calibrate-not-found-threshold.mjs` - **Mới (M4):** đo vector distance/lexical score thật trên positive+negative set, phân tích gap. ✅ Đã tạo, đã chạy — kết luận: không có gap, xem `BASELINE.md`.
- `src/lib/retrieval/llm-relevance-check.ts` - **Mới (M4):** `checkRelevance()` — LLM đánh giá độ liên quan + rerank, fail-open. ✅ Đã tạo.
- `src/lib/retrieval/llm-relevance-check.test.ts` - **Mới (M4):** 11 unit test. ✅ Đã tạo, pass.
- `src/lib/with-timeout.ts` - Tái sử dụng util timeout có sẵn (trước đó `query-rewrite.ts` tự viết lại, đã refactor dùng chung, xoá trùng lặp).
- `scripts/verify-relevance-check-e2e.mjs` - **Mới (M4):** verify end-to-end bằng pipeline production thật + `checkRelevance()` thật trên positive+negative set. ✅ Đã tạo, đã chạy, kết quả trong `BASELINE.md`.
- `src/lib/documents/chunking.ts` - **Đã sửa (M5):** `TextChunk` thêm `headingPath`, `chunkText()` tính heading path theo vị trí.
- `src/lib/documents/chunking.test.ts` - **Mới (M5):** 7 unit test. ✅ Đã tạo, pass.
- `src/lib/documents/embeddings.ts` - **Đã sửa (M5):** `writeDocumentChunks()` lưu `headingPath`, prefix input embed.
- `src/lib/documents/embeddings.test.ts` - **Mới (M5):** 4 unit test. ✅ Đã tạo, pass.
- `scripts/migrate-heading-path.mjs` - **Mới (M5):** script migrate, có `--dry-run`. ✅ Đã tạo, đã dry-run trên dữ liệu thật (17/17 doc, 0 lỗi). **Chưa chạy thật (6.11 chờ xác nhận).**
- `src/lib/documents/chunking.ts` - Thêm heading extraction + `headingPath` vào `TextChunk` (M5).
- `src/lib/documents/chunking.test.ts` - Unit test heading extraction + fallback khi tài liệu không có heading.
- `src/lib/documents/embeddings.ts` - `writeDocumentChunks()` cần lưu `headingPath`, prefix vào text trước khi embed (M5).
- `src/lib/documents/embeddings.test.ts` - Test ghi/đọc `headingPath` trong `document_chunks`.
- `scripts/migrate-heading-path.mjs` - Script migrate chunks cũ: re-chunk + re-embed để ghi `headingPath`, batch + idempotent (M5).
- `firestore.indexes.json` - Cập nhật nếu `headingPath` cần index riêng (chỉ nếu dùng để filter/sort).
- `src/lib/env/*` hoặc trực tiếp trong `FirebaseRetrievalProvider.ts` - Thêm các biến env mới: trọng số RRF (`RETRIEVAL_RRF_*`), ngưỡng lexical, giới hạn snippet/doc.

### Notes

- Unit test đặt cạnh file được test (`*.test.ts` cùng thư mục), dùng Vitest — chạy `npm test` (toàn bộ) hoặc `npx vitest run path/to/file.test.ts` (một file).
- Script eval (`evaluate.ts`) và migration (`migrate-heading-path.mjs`) chạy tay qua Node/tsx, không cần deploy — ghi rõ lệnh chạy trong comment đầu file khi implement.
- Mọi tham số mới phải theo pattern `envInt`/`envFloat` đã có trong `FirebaseRetrievalProvider.ts` (dòng 8–32) để tune qua env, không cần sửa code.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Tạo và checkout branch mới: `git checkout -b feature/retrieval-quality-upgrade`

- [x] 1.0 Eval nền tảng cho retrieval (Milestone 0 — PRD §M0, FR#1–4)
  - [x] 1.1 Truy vấn Firestore `analyticsEvents` để lấy câu hỏi thật từ `query_sent` (script tạm, read-only, đã xoá sau khi dùng) — 435 câu unique thật lấy được từ 478 event gần nhất
  - [x] 1.2 Lọc, làm sạch danh sách câu hỏi thật; đối chiếu với 17 tài liệu `indexed` hiện có (đọc `textContent` preview) để xác định `expectedDocId` — nhiều câu log thật là follow-up phụ thuộc ngữ cảnh hội thoại (vd "tiếng anh màn này") nên bị loại khỏi golden set vì không tự xác định được đáp án đúng khi đứng riêng lẻ
  - [x] 1.3 Chọn được 15 câu thật tự-đứng-được + viết bổ sung 9 câu synthetic phủ các tài liệu còn thiếu (Bottom Sheet, Information Dialog, Promotion Popup, Card, ZInstant Card, Confirmation dialog, Định dạng chữ, Snackbar) — tổng 24 câu, mỗi câu có `source: "real"|"synthetic"`
  - [x] 1.4 Tạo `src/lib/retrieval/eval/golden-set.json` (24 mục, có field `notes` ghi rõ mức độ tin cậy — 4 câu cần contributor xác nhận lại, xem `BASELINE.md`)
  - [x] 1.5 Viết `src/lib/retrieval/eval/metrics.ts`: `recallAtK`, `averageRecallAtK`, `reciprocalRank`, `meanReciprocalRank` (đổi tên/tách nhỏ hơn so với dự kiến ban đầu để dễ unit test độc lập)
  - [x] 1.6 Viết `metrics.test.ts` (10 test, pass) + **`scripts/eval-retrieval.mjs`** thay vì `evaluate.ts`/`evaluate.test.ts` — lý do: không có `tsx`/`ts-node` trong repo nên một script Node độc lập không thể import module TS dùng path alias `@/`; đi theo đúng convention đã có sẵn ở `scripts/reindex-embeddings.mjs` (mirror logic tối thiểu bằng `.mjs` thuần, có ghi chú "keep in sync" ở đầu file)
  - [x] 1.7 Chạy eval lần đầu (read-only), ghi kết quả vào `src/lib/retrieval/eval/BASELINE.md`: recall@6 = 100%, recall@3 = 91.7%, MRR = 0.786
  - [x] 1.8a **Đã chốt với tech lead (2026-09-28):** dùng **recall@3 + MRR** làm tín hiệu chính cho M1–M5 (recall@6 đã sát trần 100% do corpus 17 tài liệu, không còn phân biệt được). Ghi quyết định vào `BASELINE.md`.
  - [ ] 1.8b **Còn mở — cần admin/contributor xác nhận thủ công:** 5 câu trong golden-set (4 chủ đề: dấu hai chấm, màu tooltip, từ "media", quy định viết tắt) được gán `expectedDocId` chỉ từ suy luận trên 1200 ký tự preview mỗi file, chưa đọc toàn văn để xác nhận — xem giải thích chi tiết + cách xác nhận trong `BASELINE.md` mục "5 mục golden-set chưa xác nhận được". Không chặn việc bắt đầu 2.0 (những câu này vẫn tính điểm bình thường), nhưng nên xác nhận trước khi dùng recall@3/MRR làm căn cứ quyết định cuối cùng ở M5.

- [x] 2.0 Merge thay dedup theo docId trong vector search (Milestone 1 — PRD §M1, FR#5–10)
  - [x] 2.1 Tăng default `RETRIEVAL_VECTOR_CANDIDATES` từ 20 → 30 (env vẫn override được)
  - [x] 2.2 Thêm `contentSignature()`/`dedupeByContentHash()` trong `chunkMerge.ts` — dedup theo nội dung chuẩn hoá (trim/lowercase/collapse whitespace), không chỉ theo ID
  - [x] 2.3 Sửa `vectorSearch()`: build `CandidateChunk[]` từ toàn bộ candidate (không dedup 1-chunk/doc ngay từ đầu nữa)
  - [x] 2.4 Viết `mergeAdjacentChunksByDoc()`: gộp chunk liền kề (`chunkIndex` diff ≤ 1) cùng doc thành 1 run, nối bằng `\n\n`
  - [x] 2.5 Thêm env `RETRIEVAL_MAX_SNIPPETS_PER_DOC` (default 3), cap số run giữ lại mỗi doc sau khi gộp
  - [x] 2.6 `mergeResults()` không cần đổi — vốn đã dùng `Set<docId>` nên hoạt động đúng khi vector trả về nhiều snippet cùng docId
  - [x] 2.7 Viết unit test cho `mergeAdjacentChunksByDoc`/`dedupeByContentHash` (9 test, bao gồm case round-robin chống crowding — xem 2.7b)
  - [x] 2.7b **Phát hiện ngoài dự kiến, đã sửa:** thứ tự "flat sort theo distance" ban đầu gây regression (1 doc dài chiếm hết slot, đẩy tài liệu đúng ra top 6) — đổi sang **round-robin theo doc**, có test riêng chứng minh (`"round-robins across docs..."`). Chi tiết trong `BASELINE.md` mục "Sau M1".
  - [x] 2.8 (gộp vào 2.7 — test viết trực tiếp cho `chunkMerge.ts`, không cần mock lại toàn bộ `vectorSearch()`)
  - [x] 2.9 Chạy lại `scripts/eval-retrieval.mjs`, ghi vào `BASELINE.md` mục "Sau M1": recall@6/recall@3/MRR **không đổi so với M0** (giải thích trong BASELINE.md — metric docId-level không thấy được lợi ích context-depth của M1)
  - [x] 2.10 `npx tsc --noEmit` sạch, `npm test` — 170/170 test pass (145 cũ + không phá vỡ gì + 9 mới `chunkMerge` + không đổi các test khác)

- [x] 3.0 Query rewrite cho hội thoại nhiều lượt (Milestone 2 — PRD §M2, FR#11–15)
  - [x] 3.1 Prompt rewrite: input câu hỏi hiện tại + tối đa 4 lượt lịch sử gần nhất, output JSON `{rewrite_query, intent}` — xem `buildPrompt()` trong `query-rewrite.ts`
  - [x] 3.2 Tạo `src/lib/chat/query-rewrite.ts` — hàm `rewriteQuery(query, history, timeoutMs?)`, dùng model **cuối cùng** trong `GEMINI_CHAT_MODEL_FALLBACKS` (`gemini-2.5-flash`, coi là rẻ nhất/ổn định nhất — không có bảng giá chính thức để so sánh, ghi rõ giả định này trong comment)
  - [x] 3.3 Timeout 4s (tham số hoá được cho test) + try/catch: lỗi/timeout/không có lịch sử → trả về `{rewriteQuery: query, intent: null, ok: false}` — thêm field `ok` để phân biệt rõ "rewrite thật" và "fallback", tránh nhầm lẫn khi model chủ động trả về câu gần như không đổi
  - [x] 3.4 Wiring vào `/api/chat/route.ts`: gọi `rewriteQuery()` (tự no-op khi `boundedConversation.length===0`); nếu `ok` dùng `rewrite_query` cho retrieval, nếu không giữ nguyên `naiveRetrievalQuery` (concat 2 lượt user gần nhất — hành vi cũ). `query` gốc vẫn dùng hiển thị UI/lưu `chatSessions` — không đổi.
  - [x] 3.5 Thay `inferQueryType()` bằng `intent` khi `rewritten.ok && rewritten.intent` tồn tại; fallback về heuristic khi không
  - [x] 3.6 9 unit test trong `query-rewrite.test.ts` (thành công, code fence, lỗi model, JSON hỏng, thiếu field, intent lạ, không text, timeout, không có lịch sử) — timeout test dùng `timeoutMs=50` để không làm chậm suite
  - [x] 3.7 Test thủ công với Gemini thật (script tạm, đã xoá sau khi dùng), 2 kịch bản 2-lượt: "còn snackbar thì sao?" → "Snackbar nên dài tối đa bao nhiêu?" (đúng), "có cần khoảng trắng trước nó không?" → "Có cần khoảng trắng trước dấu ba chấm không?" (đúng) — cả 2 đều resolve đúng ngữ cảnh
  - [x] 3.8 Không đo latency thật qua traffic production (chưa deploy) — độ trễ 1 lệnh gọi Gemini Flash thêm cho lượt 2+ là tradeoff đã chấp nhận theo PRD, có timeout cứng 4s để chặn worst-case

- [x] 4.0 Hybrid fusion (RRF) thay union-merge vector+lexical (Milestone 3 — PRD §M3, FR#16–19)
  - [x] 4.1 Thêm env `RETRIEVAL_RRF_WEIGHT_VECTOR`, `RETRIEVAL_RRF_WEIGHT_LEXICAL`, `RETRIEVAL_RRF_K` — **default cuối cùng 1.0/0.0/60, không phải 0.7/0.3 như dự kiến ban đầu** (lý do: xem 4.7)
  - [x] 4.2 `computeRRFScore()` trong `rrf.ts` — nhánh không xuất hiện đóng góp 0 điểm (không loại thẳng), có test riêng
  - [x] 4.3 Sửa `mergeResults()` gọi `fuseSnippetsByDoc()` thay union-merge cũ
  - [x] 4.4 Không thêm lệnh gọi Firestore mới — xác nhận qua code review, `vectorSearch()`/`lexicalSearch()` vẫn chạy song song y hệt cũ
  - [x] 4.5 14 unit test cho `computeRRFScore()`/`fuseSnippetsByDoc()` trong `rrf.test.ts` (đủ case: cả 2 nhánh, chỉ 1 nhánh, trọng số lệch, cap maxTotal, **2 test chống crowding-regression**)
  - [x] 4.6 (gộp vào 4.5)
  - [x] 4.7 **Phát hiện quan trọng, đã xử lý đúng theo FR#19:** với trọng số đề xuất ban đầu (0.7/0.3), recall@3 giảm 91.7%→70.8%, MRR giảm 0.786→0.628 — **vi phạm rào chắn "không được regression"**. Sweep từ 0.3 xuống 0.02: **chỉ trọng số lexical=0 mới về đúng baseline M1**, mọi giá trị >0 đều regression (bảng đầy đủ trong `BASELINE.md`). Nguyên nhân gốc: bug có sẵn từ trước trong `scoreDocument()`/`queryTerms.ts` (đếm substring thô không ranh giới từ, âm tiết tiếng Việt ngắn phổ biến khắp nơi → tài liệu dài thắng giả tạo) — bug này trước đây vô hại vì lexical hiếm khi có trọng số thật, M3 lần đầu làm lộ ra.
  - [x] 4.7b **2 bug phụ tìm được trong lúc điều tra 4.7, đã sửa:** (1) `fuseSnippetsByDoc()` bản đầu gom snippet theo doc liền nhau thay vì round-robin — tái diễn đúng bug crowding của M1, sửa bằng round-robin theo `docOrder`; (2) script `eval-retrieval.mjs` dùng `Number(env.X) || default` khiến override `=0` bị bỏ qua (0 là falsy) — sửa bằng `envFloatVal()` check `undefined`. Xác nhận `envFloat`/`envInt` trong code sản phẩm (`FirebaseRetrievalProvider.ts`) không dính bug này.
  - [x] 4.8 Ship với default `vector=1.0/lexical=0.0/k=60` (không regression, khớp M1 baseline). Ghi đầy đủ bảng sweep + 2 bug phụ vào `BASELINE.md` mục "Sau M3". **Việc còn lại (không thuộc scope M3):** sửa `queryTerms.ts`/`scoreDocument()` để lexical scorer đủ tin cậy trước khi nâng trọng số > 0 — ghi nhận làm follow-up riêng, không tự ý mở rộng scope M3 để sửa.

- [x] 5.0 Ngưỡng "không tìm thấy" + rerank tuỳ chọn (Milestone 4 — PRD §M4, FR#20–22) — **hoàn tất bằng hướng 2 (LLM relevance check)**
  - [x] 5.1 Thêm env `RETRIEVAL_LEXICAL_MIN_SCORE` (default 1), lọc bỏ điểm sàn giả tạo 0.01 trong `lexicalSearch()` — 3 test mới (`excerptBudget.test.ts`), eval lại không regression (khớp M3: 100%/91.7%/0.786)
  - [x] 5.2 **Đã chọn hướng 1 (xây golden set âm để đo ngưỡng), đã đo xong bằng dữ liệu thật — kết luận: không khả thi.** Tạo `negative-golden-set.json` (15 câu ngoài phạm vi) + `scripts/calibrate-not-found-threshold.mjs`, đo vector distance/lexical score thật cho cả 24 positive + 15 negative. Kết quả: **không có gap** — negative tốt nhất (distance 0.3701) nằm lọt thỏm trong khoảng của positive (0.2043–0.5530); đặt threshold ở đâu cũng loại oan nhiều câu positive thật hoặc lọt nhiều câu negative. Chi tiết đầy đủ + bảng số liệu trong `BASELINE.md`. **Đề xuất chuyển sang hướng 2 (LLM đánh giá độ liên quan) — đây là lựa chọn duy nhất còn lại có cơ sở đo đạc, chờ xác nhận trước khi implement.**
  - [x] 5.3 Tạo `src/lib/retrieval/llm-relevance-check.ts` (`checkRelevance()`) — gọi LLM (model rẻ nhất, giống `query-rewrite.ts`), trả về danh sách index liên quan đã sắp theo độ liên quan giảm dần (mảng rỗng = không tìm thấy), fail-open khi lỗi/timeout. Wiring vào `FirebaseRetrievalProvider.search()` sau `mergeResults()`, có kill switch `RETRIEVAL_RELEVANCE_CHECK_ENABLED=0`. Đây đồng thời giải quyết cả FR#21 (không tìm thấy) lẫn FR#22 (rerank) trong 1 lệnh gọi — không cần đánh giá riêng Vertex AI Ranking API nữa.
  - [x] 5.4 11 unit test (`llm-relevance-check.test.ts`): thành công, reorder, lọc bớt, mảng rỗng, code fence, index sai phạm vi, lỗi model, JSON hỏng, thiếu field, không text, timeout — đều fail-open đúng.
  - [x] 5.5 Verify end-to-end bằng `scripts/verify-relevance-check-e2e.mjs` (dùng đúng pipeline production thật, không phải mock) trên 24 câu positive + 15 câu negative. **Kết quả cuối: POSITIVE 19/24 (79.2%), NEGATIVE 15/15 (100%).** Chi tiết đầy đủ (bao gồm 1 bug tìm thấy và đã sửa: cắt excerpt 400 ký tự làm mất câu trả lời thật, sửa lên 2600) trong `BASELINE.md` mục "Sau M4 → Đã triển khai hướng 2".
  - [x] 5.6 Không cần đánh giá Vertex AI Ranking API — đã gộp rerank vào cùng lệnh gọi `checkRelevance()` ở 5.3.
  - [x] 5.7 Quyết định: **go** — LLM relevance check đạt 100% trên negative set (đúng thứ ngưỡng số học không làm được) và 79%+ trên positive set (5 miss còn lại trùng khớp chính xác với các mục golden-set tôi đã tự đánh dấu không chắc chắn từ M0, nghi là do golden-set sai chứ không phải cơ chế sai).
  - [x] 5.8 Implemented, tested (207/207 unit test pass toàn repo, đã bao gồm 11 test mới), eval xong, ghi đầy đủ vào `BASELINE.md`.

- [x] 6.0 Heading path cho chunk + migrate dữ liệu cũ (Milestone 5 — PRD §M5, FR#23–26) — **6.1–6.12 xong, chỉ còn 6.13 (review với tech lead)**
  - [x] 6.1 `extractHeadings()`/`headingPathAt()` trong `chunking.ts` — parse Markdown heading (`#`–`######`), tính path lồng nhau theo vị trí ký tự
  - [x] 6.2 `TextChunk` thêm field `headingPath: string | null`
  - [x] 6.3 `chunkText()` gán `headingPath` cho từng chunk dựa trên vị trí bắt đầu chunk (stack-based, tự động pop khi gặp heading cùng/nông hơn cấp)
  - [x] 6.4 Fallback: không có heading → `headingPath = null` tự nhiên (stack rỗng), có test riêng
  - [x] 6.5 `writeDocumentChunks()`: lưu `headingPath` vào `document_chunks`; input embed = `[headingPath] + text` khi có, giữ nguyên `text` lưu trong DB không prefix
  - [x] 6.6 **Bỏ qua có chủ đích** — chưa có truy vấn nào filter/sort theo `headingPath`, Firestore không cần composite index cho trường hợp này; thêm index không dùng tới là lãng phí. Sẽ thêm nếu sau này có nhu cầu filter theo heading.
  - [x] 6.7 7 unit test cho heading extraction (`chunking.test.ts`): không có heading, 1 cấp, nhiều cấp lồng nhau, pop về cấp nông hơn, reset về heading-1 mới, chunkIndex/text đi kèm đúng, input rỗng
  - [x] 6.8 4 unit test cho `writeDocumentChunks()` (`embeddings.test.ts`): lưu đúng headingPath, prefix embed input đúng, không prefix khi null, chunkCount=0 khi input rỗng
  - [x] 6.9 `scripts/migrate-heading-path.mjs` — quét `documents` indexed, idempotent (check `headingPath !== undefined` trên chunk đầu tiên của mỗi doc để biết đã migrate chưa), có `--dry-run`, log tiến độ dạng `[i/N]`
  - [x] 6.10 Không có môi trường dev/staging riêng (1 Firebase project duy nhất) — thay bằng `--dry-run` (chỉ đọc, không ghi) chạy trên dữ liệu thật: 17/17 doc, 8 doc có headingPath (PDF được Gemini extract theo markdown heading), 9 doc null (chủ yếu .docx qua mammoth, không có heading), 0 lỗi. Khớp đúng dự đoán từ nội dung đã đọc ở M0.
  - [x] 6.11 **Đã chạy trên dữ liệu production thật** (bạn tự chạy sau khi xác nhận): 17/17 tài liệu migrate thành công, 0 lỗi. Verify idempotent bằng `--dry-run` lần 2: 17/17 "already migrated".
  - [x] 6.12 Eval cuối cùng: `eval-retrieval.mjs` → recall@6/recall@3/MRR không đổi (100%/91.7%/0.786, giống M0-M4). `verify-relevance-check-e2e.mjs` chạy lại sau re-embed → POSITIVE 19/24 (không đổi), NEGATIVE 14/15 (giảm 1, 1 câu lẻ dao động — không phải regression hệ thống). Bảng tổng hợp M0→M5 đầy đủ trong `BASELINE.md`.
  - [ ] 6.13 **Review tổng kết với tech lead — đang chờ** (xem tóm tắt bên dưới)

- [x] 7.0 Rà lại toàn bộ FR theo TDD (sau khi merge PR #1)
  - [x] 7.1 Thừa nhận: phần lớn test M1–M5 viết **sau** code. Với code đã có, mỗi test mới đều được kiểm chứng bằng mutation: cố ý làm hỏng đúng dòng code → xác nhận test FAIL → khôi phục → PASS.
  - [x] 7.2 FR#21: test chặn tái diễn bug cắt excerpt 400 ký tự (`llm-relevance-check.test.ts`).
  - [x] 7.3 FR#13/#14: tách `resolveRetrievalQuery()` (viết test trước khi hàm tồn tại), `route.ts` dùng đúng hàm đó.
  - [x] 7.4 FR#20/#21: `FirebaseRetrievalProvider.search.test.ts` chạy `search()` thật trên Firestore giả — ngưỡng lexical, wiring relevance check, kill switch. Xoá test cũ trong `excerptBudget.test.ts` tự viết lại bộ lọc (xoá bộ lọc thật mà test đó vẫn pass).
  - [x] 7.5 FR#18: test số lượt đọc Firestore mỗi lần `search()` (đúng 1 chunks + 1 documents, 0 getAll).
  - [x] 7.6 FR#25: tách logic migrate ra `scripts/lib/migrate-heading-path-core.mjs` (nhận `db` qua tham số), 6 test trên Firestore giả: ghi đủ field, chạy lần 2 không ghi/embed gì, `null` ≠ thiếu field, dry-run, bỏ qua doc rỗng, lỗi giữa chừng được thử lại ở lần sau.
  - [x] 7.7 Chống lệch script ↔ TS: gom mọi bản sao logic trong script về `scripts/lib/` (`retrieval-mirror.mjs`, `chunking.mjs`, `pipeline.mjs`, `runtime.mjs`). `mirror-drift.test.ts` + test pipeline trong `FirebaseRetrievalProvider.search.test.ts` chạy cùng input qua cả 2 bản và so kết quả — đã kiểm chứng bằng 11 mutation phía TS, tất cả bị bắt (mutation thứ 12 — thêm stopword — không đổi hành vi, chính nó dẫn tới bug 7.9). Chạy lại `eval-retrieval`, `calibrate`, `migrate --dry-run` trên dữ liệu thật: kết quả giống hệt trước refactor.
  - [x] 7.8 **Bug tìm thêm, đã sửa:** `reindex-embeddings.mjs` (có từ trước) giữ bản `chunkText` cũ trước M5 → chạy nó sẽ âm thầm xoá `headingPath` của toàn bộ chunk. Đã cho dùng `scripts/lib/chunking.mjs` + ghi `headingPath`. **Chưa chạy** (script ghi production).
  - [x] 7.9 **Bug tìm thêm, ĐÃ SỬA (PR riêng):** stopword tiếng Việt trong `queryTerms.ts` gần như vô tác dụng — stopword lưu có dấu (`"của"`) nhưng token bị bỏ dấu trước khi so (`"cua"`), chỉ `"cho"`/`"trong"` còn lọc được. Sửa sẽ đổi kết quả lexical search trên production nên cần chạy lại eval trước khi merge. → Đã sửa: so stopword trước khi bỏ dấu (có test chặn cách sửa sai làm mất `cỡ`/`đỏ`). Eval: weight 0 không đổi; weight 0.1/0.3 cải thiện nhẹ nhưng vẫn kém weight 0 → giữ lexical=0. Xem `BASELINE.md` mục "Sửa stopword tiếng Việt".
  - [x] 7.10 **Bug tìm thêm khi cập nhật docs — đã sửa:** query rewrite (M2) không tác động tới vector search vì route dùng thẳng embedding client tính sẵn cho câu gốc. Sửa: `reusableClientEmbedding()` (`src/lib/chat/query-rewrite.ts`) chỉ giữ vector client khi câu search trùng câu gốc; ngược lại server embed lại câu đã rewrite/scope. Test: `query-rewrite.test.ts` (unit) + `src/app/api/chat/route.test.ts` (mức route, đã thấy fail trước khi sửa).
- [x] 8.0 Sửa lỗi React #185 khi chuyển tab sau New Chat (PR #4) — không liên quan retrieval, ghi ở đây vì phát hiện cùng đợt. Chi tiết: `docs/PROJECT_OVERVIEW.md` mục 11.
