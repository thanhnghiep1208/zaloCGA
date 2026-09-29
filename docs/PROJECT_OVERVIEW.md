# Internal Knowledge Chat - Project Overview

Tài liệu này là bản tổng hợp end-to-end cho dự án: kiến trúc tổng thể, flow tính năng, frontend, backend, Firebase, và quy trình deploy/vận hành.

## 1) Mục tiêu sản phẩm

`Internal Knowledge Chat` là trợ lý nội bộ giúp:

- Tra cứu guideline nội dung Zalo từ kho tài liệu nội bộ.
- Soạn microcopy UX theo ngữ cảnh UI, vẫn bám guideline nội bộ.
- Quản trị tài liệu tri thức (upload/index/search) theo role.

Điểm chính của bản hiện tại:

- Chat chỉ tạo `chatSessions` sau khi user gửi tin nhắn đầu tiên (không tạo session rỗng).
- Chat mode được hợp nhất: model tự suy luận truy vấn guideline hay microcopy UX.
- API có xác thực token Firebase và kiểm soát role cho các route nhạy cảm.

---

## 2) Tech stack

- **Frontend + Backend app:** Next.js App Router (`src/app/`*)
- **Auth / DB / Storage:** Firebase Auth, Firestore, Firebase Storage
- **Server admin access:** Firebase Admin SDK
- **LLM:** Google GenAI (`gemini-3.8-flash`, fallback `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`)
- **Embedding:** `gemini-embedding-2` (1536 chiều) — dùng cho vector search
- **DOCX parsing:** `mammoth`
- **Deploy runtime:** Firebase App Hosting (Cloud Run managed)

---

## 3) Kiến trúc tổng thể

### 3.1 Thành phần chính

- **Client App (Next.js client components):**
  - Đăng nhập, chat UI, sidebar lịch sử
  - Trang admin: thư viện tài liệu, upload, quản lý users, báo cáo analytics (admin)
- **API Routes (Next.js server routes):**
  - `POST /api/chat`: xác thực + retrieval + stream câu trả lời
  - `POST /api/ingest`: xác thực + quyền contributor/admin + parse nội dung file
- **Firestore:**
  - `documents`: kho tri thức đã index (metadata + full text)
  - `document_chunks`: đoạn văn bản nhỏ với vector embedding (dùng cho vector search)
  - `chatSessions`: lịch sử chat theo user
  - `users`: profile + role (`user`, `contributor`, `admin`)
  - `analyticsEvents`: telemetry nội bộ (server ghi, admin đọc dashboard)
  - `rate_limits`: counter rate-limit per-user per phút (TTL tự dọn qua Firestore policy)
- **Storage:**
  - Bucket chứa file upload tại `documents/`*

### 3.2 Luồng dữ liệu cấp cao

1. User đăng nhập qua Firebase Auth (username + password; admin cấp tài khoản, không đăng ký công khai).
2. Client gọi API kèm `Authorization: Bearer <idToken>`.
3. API verify token bằng Firebase Admin.
4. API đọc dữ liệu Firestore (retrieval/index) và/hoặc xử lý file.
5. API trả kết quả (stream text cho chat, JSON cho ingest).
6. Client hiển thị và cập nhật Firestore session history.

---

## 4) Cấu trúc frontend

### 4.0 UI, theme & Tailwind

- **Tài liệu chi tiết:** `docs/UI_AND_THEME.md` (font Plus Jakarta Sans, CSS variables, `@theme` Tailwind v4, pattern `.clay-card`, shell glass).
- **Tham chiếu ý tưởng thương hiệu / Superhuman:** `docs/DESIGN.md` (không phải bản map 1:1 mã nguồn — token thực tế nằm trong `src/app/globals.css`).

Tóm tắt kỹ thuật:

- Theme sáng/tối: `data-theme` trên document + biến `--background`, `--surface`, `--foreground`, … trong `globals.css`.
- Màu dùng trong component: class Tailwind semantic (`bg-background`, `border-border`, …).

### 4.1 App shell

- `src/components/AppShell.tsx`
  - Hiển thị layout có `Header` + `Sidebar` cho các trang sau login.
  - Ẩn shell ở `/` và `/login`.
  - Nền app: radial wash nhẹ + vùng nội dung padding rộng hơn trên desktop.
- `src/components/Header.tsx`
  - Header toàn cục (sticky, `backdrop-blur`, shadow token).
  - Trên route `/chat` hiển thị thêm dòng mô tả ngữ cảnh chat.
- `src/components/Sidebar.tsx`
  - Link điều hướng theo role.
  - Nút `New Chat` nằm ở sidebar.
  - Hiển thị lịch sử chat 7 ngày gần nhất.
  - Sidebar: surface bán trong suốt + blur, viền tinh.

### 4.2 Các trang chính

- `src/app/page.tsx`: landing page.
- `src/app/login/page.tsx`: đăng nhập username/password (map sang email nội bộ cho Firebase); copy *Zalo Content Guidelines*; footer liên hệ cấp tài khoản (email + Zalo).
- `src/app/chat/page.tsx`: chat realtime + streaming + lưu session.
- `src/app/chat/[id]/page.tsx`: xem lại cuộc hội thoại đã lưu.
- `src/app/admin/library/page.tsx`: quản lý tài liệu.
- `src/app/admin/upload/page.tsx`: upload + gọi ingest.
- `src/app/admin/users/page.tsx`: admin tạo user, đổi role, reset mật khẩu, vô hiệu hóa, xóa (gọi `/api/admin/users`).
- `src/app/admin/reports/page.tsx`: **Analytics Reports** — dashboard telemetry (`admin` hoặc `contributor`). Chi tiết: [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md).

### 4.3 Auth context và phân quyền UI

- `src/context/AuthContext.tsx`
  - Lắng nghe `onIdTokenChanged`.
  - Đọc role từ `users/{uid}` trong Firestore; **không** có profile hợp lệ hoặc role không parse được → `signOut` + set `authError` (không fallback role `user`).
  - `getDoc(users/{uid})` được bọc bởi `withTimeout()` (`src/lib/with-timeout.ts`, timeout 10s): nếu request Firestore bị treo (vd. trình chặn quảng cáo/bảo mật chặn `firestore.googleapis.com` gây `net::ERR_BLOCKED_BY_CLIENT`), context sẽ tự timeout, sign-out, và set `authError` thay vì để UI treo vô thời hạn không phản hồi.
  - `fetchRoleDoc()` retry lần đọc này tối đa 2 lần (mỗi lần timeout 10s) trước khi sign-out — một lần Firestore chậm/treo thoáng qua (mạng công ty, cold-start long-polling detection) không còn buộc user phải tự F5 lại trang để đăng nhập lại; chỉ lỗi `permission-denied` là fail ngay không retry (đó là lỗi quyền thật, không phải mạng chậm).
  - Context expose `authError: string | null` — trang login đọc giá trị này để hiển thị banner lỗi.
- `ProtectedRoute` dùng để chặn truy cập sai role ở client UI.
- `src/lib/auth-username.ts`: chuẩn hóa username, map `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}`.

Lưu ý: bảo vệ ở UI chỉ là lớp hiển thị. Bảo mật thật nằm ở Firestore/Storage rules + API auth server-side.

**Đăng nhập đa phiên (hiện trạng):** một tài khoản **có thể** đăng nhập đồng thời trên nhiều trình duyệt/máy. App dùng Firebase Auth (mỗi client một refresh token) **cộng với** một registry phiên riêng (Firestore `authSessions`, heartbeat + remote sign-out) — không giới hạn “một thiết bị”. Chi tiết: mục 8.5.

---

## 5) Cấu trúc backend

## 5.1 API chat (`POST /api/chat`)

File: `src/app/api/chat/route.ts`

Chức năng:

