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
- **LLM:** Google GenAI (`gemini-3.5-flash`, fallback `gemini-3-flash-preview` / `gemini-2.5-flash`)
- **Embedding:** `text-embedding-004` (768 chiều) — dùng cho vector search
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
- `src/app/admin/reports/page.tsx`: **Analytics Reports** — dashboard telemetry (chỉ `admin`). Chi tiết: [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md).

### 4.3 Auth context và phân quyền UI

- `src/context/AuthContext.tsx`
  - Lắng nghe `onIdTokenChanged`.
  - Đọc role từ `users/{uid}` trong Firestore; **không** có profile hợp lệ hoặc role không parse được → `signOut` + set `authError` (không fallback role `user`).
  - `getDoc(users/{uid})` được bọc bởi `withTimeout()` (`src/lib/with-timeout.ts`, timeout 10s): nếu request Firestore bị treo (vd. trình chặn quảng cáo/bảo mật chặn `firestore.googleapis.com` gây `net::ERR_BLOCKED_BY_CLIENT`), context sẽ tự timeout, sign-out, và set `authError` thay vì để UI treo vô thời hạn không phản hồi.
  - Context expose `authError: string | null` — trang login đọc giá trị này để hiển thị banner lỗi.
- `ProtectedRoute` dùng để chặn truy cập sai role ở client UI.
- `src/lib/auth-username.ts`: chuẩn hóa username, map `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}`.

Lưu ý: bảo vệ ở UI chỉ là lớp hiển thị. Bảo mật thật nằm ở Firestore/Storage rules + API auth server-side.

**Đăng nhập đa phiên (hiện trạng):** một tài khoản **có thể** đăng nhập đồng thời trên nhiều trình duyệt/máy. App dùng Firebase Auth mặc định (mỗi client một refresh token); **không** có registry phiên, không giới hạn “một thiết bị”. Chi tiết: mục 8.5.

---

## 5) Cấu trúc backend

## 5.1 API chat (`POST /api/chat`)

File: `src/app/api/chat/route.ts`

Chức năng:

1. Verify Firebase ID token (`requireUidFromRequest`).
2. **Rate limit**: kiểm tra Firestore `rate_limits/{uid}_{windowKey}` — mặc định 20 req/phút (env `CHAT_RATE_LIMIT_PER_MINUTE`); trả `429` nếu vượt.
3. Nhận `query`, `conversation` (history), `attachments`, `sessionId` từ body.
4. Retrieval tài liệu qua `RetrievalService.getContext` (vector search → lexical fallback, xem 5.5).
5. Generate stream câu trả lời từ Gemini; conversation history được truyền đúng chuẩn multi-turn `contents[]` thay vì nhúng vào system prompt.
6. Stream về client theo **định dạng NDJSON** — mỗi dòng là một JSON object:
   - Dòng 1: `{"t":"s","d":[...ChatSource[]]}` — danh sách nguồn tài liệu (gửi trước khi có text)
   - Dòng 2..N: `{"t":"x","d":"text delta"}` — từng đoạn text từ Gemini
   - `Content-Type: application/x-ndjson`

## 5.2 API ingest (`POST /api/ingest`)

File: `src/app/api/ingest/route.ts`

Chức năng:

1. Verify token.
2. Check role `admin|contributor`.
3. Validate `fileUrl` chỉ cho phép URL Firebase Storage bucket hiện tại (chống SSRF).
4. Tải binary file và parse:
   - **PDF < 4 MB**: gửi inline base64 tới `gemini-3.5-flash`.
   - **PDF ≥ 4 MB**: upload lên **Gemini File API** → poll đến `state === ACTIVE` (timeout 90s) → dùng `fileData` URI → tự động xóa file sau khi extract xong. Nếu File API lỗi, fallback về inline.
   - **DOCX**: dùng `mammoth`.
   - **TXT/CSV**: decode text.
5. **Chunking + Embedding**: nếu request chứa `docId`, tự động:
   - Chunk text thành đoạn ~1800 ký tự với overlap 200 ký tự.
   - Gọi Gemini `text-embedding-004` (768 chiều) để embed từng chunk (5 concurrent).
   - Ghi vào collection `document_chunks` qua Firestore batch write.
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
2. Chỉ chấp nhận `file_uploaded` và `user_feedback` từ client (whitelist).
3. Ghi event vào Firestore `analyticsEvents` qua `logAnalyticsEvent()` (kèm `user_id`).

Các event khác (`parse_success`, `query_sent`, `response_delivered`) được ghi **server-side** trong `/api/ingest` và `/api/chat`.

## 5.5 Retrieval service

- `src/lib/RetrievalService.ts`
  - Prompt hợp nhất, model tự suy luận 2 kiểu intent:
    - Tra cứu guideline
    - Soạn microcopy UX
  - Luôn yêu cầu `SOURCES_USED` ở cuối câu trả lời.
  - Conversation history được truyền vào `contents[]` chuẩn multi-turn (không nhúng vào system prompt).
  - Chat model: mặc định `gemini-3.5-flash`, fallback `gemini-3-flash-preview` → `gemini-2.5-flash` (override bằng `GEMINI_CHAT_MODELS`, comma-separated).
