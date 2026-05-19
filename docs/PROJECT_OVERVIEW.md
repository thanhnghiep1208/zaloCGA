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
- **LLM:** Google GenAI (`gemini-3-flash-preview`)
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
  - `documents`: kho tri thức đã index
  - `chatSessions`: lịch sử chat theo user
  - `users`: profile + role (`user`, `contributor`, `admin`)
  - `analyticsEvents`: telemetry nội bộ (server ghi, admin đọc dashboard)
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
- `src/app/admin/reports/page.tsx`: **Analytics Reports** — dashboard telemetry (chỉ `admin`). Chi tiết: mục 8.6.

### 4.3 Auth context và phân quyền UI

- `src/context/AuthContext.tsx`
  - Lắng nghe `onAuthStateChanged`.
  - Đọc role từ `users/{uid}` trong Firestore; **không** có profile hợp lệ → `signOut` (không fallback role `user`).
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
2. Nhận `query` từ body.
3. Retrieval tài liệu qua `RetrievalService.getContext`.
4. Generate stream câu trả lời từ Gemini.
5. Stream về client theo định dạng:
  - chunk đầu chứa danh sách source (`type: "sources"`)
  - phần text stream liên tục phía sau.

## 5.2 API ingest (`POST /api/ingest`)

File: `src/app/api/ingest/route.ts`

Chức năng:

1. Verify token.
2. Check role `admin|contributor`.
3. Validate `fileUrl` chỉ cho phép URL Firebase Storage bucket hiện tại (chống SSRF).
4. Tải binary file và parse:
  - PDF: dùng Gemini OCR/text extraction.
  - DOCX: dùng `mammoth`.
  - TXT/CSV: decode text.
5. Trả về `textContent` để client ghi vào Firestore `documents`.

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
- `src/lib/retrieval/FirebaseRetrievalProvider.ts`
  - Dùng Admin SDK đọc `documents` có `status == "indexed"`.

## 5.6 Firebase Admin init

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
- `textContent` (nội dung đã extract để retrieval)
- `uploadedBy`, `uploadedEmail`, `uploadedAt`, `updatedAt`

## 6.3 Collection `chatSessions`

Lịch sử chat theo user:

- `userId`
- `title` (từ tin nhắn user đầu tiên)
- `messages[]` (role/content/sources/timestamp)
- `createdAt`, `updatedAt`

## 6.4 Collection `analyticsEvents`

Telemetry nội bộ phục vụ dashboard **Analytics Reports** (`/admin/reports`). Mỗi document:

| Field | Mô tả |
| --- | --- |
| `eventName` | Loại sự kiện (xem bảng dưới) |
| `payload` | Object tuỳ loại event (thường có `user_id`) |
| `createdAt` | Server timestamp khi ghi |

**Quy tắc ghi:** chỉ server (Admin SDK) được `create`; client **không** ghi trực tiếp Firestore (`firestore.rules`: `write: false`).

### Các loại event

| `eventName` | Nguồn ghi | Payload chính |
| --- | --- | --- |
| `file_uploaded` | Client → `POST /api/events` (sau upload Storage, từ `/admin/upload`) | `file_type`, `size`, `user_id` |
| `parse_success` | Server → `/api/ingest` | `rule_count_extracted`, `latency_ms`, `user_id` |
| `query_sent` | Server → `/api/chat` | `query_text`, `type` (`guideline` \| `microcopy`), `user_id` |
| `response_delivered` | Server → `/api/chat` (sau stream xong) | `response_type`, `relevance_score`, `latency_ms`, `referenced_sources[]`, `user_id` |
| `user_feedback` | Client → `POST /api/events` (nút 👍/👎 trên `/chat`) | `feedback` (`thumbs_up` \| `thumbs_down`), `session_id`, `message_id`, `user_id` |

**Phân loại query/response:** `inferQueryType()` trong `src/lib/analytics-events.ts` — heuristic từ khóa (microcopy, toast, button, …); mặc định `guideline`.

**Relevance score:** `estimateRelevanceScore()` — overlap token đơn giản giữa câu hỏi và câu trả lời (0–1), không phải đánh giá LLM.

**Giới hạn dashboard:** trang reports đọc tối đa **300** event mới nhất (`orderBy createdAt desc`).

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
2. Client map username → `{username}@{INTERNAL_AUTH_EMAIL_DOMAIN}` rồi `signInWithEmailAndPassword`.
3. Sau khi Auth thành công, đọc `users/{uid}`:
   - Không có document → `signOut` + thông báo *Tài khoản chưa được cấp quyền*.
   - Có document hợp lệ → vào app (`/chat` hoặc redirect).