1. Verify Firebase ID token (`requireUidFromRequest`).
2. **Rate limit**: kiểm tra Firestore `rate_limits/{uid}_{routeKey}_{windowKey}` — mặc định 20 req/phút (env `CHAT_RATE_LIMIT_PER_MINUTE`); trả `429` nếu vượt.
3. Nhận `query`, `conversation` (history), `attachments`, `sessionId`, `scope` (optional) từ body.
4. `scope` (`{ messageType, uiPattern }`, xem `src/lib/chat/scope-options.ts`) được `sanitizeScope()` lọc theo whitelist (không tin client), sau đó dùng để:
   - `buildScopedQuery()`: prefix nhãn scope (vd. `[Lỗi · Snackbar]`) vào query trước khi gọi retrieval — chỉ là **soft ranking boost** (tăng điểm vector/lexical), không phải hard filter theo field trong Firestore (xem 5.5).
   - `scopeHintForPrompt()`: chèn câu hint vào đầu turn hiện tại trong `contents[]` (không nhúng vào system prompt) để model bám đúng phạm vi.
   - Query gốc (không prefix) vẫn dùng để lưu `chatSessions`/hiển thị UI và log analytics `query_sent` (kèm `scope_message_type`/`scope_ui_pattern`, xem 8.6).
5. **Query rewrite** (`src/lib/chat/query-rewrite.ts`) — chỉ khi có lịch sử hội thoại:
   - `rewriteQuery()` gọi model rẻ nhất trong chuỗi fallback (phần tử cuối của `GEMINI_CHAT_MODEL_FALLBACKS`, hiện `gemini-2.5-flash`) để viết câu follow-up thành câu độc lập (vd. "còn snackbar thì sao?" → "Snackbar nên dài tối đa bao nhiêu?") và phân loại intent `guideline | microcopy`. Timeout 4s.
   - Lượt đầu (không có lịch sử) không gọi LLM, không tốn thêm latency.
   - `resolveRetrievalQuery()` chọn câu dùng cho retrieval: câu đã rewrite nếu thành công; nếu lỗi/timeout thì fallback về cách cũ (ghép 2 lượt user gần nhất + câu hiện tại). `intent` từ rewrite thay heuristic `inferQueryType()` khi ghi `query_sent.type`.
   - ⚠️ **Giới hạn hiện tại:** client tính sẵn embedding của **câu gốc** qua `/api/embed` (khi câu ≥ 10 ký tự) và gửi kèm `embedding`; vector search dùng thẳng embedding đó. Vì vậy với follow-up đủ dài, rewrite **chỉ tác động tới lexical search, excerpt và relevance check — không tới vector search**.
6. Retrieval tài liệu qua `RetrievalService.getContext` (vector + lexical chạy song song, fuse bằng RRF, rồi LLM relevance check — xem 5.5). Nếu relevance check kết luận không có tài liệu nào liên quan, context rỗng và system prompt hướng model trả lời "chưa có guideline" thay vì bịa.
7. Generate stream câu trả lời từ Gemini; conversation history được truyền đúng chuẩn multi-turn `contents[]` thay vì nhúng vào system prompt.
8. Stream về client theo **định dạng NDJSON** — mỗi dòng là một JSON object:
   - Dòng 1: `{"t":"s","d":[...ChatSource[]]}` — danh sách nguồn tài liệu (gửi trước khi có text)
   - Dòng 2..N: `{"t":"x","d":"text delta"}` — từng đoạn text từ Gemini, relay nguyên vẹn (không buffer)
   - Dòng cuối (tuỳ chọn): `{"t":"p","d":PrototypeSpec}` — bản dựng minh hoạ, chỉ gửi sau khi text đã xong (xem 5.7)
   - `Content-Type: application/x-ndjson`

## 5.2 API ingest (`POST /api/ingest`)

File: `src/app/api/ingest/route.ts`

Chức năng:

1. Verify token.
2. Check role `admin|contributor`.
3. Validate `fileUrl` chỉ cho phép URL Firebase Storage bucket hiện tại (chống SSRF).
4. Tải binary file và parse:
   - **PDF < 4 MB**: gửi inline base64 tới `gemini-3.8-flash`.
   - **PDF ≥ 4 MB**: upload lên **Gemini File API** → poll đến `state === ACTIVE` (timeout 90s) → dùng `fileData` URI → tự động xóa file sau khi extract xong. Nếu File API lỗi, fallback về inline.
   - **DOCX**: dùng `mammoth`.
   - **TXT/CSV**: decode text.
5. **Chunking + Embedding** (`writeDocumentChunks()`): nếu request chứa `docId`, tự động:
   - Chunk text thành đoạn ~1800 ký tự với overlap 200 ký tự; mỗi chunk mang `headingPath` — chuỗi heading Markdown (`#`…`######`) đang có hiệu lực tại vị trí bắt đầu chunk, vd. `Snackbar > Behavior`; `null` nếu tài liệu không có heading.
   - Gọi Gemini `gemini-embedding-2` (1536 chiều) để embed từng chunk (5 concurrent). Input embed là `[headingPath] text` khi có heading (để đoạn đứng lẻ vẫn mang ngữ cảnh mục), còn field `text` lưu trong DB giữ nguyên không prefix.
   - Ghi vào collection `document_chunks` qua Firestore batch write.
   - Thực tế: PDF được Gemini extract ra thường có heading Markdown → có `headingPath`; DOCX qua mammoth thường không có → `null`.
6. Trả về `{ textContent, chunkCount }` để client ghi `textContent + status: "indexed"` vào `documents`.

## 5.3 API quản lý user (admin)

- `POST /api/admin/users` — tạo Firebase Auth user + document `users/{uid}`.
- `PATCH /api/admin/users/[uid]` — đổi role, vô hiệu hóa/kích hoạt (`disabled`).
- `DELETE /api/admin/users/[uid]` — xóa profile Firestore và user Auth.
- Guard: `requireAdmin()` trong `src/lib/api-request-auth.ts`.

## 5.4 API telemetry (`POST /api/events`)

File: `src/app/api/events/route.ts`

Chức năng:

1. Verify Firebase ID token.
2. Chỉ chấp nhận 6 event trong whitelist `CLIENT_ANALYTICS_EVENTS` (`src/lib/analytics-events.ts`) từ client: `file_uploaded`, `user_feedback`, `session_started`, `session_ended`, `response_copied`, `document_viewed`.
3. Ghi event vào Firestore `analyticsEvents` qua `logAnalyticsEvent()` (kèm `user_id`).

Các event khác (`parse_success`, `parse_failed`, `query_sent`, `response_delivered`, `attachment_uploaded`) được ghi **server-side** trong `/api/ingest`, `/api/chat`, `/api/chat/attachments`.

## 5.5 Retrieval service

- `src/lib/RetrievalService.ts`
  - Prompt hợp nhất, model tự suy luận 2 kiểu intent:
    - Tra cứu guideline
    - Soạn microcopy UX
  - Luôn yêu cầu `SOURCES_USED` ở cuối câu trả lời.
  - Conversation history được truyền vào `contents[]` chuẩn multi-turn (không nhúng vào system prompt).
  - Chat model: mặc định `gemini-3.8-flash`, fallback `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash` (override bằng `GEMINI_CHAT_MODELS`, comma-separated).