- `src/lib/gemini-models.ts` — hằng số model Gemini dùng chung (chat + ingest PDF).
- `src/lib/retrieval/FirebaseRetrievalProvider.ts` — **hai chế độ retrieval**:
  1. **Vector search (ưu tiên):** embed query bằng `text-embedding-004` → `findNearest()` trên collection `document_chunks` (COSINE, lấy top `RETRIEVAL_VECTOR_CANDIDATES` = 20) → dedup theo `docId` → trả ≤ `RETRIEVAL_MAX_SNIPPETS` (mặc định 6). Yêu cầu Firestore vector index đã deploy (xem mục 10).
  2. **Lexical fallback:** nếu vector search thất bại hoặc trả về 0 kết quả (tài liệu chưa được embed), fetch ≤ `RETRIEVAL_FIRESTORE_FETCH_LIMIT` (mặc định 120) docs từ collection `documents`, rank bằng keyword overlap (`countTermHits`), lấy top `RETRIEVAL_MAX_SNIPPETS`.
- `src/lib/documents/chunking.ts` — chia text thành `TextChunk[]` (~1800 ký tự/chunk, overlap 200 ký tự, tôn trọng ranh giới đoạn văn).
- `src/lib/documents/embeddings.ts` — wrapper `text-embedding-004`: `embedTexts()` (batch), `embedQuery()` (RETRIEVAL_QUERY task type), `writeDocumentChunks()`, `deleteDocumentChunks()`.

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
- `textContent` (nội dung đã extract — dùng cho lexical fallback và hiển thị)
- `uploadedBy`, `uploadedEmail`, `uploadedAt`, `updatedAt`

## 6.2b Collection `document_chunks`

Chunks nhỏ của tài liệu — backbone của vector search:

- `docId` (ref tới `documents/{id}`)
- `fileName` (copy từ document cha để tra cứu nhanh)
- `chunkIndex` (vị trí trong document)
- `text` (nội dung đoạn, ~1800 ký tự)
- `embedding` (Firestore `VectorValue`, 768 chiều — `text-embedding-004`)
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

- Document ID: `{uid}_{windowKey}` (windowKey = `Math.floor(Date.now() / 60000)`)
- `count` (số request trong window hiện tại)
- `expireAt` (Timestamp — end of next window)

**Quan trọng:** cần bật **Firestore TTL policy** trên field `expireAt` để tự dọn docs cũ (xem mục 10.2).

---

## 7) Security model

## 7.1 Firestore Rules (`firestore.rules`)

- `chatSessions`: user chỉ thao tác session của chính mình.
- `users`:
  - user đọc/sửa hồ sơ của mình nhưng không tự nâng role; **không** được `create` (không tự đăng ký).
  - chỉ `admin` được `create` document `users/*`.
  - admin có toàn quyền đọc/ghi/xóa.
- `documents`:
  - signed-in user được đọc.
  - chỉ `admin|contributor` mới được create/update/delete.
- `analyticsEvents`:
  - chỉ `admin` được đọc (dashboard).
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
2. Client map username → `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}` rồi `signInWithEmailAndPassword` (`src/app/login/page.tsx`).
3. **Việc quyết định "được phép vào app hay không" nằm hoàn toàn ở `AuthContext`** (không có check trùng lặp ở trang login):
   - `onIdTokenChanged` fire → đọc `users/{uid}` (có timeout 10s, xem mục 4.3).
   - Không có document, hoặc role không hợp lệ, hoặc request timeout/lỗi mạng → `signOut` + set `authError` (message khác nhau tùy nguyên nhân: *chưa được cấp quyền* vs *không thể tải thông tin tài khoản, có thể do mạng/trình chặn quảng cáo*).
   - Có document + role hợp lệ → set cookie `__session`, set `user`/`role`.
4. Trang `/login` có một `useEffect` theo dõi `user` (không phải gọi trực tiếp trong submit handler — tránh redirect loop với middleware, xem lịch sử fix ở commit `61d58f5`): khi `user` xuất hiện, `router.replace(next)` với `next` lấy từ query `?next=` (do middleware set khi redirect user chưa đăng nhập) hoặc mặc định `/chat`.
5. Banner lỗi trên trang login hiển thị `error` (lỗi validate/sign-in cục bộ) **hoặc** `authError` (từ AuthContext).
6. Trang `/login` hiển thị hướng dẫn liên hệ admin để xin cấp tài khoản (email + Zalo).

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