4. Trang `/login` hiển thị hướng dẫn liên hệ admin để xin cấp tài khoản (email + Zalo).

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

## 8.6 Analytics Reports flow

**Truy cập:** Sidebar → **Analytics Reports** (`/admin/reports`) — chỉ user có `role: "admin"`. `ProtectedRoute` + Firestore rules chặn role khác.

**Luồng dữ liệu:**

1. User/contributor upload tài liệu → `file_uploaded`.
2. Ingest thành công → `parse_success`.
3. User chat → `query_sent` rồi `response_delivered` (kèm latency, relevance, nguồn được trích dẫn).
4. User bấm 👍/👎 → `user_feedback`.
5. Trang reports subscribe realtime `analyticsEvents` (tối đa 300 bản ghi) và aggregate thành các chỉ số dưới đây.

### Nhóm metric trên UI

**Upload & Parsing**

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Số lượng file upload | Đếm `file_uploaded` |
| PDF / Word / khác | Phân loại từ `payload.file_type` |
| Kích thước trung bình | Trung bình `payload.size` (KB) |
| Tỷ lệ parse thành công | `parse_success` / `file_uploaded` × 100% |
| Avg parse latency | Trung bình `latency_ms` trên `parse_success` |
| Coverage rules | Tổng / trung bình `rule_count_extracted` trên `parse_success` |

**Query & Response**

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Invocation count | Đếm `query_sent` (guideline vs microcopy) |
| Success rate (proxy) | 👍 / (👍 + 👎) × 100% — *không* phải tỷ lệ HTTP thành công |
| Response quality | Trung bình `relevance_score` trên `response_delivered` |
| Feedback rate | (👍 + 👎) / số `response_delivered` × 100% |
| Avg response latency | Trung bình `latency_ms` trên `response_delivered` |

**Hiệu suất & Retention**

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Latency by complexity | Avg latency theo `response_type` guideline / microcopy |
| Usage funnel | Upload→Parse, Parse→Query, Query→Accepted (%) |
| Retention D1 / D7 | % user quay lại đúng ngày +1 / +7 sau ngày đầu có event (theo `user_id`) |
| Top referenced sources | File được trích dẫn nhiều nhất trong `referenced_sources` |

### Khi dashboard trống hoặc toàn số 0

- Chưa có traffic thật: cần ít nhất một lượt upload+ingest và/hoặc chat có feedback.
- Role không phải admin: listener Firestore trả `permission-denied`, UI không có số liệu.
- Môi trường mới deploy: collection `analyticsEvents` rỗng cho đến khi có hoạt động.
- **Google Analytics** (`NEXT_PUBLIC_GA_ID`) là kênh riêng (gtag); **không** đổ vào trang Analytics Reports này.

**File liên quan:** `src/app/admin/reports/page.tsx`, `src/lib/analytics-events.ts`, `src/app/api/events/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/ingest/route.ts`.

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

Mặc định trong code nếu không set: `accounts.internal` (email Auth dạng `admin@accounts.internal`).

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

Deploy rules:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,storage
```

Nếu backend App Hosting đã nối GitHub branch live (`main`), push code lên branch đó sẽ tự rollout.

## 10.3 Checklist release ngắn

1. `npm install` (khi có đổi dependency)
2. `npm run build`
3. Smoke test local các flow chính
4. Commit + push
5. Theo dõi App Hosting rollout đến `Succeeded`
6. Smoke test production + log monitor

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
- **storage/unauthorized** khi upload: kiểm tra role user doc và deploy `storage.rules` mới nhất.
- **`googletagmanager.com` ERR_BLOCKED_BY_CLIENT:** ad blocker chặn Google Analytics; không ảnh hưởng đăng nhập/chat nếu không dùng GA.
- **Hydration mismatch có `bis_skin_checked`:** thường do browser extension chèn DOM, không phải lỗi app.
- **Đăng xuất máy A nhưng máy B vẫn vào được:** đúng thiết kế — không có đăng xuất toàn cục trừ khi admin `disabled` hoặc reset mật khẩu (xem mục 8.5).

---

## 12) Tài liệu liên quan

- `docs/HUONG_DAN_LEN_LIVE.md` - runbook deploy hằng ngày (tiếng Việt)
- `docs/RELEASE_PROCESS.md` - quy trình release tổng quát
- `docs/FIREBASE_DEPLOY.md` - checklist Firebase deploy/env