- `src/lib/gemini-models.ts` — hằng số model Gemini dùng chung (chat + ingest PDF).
- `src/lib/retrieval/FirebaseRetrievalProvider.ts` — `search()` chạy **vector và lexical song song** mỗi lần (không phải "vector trước, lexical dự phòng"), rồi fuse và lọc qua LLM:
  1. **Vector search:** embed query bằng `gemini-embedding-2` (hoặc dùng embedding client gửi kèm, xem 5.1) → `findNearest()` trên `document_chunks` (COSINE, top `RETRIEVAL_VECTOR_CANDIDATES` = 30, `distanceThreshold` 0.55). Yêu cầu Firestore vector index đã deploy (xem mục 10).
     - `dedupeByContentHash()` bỏ chunk trùng nội dung; `mergeAdjacentChunksByDoc()` (`chunkMerge.ts`) gộp các chunk liền kề cùng tài liệu thành một đoạn và giữ tối đa `RETRIEVAL_MAX_SNIPPETS_PER_DOC` (3) đoạn mỗi tài liệu — một file dài có thể đóng góp nhiều đoạn liên quan, không còn bị giới hạn 1 đoạn/file.
     - Thứ tự là **round-robin theo tài liệu**: mọi tài liệu có đoạn tốt nhất trước, rồi mới tới đoạn thứ 2 của từng tài liệu — tránh một file dài chiếm hết slot.
  2. **Lexical search:** fetch ≤ `RETRIEVAL_FIRESTORE_FETCH_LIMIT` (120) docs từ `documents`, chấm điểm bằng số lần khớp từ khoá (`rankDocumentsForQuery`, tên file ×3), bỏ tài liệu dưới `RETRIEVAL_LEXICAL_MIN_SCORE` (1 = phải có ít nhất một từ khớp thật).
  3. **Fusion (`rrf.ts`):** Reciprocal Rank Fusion `w_vector/(k+rank_v+1) + w_lexical/(k+rank_l+1)`, ghép kết quả cũng theo round-robin, cắt còn `RETRIEVAL_MAX_SNIPPETS` (10). **Trọng số mặc định vector 1.0 / lexical 0** — đã đo: mọi trọng số lexical > 0 đều làm giảm chất lượng trên corpus hiện tại vì chấm điểm lexical còn nhiễu (đếm chuỗi con, không theo ranh giới từ; tài liệu dài lợi thế). Chi tiết: `src/lib/retrieval/eval/BASELINE.md`.
  4. **LLM relevance check (`llm-relevance-check.ts`):** một lệnh Gemini (model rẻ nhất) đọc câu hỏi + các đoạn đã fuse, trả về index các đoạn *thực sự* giúp trả lời, sắp theo độ liên quan — vừa lọc vừa rerank. Trả về rỗng khi câu hỏi ngoài phạm vi. Fail-open: lỗi/timeout 4s thì giữ nguyên danh sách. Tắt bằng `RETRIEVAL_RELEVANCE_CHECK_ENABLED=0`.
     - Lý do dùng LLM thay vì ngưỡng số: đã đo trên 24 câu đúng phạm vi + 15 câu ngoài phạm vi, khoảng cách vector và điểm lexical của hai nhóm **chồng lấn hoàn toàn** — không có ngưỡng nào tách được.
- Mỗi lượt chat tốn khoảng **4 lệnh Gemini**: embed câu hỏi (qua `/api/embed` lúc người dùng đang gõ, hoặc trong route nếu client chưa gửi), rewrite (chỉ khi có lịch sử), relevance check (chỉ khi có kết quả), và sinh câu trả lời (thêm lệnh nếu phải fallback sang model khác). Firestore: đúng 1 truy vấn `document_chunks` + 1 truy vấn `documents` mỗi lần (+1 `getAll` khi có scope).
- `src/lib/retrieval/queryTerms.ts` — `extractQueryTerms()`: tách từ khoá, bỏ stopword (so **trước** khi bỏ dấu, để `"có"` không xoá nhầm `"cỡ"`), rồi bỏ dấu. Dùng cho chấm điểm lexical và cho `buildBudgetedExcerpt()` (chọn đoạn nào của tài liệu đưa vào excerpt).
- `src/lib/documents/chunking.ts` — chia text thành `TextChunk[]` (~1800 ký tự/chunk, overlap 200 ký tự, tôn trọng ranh giới đoạn văn), kèm `headingPath`.
- `src/lib/documents/embeddings.ts` — wrapper `gemini-embedding-2`: `embedTexts()` (batch), `embedQuery()` (RETRIEVAL_QUERY task type), `embeddingInputFor()`, `writeDocumentChunks()`, `deleteDocumentChunks()`.
- **Scope picker (chat, xem 5.1) không lọc cứng theo field:** filter cứng chỉ có `status == "indexed"` (và ngưỡng điểm lexical ở trên, không liên quan scope). Nhãn scope ảnh hưởng theo hai đường, đều là **soft boost**, không đảm bảo trúng đúng tài liệu:
  1. Gián tiếp qua embedding và keyword-overlap score (`buildScopedQuery()` prefix nhãn vào query).
  2. Trực tiếp qua tag tài liệu: khi có scope, `fetchDocScopeMeta()` batch-load `messageType`/`uiPattern` từ collection `documents` (vì `document_chunks` không mang các field này) rồi `applyScopeBoost()` sort ổn định theo `scopeMatchScore` (2 = khớp cả hai facet hoặc doc gắn `"all"`, 1 = khớp một, 0 = chưa gắn tag / xung đột). Không loại bỏ tài liệu nào.

## 5.5b Đánh giá chất lượng retrieval & script vận hành

Kết quả đo qua từng đợt cải tiến (M0→M5 và các lần sửa sau) ghi trong **`src/lib/retrieval/eval/BASELINE.md`** — đọc file này trước khi đổi bất kỳ tham số `RETRIEVAL_*` nào.

- **Golden set:** `src/lib/retrieval/eval/golden-set.json` (24 câu: 15 lấy từ log thật `query_sent`, 9 tự viết; 5 câu có `notes` ghi `expectedDocId` chưa được người biết corpus xác nhận) và `negative-golden-set.json` (15 câu ngoài phạm vi, gồm 3 câu "khó" về Zalo nhưng không phải UX writing).
- **Metric chính:** recall@3 và MRR. recall@6 đã chạm trần 100% vì corpus chỉ có 17 tài liệu.

Script (đều **chỉ đọc**, trừ khi ghi chú khác; đọc `GEMINI_API_KEY`/`FIREBASE_SERVICE_ACCOUNT_KEY` từ `.env.local`; tôn trọng các biến `RETRIEVAL_*` giống app):

| Script | Việc |
|---|---|
| `node scripts/eval-retrieval.mjs` | recall@6 / recall@3 / MRR trên golden set (không gồm relevance check) |
| `node scripts/verify-relevance-check-e2e.mjs` | Pipeline đầy đủ + relevance check thật: đoạn đúng phải sống sót (positive) / phải rỗng (negative). ~10 phút |
| `node scripts/calibrate-not-found-threshold.mjs` | Khoảng cách vector / điểm lexical tốt nhất của từng câu positive/negative |
| `node scripts/migrate-heading-path.mjs [--dry-run]` | **Ghi production.** Backfill `headingPath` cho chunk cũ; idempotent (bỏ qua doc đã có field, kể cả `null`). Đã chạy trên production 2026-09-29: 17/17 doc |
| `node scripts/reindex-embeddings.mjs` | **Ghi production.** Re-chunk + re-embed toàn bộ tài liệu indexed (giữ `headingPath`) |

Thử nghiệm tham số không cần deploy: `RETRIEVAL_RRF_WEIGHT_LEXICAL=0.3 RETRIEVAL_RRF_WEIGHT_VECTOR=0.7 node scripts/eval-retrieval.mjs`.

**Script dùng bản JS của logic retrieval** (`scripts/lib/`), vì file `.mjs` chạy độc lập không import được module TS của app. Hai bên được giữ khớp bằng test: `src/lib/retrieval/eval/mirror-drift.test.ts` và test pipeline trong `FirebaseRetrievalProvider.search.test.ts` đưa cùng input qua cả hai và báo lỗi khi lệch. **Sửa logic retrieval trong `src/lib/` thì phải sửa bản tương ứng trong `scripts/lib/`**, nếu không `npm test` sẽ fail.

## 5.7 Bản dựng minh hoạ (visual prototype)