Dashboard tại `/admin/reports` (admin only): telemetry từ `analyticsEvents`, polling **6 giờ** + nút **Cập nhật**, filter **Hôm nay / 7 / 30 ngày** (UTC).

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
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` (client: map username → email Auth)
- `INTERNAL_AUTH_EMAIL_DOMAIN` (server/API admin; **cùng giá trị** với biến `NEXT_PUBLIC_*`)

Mặc định trong code nếu không set: `accounts.internal` (email Auth dạng `admin@accounts.internal`). Server **từ chối khởi động** nếu hai biến domain được set nhưng khác nhau.

Tùy chọn (Gemini & chat):

- `GEMINI_CHAT_MODELS` — danh sách model chat, phân tách bằng dấu phẩy. Mặc định: `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash` (thử lần lượt khi model trước lỗi).
- `CHAT_RATE_LIMIT_PER_MINUTE` — số request tối đa mỗi user mỗi phút. Mặc định: `20`.

Tùy chọn (retrieval):

- `RETRIEVAL_VECTOR_CANDIDATES` — số chunk candidates lấy từ `findNearest()` trước khi dedup theo docId. Mặc định: `20`.
- `RETRIEVAL_MAX_SNIPPETS` — số snippet tối đa truyền vào context Gemini. Mặc định: `6`.
- `RETRIEVAL_MAX_CHARS_PER_SNIPPET` — ký tự tối đa mỗi snippet. Mặc định: `2600`.
- `RETRIEVAL_FIRESTORE_FETCH_LIMIT` — giới hạn doc khi dùng lexical fallback. Mặc định: `120`.

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

Tài liệu upload trước khi có vector search **chưa có chunks** — sẽ chỉ được tìm bằng lexical fallback. Để re-index toàn bộ, upload lại từng tài liệu trong `/admin/library` hoặc chạy migration script riêng.

## 10.3 Checklist release ngắn

1. `npm install` (khi có đổi dependency)
2. `npm run validate:env` (kiểm tra cặp domain auth, tùy chọn trước deploy)
3. `npm test` (Vitest — reports, chat stream, env, retrieval)
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
- **Chat/ingest Gemini lỗi model:** kiểm tra `GEMINI_API_KEY` và quyền model `gemini-3.5-flash`; fallback tự thử model trong `GEMINI_CHAT_MODELS`.
- **Vector search lỗi `index not ready`:** index `document_chunks.embedding` chưa deploy hoặc đang tạo → retrieval tự fallback lexical, deploy index bằng `firebase deploy --only firestore:indexes`.
- **Chat trả `429 Rate limit exceeded`:** user gửi quá `CHAT_RATE_LIMIT_PER_MINUTE` (mặc định 20) req/phút. Tăng giới hạn qua env nếu cần.
- **Tài liệu cũ không xuất hiện qua vector search:** chưa được re-index sau khi deploy embedding — upload lại hoặc chạy migration. Tài liệu vẫn được tìm qua lexical fallback.
- **PDF lớn bị timeout khi ingest:** File API đang poll `state === ACTIVE`; timeout 90s. Kiểm tra kích thước PDF và log App Hosting.
- **storage/unauthorized** khi upload: kiểm tra role user doc và deploy `storage.rules` mới nhất.
- **File viewer báo lỗi CSP (inline style / img blocked):** route `/references/file/[id]` có CSP header riêng — nếu thêm `<style>` inline mới hoặc nguồn ảnh mới vào template, cập nhật directive `style-src` / `img-src` trong `src/app/references/file/[id]/route.ts` (xem mục 7.4).
- **`googletagmanager.com` ERR_BLOCKED_BY_CLIENT:** ad blocker chặn Google Analytics; không ảnh hưởng đăng nhập/chat.
- **`firestore.googleapis.com` ERR_BLOCKED_BY_CLIENT lúc đăng nhập (nút Login không phản ứng):** trình chặn quảng cáo/bảo mật của trình duyệt chặn kết nối Firestore đúng lúc `AuthContext` đang lấy role của user. Từ bản fix hiện tại, sau 10s sẽ tự hiện banner lỗi *"Không thể tải thông tin tài khoản..."* thay vì treo im lặng (xem mục 4.3, 8.4). Hướng dẫn user tắt extension hoặc kiểm tra tab Network để xác nhận đúng request bị chặn.
- **Hydration mismatch có `bis_skin_checked`:** thường do browser extension chèn DOM, không phải lỗi app.
- **Đăng xuất máy A nhưng máy B vẫn vào được:** đúng thiết kế — không có đăng xuất toàn cục trừ khi admin `disabled` hoặc reset mật khẩu (xem mục 8.5).

---

## 12) Tài liệu liên quan

- `docs/ANALYTICS_REPORTS.md` - dashboard `/admin/reports` (telemetry, filter, metrics)
- `docs/HUONG_DAN_LEN_LIVE.md` - runbook deploy hằng ngày (tiếng Việt)
- `docs/RELEASE_PROCESS.md` - quy trình release tổng quát
- `docs/FIREBASE_DEPLOY.md` - checklist Firebase deploy/env
- `docs/PRE_LIVE_ENV_CHECKLIST.md` - audit env trước production