Khi câu hỏi thuộc **Kiểu B — microcopy UX** và model xác định được chính xác một kiểu UI, câu trả lời kèm thêm một bản dựng trực quan để user nhìn phát hiểu, không phải đọc hết markdown.

**Nguyên tắc:** chuẩn UI nằm trong **code**, không nằm ở LLM. Model chỉ cung cấp *nội dung chữ* + chọn `pattern`/`messageType`; màu, icon, bo góc, spacing, font đều do component quyết định và được review qua PR. Không có HTML nào do model sinh ra được render — app không có `rehype-raw` và feature này cố ý không thêm HTML sink mới.

- `src/lib/chat/prototype-spec.ts` — Zod schema + `sanitizePrototypeSpec()` + `PROTOTYPE_PROMPT_SECTION`. Enum `pattern`/`messageType` **derive từ `scope-options.ts`** nên prompt và schema không thể lệch nhau (có test chặn). Enum sai → loại cả spec; key lạ → strip.
  - **Không làm mất thông tin** là ràng buộc trung tâm: schema chở `title`, `body`, `bullets[]` (giữ cấu trúc danh sách), `helperText`, và `actions[]` (tới 4 nút, không giới hạn 2). Giới hạn độ dài trong `LIMITS` đặt ở mức chặn lạm dụng (body 900 ký tự), **không** phải mức "gọt cho vừa layout" — cắt chữ là mất thông tin, tệ hơn layout dài. Prompt bắt model giữ đủ mọi dòng/nhãn/nút của bản gốc và chỉ sửa cách viết cho đúng guideline.
  - Field cũ `primaryAction`/`secondaryAction` được `foldLegacyActions()` gộp vào `actions[]` nên spec đã lưu trong Firestore vẫn đọc được.
- `src/lib/chat/prototype-extract.ts` — `extractPrototypeSpec()` / `stripPrototypeBlock()` / `hasPrototypeFence()`. Model xuất khối ```` ```zalo-prototype ```` ngay trước dòng `[SOURCES_USED: …]`.
- `src/app/api/chat/route.ts` — sau khi stream text xong: trích, validate, enqueue `{"t":"p","d":spec}`. Nếu có fence nhưng spec không dùng được thì `console.warn` (tỉ lệ dòng log này cho biết có cần chuyển sang function-calling để ép schema hay không) và analytics `response_delivered` mang thêm `prototype_pattern`.
- `src/components/chat/prototype/patterns.tsx` — chrome Zalo dùng chung (`StatusBar`, `ChatHeader`, `MessageStream`, `InputBar`, `ZaloScreen`, `PhoneFrame`) + 8 thân pattern. `Record<UiPattern, …>` nên thêm pattern mà quên dựng component sẽ fail ở tsc. Mỗi pattern đặt đúng chỗ nó xuất hiện thật: snackbar nổi trên thanh nhập liệu, banner đẩy luồng chat xuống (**không** absolute — từng đè chữ lên bong bóng tin nhắn), tooltip trỏ vào icon header, card/ZInstant card chèn thẳng vào luồng chat.
- `src/components/chat/prototype/PrototypePreview.tsx` — khung, chip facet, thanh nút (Tải JPG / Copy ảnh / Copy chữ), caption "không phải ảnh chụp màn hình".
- `src/lib/chat/prototype-image.ts` — xuất ảnh **ngay trên trình duyệt** bằng `html-to-image` (2x cho màn retina). Không cần headless Chromium trên Cloud Run. Tải về là **JPG**; copy vào clipboard là **PNG** vì Clipboard API chỉ bắt buộc hỗ trợ `image/png` (Chrome từ chối `image/jpeg` trong `ClipboardItem`). JPEG không có alpha nên luôn truyền `backgroundColor` lấy từ nền thật, nếu không vùng trong suốt sẽ ra đen.
- Spec được lưu trong `StoredMessage.prototype` và re-validate khi replay lịch sử.

**Khung máy giãn theo nội dung:** `SCREEN_MIN_H` là chiều cao *tối thiểu* (600px), không phải cố định — bottom sheet/modal nằm trong luồng layout (không `absolute`) nên nội dung dài làm khung cao lên thay vì bị `overflow-hidden` cắt mất. Khung khoá cứng 320px bằng `shrink-0`: thiếu nó, cột chat hẹp sẽ bóp khung lại làm chữ ngắt dòng liên tục và khung cao vọt lên.

**Pattern không chở hết nội dung:** snackbar theo chuẩn là toast một dòng, không thể hiện bullet/helper/nhiều nút. Thay vì bịa ra "snackbar nhiều dòng" sai chuẩn hoặc âm thầm ăn mất nội dung, `describeUnrenderedContent()` liệt kê phần không dựng được và `PrototypePreview` hiện cảnh báo, gợi ý đổi sang bottom sheet/modal. Nội dung đầy đủ vẫn nằm trong câu trả lời và ở nút "Copy chữ".

Bản dựng hoàn toàn **tĩnh**: action giả render bằng `<span>`, không phải `<button>`.

## 5.6 File viewer (`GET /references/file/[id]`)

File: `src/app/references/file/[id]/route.ts`

Phục vụ tài liệu trong thư viện ra trình duyệt, có xác thực token Firebase (`__session` cookie).

- **inline_doc:** sanitize `contentHtml` bằng `sanitizeContent()` rồi bọc vào HTML template, trả `text/html`.
- **DOCX:** tải file từ Storage, dùng `mammoth` convert sang HTML, trả `text/html`.
- **PDF / TXT / CSV / file khác:** proxy thẳng từ Storage, trả đúng `content-type` gốc.
- `?download=1`: trả về file binary với `content-disposition: attachment`.
- SSRF protection: `assertFirebaseStorageDownloadUrl()` validate URL trước khi fetch.
- CSP: các response HTML có header CSP riêng — xem mục 7.4.

## 5.7 Env validation (server)

- `src/lib/env/internal-auth-domain.ts` — parse và so khớp `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` với `INTERNAL_AUTH_EMAIL_DOMAIN`.
- `src/instrumentation.ts` — khi Node runtime khởi động, gọi `validateServerEnv()`; **fail startup** nếu hai biến domain được set nhưng khác nhau.
- Local / CI: `npm run validate:env` (đọc `.env` / `.env.local`). Mẫu biến: `.env.example`.

## 5.8 Firebase Admin init

- `src/lib/firebase-admin.ts`
  - Ưu tiên `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string).
  - Fallback `applicationDefault()` khi chạy môi trường GCP.
  - Có xử lý lỗi parse JSON để tránh làm chết toàn bộ server.

---

## 6) Firebase data model

## 6.1 Collection `users`

Tài liệu người dùng/role:

- `uid`
- `username` (đăng nhập hiển thị cho user)
- `email` (synthetic: `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}`)
- `role`: `user | contributor | admin`
- `createdAt` (nếu có)

Quy ước quan trọng:

- Canonical profile path luôn là `users/{auth.uid}`.

## 6.2 Collection `documents`

Dữ liệu tri thức đã upload/index:

- `fileName`, `fileUrl`, `storagePath`, `mimeType`, `sizeBytes`
- `status`: `processing | indexed | failed | inactive | ...`
- `description`, `tags`
- `textContent` (nội dung đã extract — dùng cho lexical search, relevance check và hiển thị)
- `uploadedBy`, `uploadedEmail`, `uploadedAt`, `updatedAt`

## 6.2b Collection `document_chunks`

Chunks nhỏ của tài liệu — backbone của vector search:

- `docId` (ref tới `documents/{id}`)
- `fileName` (copy từ document cha để tra cứu nhanh)
- `chunkIndex` (vị trí trong document)
- `text` (nội dung đoạn, ~1800 ký tự, không prefix)
- `headingPath` (`string | null` — vd. `Snackbar > Behavior`; `null` = tài liệu không có heading. Field **có mặt với giá trị `null`** nghĩa là đã migrate; **thiếu field** nghĩa là chunk cũ chưa migrate — `scripts/migrate-heading-path.mjs` dựa vào khác biệt này)
- `embedding` (Firestore `VectorValue`, 1536 chiều — `gemini-embedding-2`, embed từ `[headingPath] text`)
- `status`: `"indexed"`
- `createdAt`

Chunks tự được tạo/cập nhật/xóa khi document được ingest, inline doc được tạo/sửa/xóa. Xem `src/lib/documents/embeddings.ts`.

## 6.3 Collection `chatSessions`

Lịch sử chat theo user:

- `userId`
- `title` (từ tin nhắn user đầu tiên)
- `messages[]` (role/content/sources/timestamp)
- `createdAt`, `updatedAt`

## 6.4 Collection `analyticsEvents`

Telemetry nội bộ cho dashboard **Analytics Reports** (`/admin/reports`). Schema: `eventName`, `payload`, `createdAt` (server timestamp). Chỉ Admin SDK được `create` (`firestore.rules`: client `write: false`).

Bảng đầy đủ loại event, luồng ghi, giới hạn mẫu 500/300, filter thời gian và metric UI: **[ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md)**.

## 6.5 Collection `rate_limits`

Counter rate-limit per-user per phút:

- Document ID: `{uid}_{routeKey}_{windowKey}` (routeKey = tên route, vd. `chat`, `events`; windowKey = `Math.floor(Date.now() / 60000)`)
- `count` (số request trong window hiện tại)
- `expireAt` (Timestamp — end of next window)

**Quan trọng:** cần bật **Firestore TTL policy** trên field `expireAt` để tự dọn docs cũ (xem mục 10.2).

---

## 7) Security model

## 7.1 Firestore Rules (`firestore.rules`)

- `chatSessions`: user đọc/ghi/xóa session của chính mình; `contributor`/`admin` được **đọc** (không ghi) mọi session, dùng cho dashboard analytics.
- `users`:
  - user đọc/sửa hồ sơ của mình nhưng không tự nâng role; **không** được `create` (không tự đăng ký).
  - chỉ `admin` được `create` document `users/*`.
  - admin có toàn quyền đọc/ghi/xóa.
- `documents`:
  - signed-in user được đọc.
  - chỉ `admin|contributor` mới được create/update/delete.
- `analyticsEvents`:
  - `admin` hoặc `contributor` được đọc (dashboard).
  - client/API user **không** ghi trực tiếp; ghi qua Admin SDK trên server.

## 7.2 Storage Rules (`storage.rules`)

- Chỉ signed-in user được đọc `documents/`*.
- Chỉ `admin|contributor` được ghi.
- Role lookup trong Storage rules dùng `firestore.exists/get`.

## 7.3 API auth guard

- `src/lib/api-request-auth.ts`
  - Verify Bearer ID token.
  - Check role contributor/admin cho ingest.
  - Validate host/bucket của Storage URL.

## 7.4 Content Security Policy (file viewer)

Route `GET /references/file/[id]` serve HTML trực tiếp ra browser (inline_doc và DOCX được convert sang HTML). Mỗi response kèm header CSP:

```
default-src 'self';
style-src 'unsafe-inline';
script-src 'none';
object-src 'none';
img-src 'self' https: data:;
```

- `script-src 'none'` — chặn hoàn toàn script execution, bảo vệ nếu sanitizer bị bypass (VULN-002).
- `style-src 'unsafe-inline'` — cho phép `<style>` block trong HTML template (server-controlled, không phải user input).
- `img-src 'self' https: data:` — cho phép ảnh HTTPS (trong nội dung inline_doc đã sanitize) và data: URI (ảnh DOCX được mammoth chuyển sang base64).
- Sanitizer (`src/lib/documents/sanitizeHtml.ts`) đã enforce HTTPS-only cho `<img src>` ở lớp content trước khi HTML được lưu.

---

## 8) Flow tính năng chi tiết

## 8.1 Chat flow

1. User vào `/chat`.
2. Chưa có session nào được tạo.
3. User gửi tin đầu tiên:
  - tạo `chatSessions` với first user message.
  - gọi `/api/chat`.
4. API retrieval + stream response.
5. Client vừa stream UI, vừa lưu lại messages vào session khi hoàn tất.
6. Sidebar tự cập nhật lịch sử từ Firestore listener.

## 8.2 Upload/index tài liệu flow

1. Contributor/Admin chọn file ở `/admin/upload`.
2. Upload file lên Storage (`documents/...`).
3. Tạo doc Firestore `documents` status `processing`.
4. Gọi `/api/ingest` để extract text.
5. Cập nhật `documents.textContent` và status `indexed` (hoặc `failed`).
6. Tài liệu indexed sẽ được retrieval dùng trong chat.

## 8.3 User management flow

1. Admin đăng nhập → `/admin/users`.
2. **Tạo tài khoản:** form username, password, role → `POST /api/admin/users` (tạo Auth + `users/{uid}`).
3. **Vận hành:** reset mật khẩu, đổi role, disable/enable, xóa user qua `PATCH` / `DELETE` `/api/admin/users/[uid]`.
4. User cuối chỉ đăng nhập bằng username + password sau khi đã được cấp; không có đăng ký công khai.

**Bootstrap admin lần đầu:** xem `docs/FIREBASE_DEPLOY.md` mục Auth (Console hoặc tạo thủ công `users/{auth.uid}` khớp UID Auth).

## 8.4 Login flow

1. User nhập **username** + password (không phải email hiển thị).
2. Client map username → `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}` rồi `signInWithEmailAndPassword` (`src/app/login/LoginClient.tsx`).
3. **Việc quyết định "được phép vào app hay không" nằm hoàn toàn ở `AuthContext`** (không có check trùng lặp ở trang login):
   - `onIdTokenChanged` fire → đọc `users/{uid}` (retry tối đa 2 lần, mỗi lần timeout 10s, xem mục 4.3).
   - Không có document, hoặc role không hợp lệ, hoặc hết cả 2 lần retry vẫn timeout/lỗi mạng → `signOut` + set `authError` (message khác nhau tùy nguyên nhân: *chưa được cấp quyền* vs *không thể tải thông tin tài khoản, có thể do mạng/trình chặn quảng cáo*).
   - Có document + role hợp lệ → set cookie `__session`, set `user`/`role`.
4. Trang `/login` có một `useEffect` theo dõi `user` (không phải gọi trực tiếp trong submit handler — tránh redirect loop với middleware, xem lịch sử fix ở commit `61d58f5`): khi `user` xuất hiện, điều hướng bằng **`window.location.assign(next)`** (hard navigation, không phải `router.replace()`). `next` được validate qua `sanitizeNextPath()` (chỉ nhận path nội bộ dạng `/...`, chặn open redirect) lấy từ query `?next=` (do middleware set khi redirect user chưa đăng nhập) hoặc mặc định `/chat`.
   - **Lý do dùng hard navigation:** trên Next.js 16, `router.replace()` (client-side SPA navigation) sang một route chưa từng render trong session trình duyệt đó (vd. lần đăng nhập đầu tiên trên incognito/máy mới) có thể treo âm thầm — không lỗi, URL không đổi — bắt buộc user phải F5 mới vào được; F5 luôn thành công vì nó bỏ qua router cache của client. `window.location.assign()` tái tạo đúng hành vi "F5 thủ công" đó một cách tự động, đổi lại một lần full page load (chấp nhận được vì đây là redirect one-off sau login, không phải điều hướng trong luồng chat).
5. Nút "Đăng nhập" giữ trạng thái loading suốt khoảng thời gian giữa lúc Firebase Auth xác thực xong và lúc `AuthContext` resolve xong (redirect hoặc `authError`) — chỉ tắt loading khi có `authError`. Tránh cảm giác trang "đứng im" trong lúc chờ Firestore role-fetch (có thể vài giây, xem mục 4.3).
6. Banner lỗi trên trang login hiển thị `error` (lỗi validate/sign-in cục bộ) **hoặc** `authError` (từ AuthContext).
7. Trang `/login` hiển thị hướng dẫn liên hệ admin để xin cấp tài khoản (email + Zalo).

**Test coverage:** `e2e/chat-flow.spec.ts` có test riêng mô phỏng Firestore bị chặn sau khi đăng nhập thành công (route interception, không resolve request) để xác nhận banner lỗi xuất hiện thay vì treo vô hạn; `src/lib/with-timeout.test.ts` cover unit test cho helper timeout.

## 8.5 Đăng nhập đa phiên / đa máy

**Kết luận:** được phép — cùng username/password trên laptop, điện thoại, hoặc nhiều trình duyệt cùng lúc.

### Phân biệt thuật ngữ

| Khái niệm | Ý nghĩa trong app |
|-----------|-------------------|
| **Phiên đăng nhập (auth)** | Firebase Authentication: ID token + refresh token trên từng client (`src/lib/firebase.ts`, `AuthContext`). |
| **Cuộc chat (`chatSessions`)** | Lịch sử hội thoại trong Firestore, gắn `userId` — **không** phải phiên đăng nhập. |

### Cách hoạt động

- Mỗi máy/trình duyệt đăng nhập → Firebase cấp token riêng; API chỉ gọi `verifyIdToken` (không kiểm tra thiết bị) — xem `src/lib/api-request-auth.ts`.
- Cùng `uid` → cùng quyền, cùng lịch sử chat (Firestore listener trên `chatSessions` theo `userId`).
- Nhiều tab cùng trình duyệt thường chia sẻ trạng thái Auth (persistence mặc định của Firebase).

### Hành vi vận hành

- **Đăng xuất trên một máy** (`Header` → `signOut`): xóa bản ghi `authSessions` của thiết bị đó; máy khác vẫn đăng nhập.
- **Admin vô hiệu hóa** (`PATCH` user `disabled: true`): đánh dấu `revoked` mọi phiên + Auth `disabled` chặn refresh token.
- **Admin reset mật khẩu:** Firebase thường thu hồi refresh token cũ; các máy có thể bị đăng xuất khi token hết hạn.

### Quản lý phiên (đã có)

- **`/account/sessions`:** User xem danh sách thiết bị/trình duyệt, trạng thái *Đang hoạt động*, đăng xuất từ xa phiên khác.
- **Admin → Manage Users → Phiên:** Xem/đăng xuất phiên của từng user.
- Collection Firestore `authSessions` (heartbeat ~60s, `revoked` để kick client).
- Admin **khoá** hoặc **reset mật khẩu** → API đánh dấu `revoked` trên mọi phiên của user đó.

### Chưa có trong sản phẩm

- Giới hạn N máy hoặc “chỉ một phiên”, cảnh báo đăng nhập thiết bị mới.

## 8.6 Analytics Reports

Dashboard tại `/admin/reports` (`admin` hoặc `contributor`): telemetry từ `analyticsEvents`, polling **6 giờ** + nút **Cập nhật**, filter **Hôm nay / 7 / 30 ngày** (UTC).

**Tài liệu đầy đủ:** [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md) — event schema, metric definitions, code map, troubleshooting, smoke test.

---

## 9) Environment variables

Bắt buộc (App Hosting -> Backend -> Environment variables):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY` — secret, khai báo qua `apphosting.yaml` (`secret: FIREBASE_SERVICE_ACCOUNT_KEY`)
- `GEMINI_API_KEY` — secret, khai báo qua `apphosting.yaml` (`secret: GEMINI_API_KEY`)
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` (client: map username → email Auth)
- `INTERNAL_AUTH_EMAIL_DOMAIN` (server/API admin; **cùng giá trị** với biến `NEXT_PUBLIC_*`)

Mặc định trong code nếu không set: `accounts.internal` (email Auth dạng `admin@accounts.internal`). Server **từ chối khởi động** nếu hai biến domain được set nhưng khác nhau.

### 9.1 ⚠️ Console override đè `apphosting.yaml` — bẫy khi rotate secret

Firebase App Hosting merge cấu hình từ 2 nguồn: `apphosting.yaml` (khai báo `secret: ...`) và Firebase Console (Environment variables trên backend) — nếu một biến được set **giá trị literal trực tiếp trong Console**, giá trị đó **luôn thắng**, bất kể `apphosting.yaml` khai báo `secret:` đúng thế nào.

Sự cố thực tế đã gặp (2026-07-14): `GEMINI_API_KEY` và `FIREBASE_SERVICE_ACCOUNT_KEY` bị lộ, đã rotate nhiều version mới trong Secret Manager + deploy lại nhiều lần, nhưng `/api/chat`, `/api/embed`, `/api/admin/reports` vẫn 500 (`API_KEY_INVALID` / `16 UNAUTHENTICATED`) — vì Console đang có **giá trị cứng** (key **cũ, đã xoá**) đè lên khai báo `secret:` trong YAML. Chỉ giải quyết được sau khi **xoá hẳn 2 biến này khỏi Console** rồi build lại.

**Quy trình rotate secret đúng cách:**

1. Kiểm tra Console (App Hosting → Backend → Environment variables) — nếu biến có **giá trị literal**, xoá nó đi (để fallback về `secret:` trong YAML), không sửa giá trị tay.
2. `firebase apphosting:secrets:set <NAME> --data-file <path>` (hoặc nhập tay) → tạo version mới trong Secret Manager.
3. `firebase apphosting:rollouts:create <backendId> --git-branch main --force` — **bắt buộc build mới**, vì secret được resolve **tại thời điểm build**, không tự áp dụng cho revision cũ.
4. Xác nhận runtime dùng đúng secret: `gcloud run services describe <service> --format=json` rồi kiểm tra `env[].valueFrom.secretKeyRef.key` (số version) — **không** in giá trị `env[].value` ra terminal/log (đó là plaintext secret).
5. Test thật bằng 1 request có auth (không chỉ check HTTP status của request không-auth, vì lỗi Firestore/Gemini chỉ xảy ra sau bước xác thực).

Tùy chọn (Gemini & chat):

- `GEMINI_CHAT_MODELS` — danh sách model chat, phân tách bằng dấu phẩy. Mặc định: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash` (thử lần lượt khi model trước lỗi).
- `CHAT_RATE_LIMIT_PER_MINUTE` — số request tối đa mỗi user mỗi phút. Mặc định: `20`.

Tùy chọn (retrieval):

Mọi giá trị dưới đây đã được đo bằng `scripts/eval-retrieval.mjs` — thử bằng env trên script trước khi đổi trên production (xem 5.5b và `BASELINE.md`).

- `RETRIEVAL_VECTOR_CANDIDATES` — số chunk lấy từ `findNearest()` trước khi gộp/cắt. Mặc định: `30`.
- `RETRIEVAL_VECTOR_DISTANCE_THRESHOLD` — ngưỡng cosine distance của `findNearest()`. Mặc định: `0.55`. Chỉ để giới hạn số ứng viên — **không** dùng được làm ngưỡng "không tìm thấy" (đã đo, xem 5.5).
- `RETRIEVAL_MAX_SNIPPETS` — số snippet tối đa truyền vào context Gemini. Mặc định: `10`.
- `RETRIEVAL_MAX_SNIPPETS_PER_DOC` — số đoạn tối đa một tài liệu được đóng góp. Mặc định: `3`.
- `RETRIEVAL_MAX_CHARS_PER_SNIPPET` — ký tự tối đa mỗi snippet. Mặc định: `2600`.
- `RETRIEVAL_FIRESTORE_FETCH_LIMIT` — số doc lexical search đọc từ `documents`. Mặc định: `120`.
- `RETRIEVAL_LEXICAL_MIN_SCORE` — điểm lexical tối thiểu để tài liệu được giữ. Mặc định: `1`.
- `RETRIEVAL_LEXICAL_RERANK_POOL` — số doc lexical xếp hạng trước khi boost theo scope (chỉ khi có scope). Mặc định: `20`.
- `RETRIEVAL_RRF_WEIGHT_VECTOR` / `RETRIEVAL_RRF_WEIGHT_LEXICAL` / `RETRIEVAL_RRF_K` — trọng số fusion. Mặc định: `1.0` / `0` / `60`. **Đừng nâng lexical > 0** khi chưa cải thiện cách chấm điểm lexical — đã đo, mọi giá trị > 0 đều làm giảm recall/MRR.
- `RETRIEVAL_RELEVANCE_CHECK_ENABLED` — đặt `0` để tắt LLM relevance check (tiết kiệm 1 lệnh Gemini/lượt, nhưng mất khả năng trả lời "chưa có guideline"). Mặc định: bật.

Các biến số nguyên (`RETRIEVAL_*` dùng `envInt`) bỏ qua giá trị `0` hoặc âm và quay về mặc định.

Khuyến nghị:

- `NEXT_PUBLIC_SITE_URL` (metadata canonical + OG absolute URL)
- `NEXT_PUBLIC_GA_ID` (nếu bật Google Analytics)
- `CHAT_ATTACHMENTS_CRON_SECRET` (bí mật gọi cron xóa ảnh chat hết TTL trong Storage; xem mục 10.4)

Lưu ý:

- Thay đổi `NEXT_PUBLIC_`* cần rollout/build lại để có hiệu lực.

---

## 10) Deploy và vận hành

## 10.1 Thiết lập project Firebase

- `firebase.json`:
  - map rules Firestore/Storage
  - cấu hình App Hosting backend `zalo-ikc-be`
- `apphosting.yaml`:
  - `minInstances: 0`

## 10.2 Lệnh deploy

Khuyến nghị dùng CLI mới nhất:

```bash
npx -y firebase-tools@latest use
```

Deploy app:

```bash
npx -y firebase-tools@latest deploy --only apphosting
```

Deploy Firestore rules + **indexes** (bao gồm vector index `document_chunks.embedding`):

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage
```

> **Lần đầu deploy vector index:** index ở trạng thái `CREATING` vài phút. Trong thời gian đó, vector search sẽ lỗi và tự động fallback về lexical search — không ảnh hưởng hoạt động.

Nếu backend App Hosting đã nối GitHub branch live (`main`), push code lên branch đó sẽ tự rollout.

## 10.2b Cấu hình Firestore TTL policy (một lần)

Sau deploy lần đầu, bật TTL để tự dọn `rate_limits` docs cũ:

1. Firebase Console → **Firestore** → **Indexes** → tab **TTL Policies**
2. **Add TTL policy**: Collection `rate_limits`, Field `expireAt`
3. Save. (TTL xóa docs trong vài giờ sau khi `expireAt` qua — không phải ngay lập tức.)

## 10.2c Re-index tài liệu hiện có (một lần sau khi deploy vector search)

Tài liệu upload trước khi có vector search **chưa có chunks** — chỉ được tìm qua lexical search. Để re-index toàn bộ: `node scripts/reindex-embeddings.mjs` (**ghi production**, xoá rồi ghi lại chunk của từng tài liệu), hoặc upload lại từng tài liệu trong `/admin/library`.

Chunk tạo trước khi có `headingPath` (M5) được backfill bằng `node scripts/migrate-heading-path.mjs` — chạy `--dry-run` trước; script idempotent nên chạy lại an toàn. Đã chạy trên production ngày 2026-09-29 (17/17 tài liệu). Tài liệu upload sau đó tự có `headingPath` qua `/api/ingest`.

## 10.3 Checklist release ngắn

1. `npm install` (khi có đổi dependency)
2. `npm run validate:env` (kiểm tra cặp domain auth, tùy chọn trước deploy)
3. `npm test` (Vitest — reports, chat stream, env, retrieval, đồng bộ script ↔ app)
   - Nếu đổi logic/tham số retrieval: chạy `node scripts/eval-retrieval.mjs` (và `verify-relevance-check-e2e.mjs` nếu đụng tới excerpt/relevance check), so với `BASELINE.md`, ghi kết quả mới vào đó.
4. `npm run build`
5. Smoke test local các flow chính
6. Commit + push
7. Theo dõi App Hosting rollout đến `Succeeded`
8. `firebase deploy --only firestore:indexes` nếu thay đổi `firestore.indexes.json`
9. Smoke test production + log monitor

## 10.4 Cron xóa ảnh chat hết TTL (Storage)

Ảnh đính kèm chat lưu dưới prefix `chat-attachments/` với metadata `expiresAt` (24h). Để xóa vật lý định kỳ:

1. Tạo biến môi trường `CHAT_ATTACHMENTS_CRON_SECRET` (chuỗi ngẫu nhiên đủ dài).
2. Trên **Google Cloud Scheduler**, tạo job HTTPS **POST** tới
  `https://<domain-của-app>/api/cron/cleanup-chat-attachments`  
   với header `Authorization: Bearer <CHAT_ATTACHMENTS_CRON_SECRET>` (hoặc `x-cron-secret` cùng giá trị).
3. Tần suất gợi ý: mỗi 1–6 giờ (tùy lưu lượng). Tùy chọn env: `CHAT_ATTACHMENTS_CLEANUP_MAX_DELETES` (mặc định 500), `CHAT_ATTACHMENTS_CLEANUP_PAGE_SIZE` (100), `CHAT_ATTACHMENTS_CLEANUP_MAX_PAGES` (50).

Nếu không đặt `CHAT_ATTACHMENTS_CRON_SECRET`, route cron trả `503` (chưa cấu hình). Sai secret trả `401`.

---

## 11) Troubleshooting nhanh

- **Production vẫn thấy nút Google / UI login cũ:** App Hosting build từ **Git branch live** (`main`). Chỉ `firebase deploy --only firestore:rules` **không** đổi UI Next.js — cần push commit và đợi rollout `Succeeded`.
- **Thấy UI cũ sau deploy:** thử Incognito / hard refresh / kiểm tra rollout đã `Succeeded`.
- **Đăng nhập báo *Tài khoản chưa được cấp quyền*:** Auth đã OK nhưng thiếu hoặc sai `users/{auth.uid}` trong Firestore (document ID phải **bằng** UID Firebase Auth, không dùng Auto-ID).
- **Admin không vào được:** kiểm tra email Auth = `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}` và field `role: "admin"` trong `users/{uid}`.
- **Server configuration error** ở API: thiếu hoặc sai `FIREBASE_SERVICE_ACCOUNT_KEY` / project id env.
- **Startup crash env domain:** `INTERNAL_AUTH_EMAIL_DOMAIN` và `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` khác nhau — đặt cùng một giá trị (ví dụ `accounts.internal`).
- **Chat/ingest Gemini lỗi model:** kiểm tra `GEMINI_API_KEY` và quyền model `gemini-3.8-flash`; fallback tự thử model trong `GEMINI_CHAT_MODELS`.
- **Gemini trả `API_KEY_INVALID` dù key vừa tạo còn hạn:** Google đang migrate key Gemini từ Standard (`AIza...`) sang Auth key gắn service account (`AQ.Ab...`); Standard key **unrestricted** đã bị từ chối từ 19/06/2026, và **toàn bộ** Standard key ngừng hoạt động từ 09/2026. Key tạo mới qua AI Studio giờ luôn là Auth key. Cần `@google/genai` ≥ 2.x (project hiện dùng `^2.11.0`) để tương thích Auth key — bản 1.x sẽ báo `API_KEY_INVALID`.
- **Rotate `GEMINI_API_KEY`/`FIREBASE_SERVICE_ACCOUNT_KEY` xong vẫn lỗi `500`/`16 UNAUTHENTICATED`:** rất có thể do **Console override** đè lên `secret:` trong `apphosting.yaml` — xem mục 9.1 để biết cách kiểm tra và fix đúng quy trình.
- **Vector search lỗi `index not ready`:** index `document_chunks.embedding` chưa deploy hoặc đang tạo → vector search trả rỗng, kết quả chỉ còn từ lexical search; deploy index bằng `firebase deploy --only firestore:indexes`.
- **Chat trả `429 Rate limit exceeded`:** user gửi quá `CHAT_RATE_LIMIT_PER_MINUTE` (mặc định 20) req/phút. Tăng giới hạn qua env nếu cần.
- **Tài liệu cũ không xuất hiện qua vector search:** chưa được re-index sau khi deploy embedding — upload lại hoặc chạy `scripts/reindex-embeddings.mjs` (xem 10.2c). Tài liệu vẫn được tìm qua lexical search.
- **Bot trả lời "chưa có guideline" cho câu lẽ ra có trong tài liệu:** LLM relevance check (5.5) đã loại hết ứng viên. Kiểm tra bằng `node scripts/verify-relevance-check-e2e.mjs`; tạm tắt bằng `RETRIEVAL_RELEVANCE_CHECK_ENABLED=0` để so sánh. Relevance check không đạt 100% (lần đo gần nhất: 19/24 câu đúng phạm vi giữ được tài liệu đúng, 14/15 câu ngoài phạm vi bị loại đúng).
- **Sau khi bấm New Chat, chuyển sang tab khác không được, console báo `Minified React error #185`, URL kẹt ở `/chat?new=1`:** vòng lặp render trong effect xử lý `?new=1` của `useChatPage` — đã sửa ở PR #4 (effect giờ chỉ phụ thuộc cờ `?new=1` và các callback ổn định, và không kéo người dùng về `/chat` nếu họ đã chuyển tab). Nếu còn gặp sau deploy: hard refresh và đóng tab cũ (bản JS cũ trong tab vẫn lặp). Test giữ lỗi này: `src/hooks/useChatPage.test.ts`.
- **PDF lớn bị timeout khi ingest:** File API đang poll `state === ACTIVE`; timeout 90s. Kiểm tra kích thước PDF và log App Hosting.
- **storage/unauthorized** khi upload: kiểm tra role user doc và deploy `storage.rules` mới nhất.
- **File viewer báo lỗi CSP (inline style / img blocked):** route `/references/file/[id]` có CSP header riêng — nếu thêm `<style>` inline mới hoặc nguồn ảnh mới vào template, cập nhật directive `style-src` / `img-src` trong `src/app/references/file/[id]/route.ts` (xem mục 7.4).
- **`googletagmanager.com` ERR_BLOCKED_BY_CLIENT:** ad blocker chặn Google Analytics; không ảnh hưởng đăng nhập/chat.
- **`firestore.googleapis.com` ERR_BLOCKED_BY_CLIENT lúc đăng nhập (nút Login không phản ứng):** trình chặn quảng cáo/bảo mật của trình duyệt chặn kết nối Firestore đúng lúc `AuthContext` đang lấy role của user. Từ bản fix hiện tại, sau 10s sẽ tự hiện banner lỗi *"Không thể tải thông tin tài khoản..."* thay vì treo im lặng (xem mục 4.3, 8.4). Hướng dẫn user tắt extension hoặc kiểm tra tab Network để xác nhận đúng request bị chặn.
- **Đăng nhập xong vẫn đứng ở trang login, phải F5 nhiều lần mới vào được (do Firestore chậm):** Firestore role-fetch sau khi Auth thành công bị chậm/treo thoáng qua (mạng công ty cần long-polling detection, cold-start Firestore client) — trước bản fix, 1 lần timeout (10s) là `signOut` ngay, buộc user tự F5 lại để `AuthContext` thử lại từ đầu. Đã fix: `fetchRoleDoc()` tự retry 2 lần trước khi bỏ cuộc (mục 4.3). Nếu vẫn gặp thường xuyên sau fix, nhiều khả năng là mạng/Firestore chậm thật (>20s round-trip) — kiểm tra tab Network lúc login xem request tới `firestore.googleapis.com` có bị treo/chậm bất thường không.
- **Đăng nhập xong loading treo mãi, không báo lỗi, chỉ xảy ra lần đăng nhập đầu tiên trên browser/incognito mới (lần sau/đổi account trong cùng tab thì ổn):** đây là do `router.replace()` (client-side SPA navigation của Next.js) treo âm thầm khi điều hướng sang một route chưa từng render trong session trình duyệt đó — không phải lỗi Firestore/role, vì `user`/`authError` đã resolve đúng, chỉ là route không chuyển. Đã fix bằng cách đổi sang `window.location.assign(next)` (hard navigation, mục 8.4) — tái tạo đúng hành vi F5 thủ công một cách tự động, không phụ thuộc client router cache của Next 16 cho bước redirect này nữa.
- **Bấm Đăng xuất xong lại quay về trang chat/dashboard như cũ:** `Header.handleLogout` trước đây điều hướng sang `/login` **trước** khi `signOut(auth)` chạy xong (chỉ đợi 100ms). Trong khoảng đó `AuthContext.user` vẫn còn giá trị, nên effect "đã đăng nhập → redirect" của `LoginClient` (mục 8.4, hard navigation) hiểu nhầm là user vẫn đăng nhập và tự động điều hướng ngược lại route cũ trước khi `signOut` kịp xoá session. Đã fix: đảo thứ tự trong `src/components/Header.tsx` — `signOut(auth)` (và dọn `authSessions`) xong rồi mới `router.replace("/login")`, để `user` chắc chắn đã `null` lúc trang login mount.
- **Hydration mismatch có `bis_skin_checked`:** thường do browser extension chèn DOM, không phải lỗi app.
- **Đăng xuất máy A nhưng máy B vẫn vào được:** đúng thiết kế — không có đăng xuất toàn cục trừ khi admin `disabled` hoặc reset mật khẩu (xem mục 8.5).

---

## 12) Tài liệu liên quan

- `docs/ANALYTICS_REPORTS.md` - dashboard `/admin/reports` (telemetry, filter, metrics)
- `docs/HUONG_DAN_LEN_LIVE.md` - runbook deploy hằng ngày (tiếng Việt)
- `docs/RELEASE_PROCESS.md` - quy trình release tổng quát
- `docs/FIREBASE_DEPLOY.md` - checklist Firebase deploy/env
- `docs/PRE_LIVE_ENV_CHECKLIST.md` - audit env trước production
- `src/lib/retrieval/eval/BASELINE.md` - kết quả đo retrieval qua từng lần thay đổi (recall/MRR, relevance check, sweep trọng số RRF, các bug đã tìm)
- `tasks/prd-retrieval-quality-upgrade.md`, `tasks/tasks-retrieval-quality-upgrade.md` - PRD + task list đợt nâng cấp retrieval (M0–M5), kèm việc còn mở

## 13) Test

- `npm test` — Vitest. Mặc định môi trường `node`; file cần DOM khai báo `// @vitest-environment jsdom` ở đầu (vd. `src/hooks/useChatPage.test.ts`, dùng `@testing-library/react`).
- `e2e/*.spec.ts` — Playwright, cần app đang chạy và tài khoản test: `E2E_USER_USERNAME`/`E2E_USER_PASSWORD` (+ `E2E_ADMIN_*`). **Thiếu các biến này thì test cần đăng nhập bị skip** — ví dụ test "new chat link resets the conversation" lẽ ra đã bắt được lỗi React #185 ở mục 11 nhưng chưa từng chạy vì thiếu tài khoản test.

