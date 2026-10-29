# Firebase Deploy Checklist

## 1) Prerequisites

- Install CLI: `npm i -g firebase-tools`
- Login: `firebase login`
- Select project: `firebase use <your-firebase-project-id>` (mẫu alias: `.firebaserc.example`)
- **Dựng trên project khác `zalo-ikc`?** Sửa 2 giá trị hard-code trong `firebase.json`: `storage.bucket` và `apphosting.backendId`.

## 2) One-time App Hosting setup

Run this once at repo root:

```bash
firebase init apphosting
```

Choose the same Firebase project as above and connect to your GitHub repo.

## 3) Configure production environment variables

**Secrets — KHÔNG đặt trong Console.** `apphosting.yaml` đã khai báo 3 biến dưới đây dạng `secret:`; chỉ cần tạo giá trị trong Secret Manager:

```bash
firebase apphosting:secrets:set FIREBASE_SERVICE_ACCOUNT_KEY   # full JSON service account
firebase apphosting:secrets:set GEMINI_API_KEY
firebase apphosting:secrets:set CHAT_ATTACHMENTS_CRON_SECRET   # ≥ 32 ký tự, vd. openssl rand -hex 32
```

> Nếu Console có **giá trị literal** cho cùng tên biến, nó sẽ đè `secret:` trong YAML (sự cố 2026-07-14). Xem `PROJECT_OVERVIEW.md` mục 9.1.

`GEMINI_API_KEY` dùng cho `/api/chat`, `/api/ingest`, embedding `gemini-embedding-2`; model mặc định `gemini-3.8-flash` (`src/lib/gemini-models.ts`). `CHAT_ATTACHMENTS_CRON_SECRET` được khai báo trong YAML nên phải tồn tại kể cả khi chưa dựng cron.

**Biến thường** — đặt trong **Firebase App Hosting > Backend > Environment variables** (hoặc thêm vào `apphosting.yaml`):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- Tùy chọn: `GEMINI_CHAT_MODELS` (danh sách model chat fallback, phân cách dấu phẩy)
- Tùy chọn: `CHAT_RATE_LIMIT_PER_MINUTE` (mặc định `20` req/phút/user)
- Tùy chọn: `NEXT_PUBLIC_SITE_URL` (canonical URL cho metadata/OG), `NEXT_PUBLIC_GA_ID`
- Tùy chọn: `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_ZALO` (liên hệ mặc định ở `/login` khi admin chưa lưu liên hệ trên `/admin/users`)
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` và `INTERNAL_AUTH_EMAIL_DOMAIN` (cùng giá trị, ví dụ `accounts.internal`)

Danh sách đầy đủ biến (kể cả `RETRIEVAL_*`, giới hạn chat): `PROJECT_OVERVIEW.md` mục 9. Audit pre-live:

- [PRE_LIVE_ENV_CHECKLIST.md](./PRE_LIVE_ENV_CHECKLIST.md)

## 3.1) Auth: username/password (admin cấp tài khoản)

1. **Firebase Console → Authentication → Sign-in method**
   - Bật **Email/Password**
   - Tắt **Google**
2. **Tài khoản admin đầu tiên** (một lần, trước khi có UI admin):
   - **Cách A (Console):**
     - Authentication → Users → Add user: email `{username}@{domain}` (ví dụ `admin@accounts.internal` nếu `INTERNAL_AUTH_EMAIL_DOMAIN=accounts.internal`), đặt password.
     - Firestore → collection `users` → **document ID = UID** của user vừa tạo (copy từ tab Authentication), **không** dùng Auto-ID.
     - Fields gợi ý: `uid`, `username` (ví dụ `"admin"`), `email` (cùng email Auth), `role: "admin"`, `createdAt` (server timestamp).
   - **Cách B (sau khi đã có admin):** `/admin/users` → **Tạo tài khoản mới** (`POST /api/admin/users`).
3. User mới **không** tự đăng ký: chỉ đăng nhập được sau khi admin tạo cả Auth user **và** document `users/{uid}`.
4. Trang `/login` hiển thị form username/password, mô tả *Zalo Content Guidelines*, và footer liên hệ xin cấp tài khoản (email + Zalo). Đổi người liên hệ: admin vào `/admin/users` → panel liên hệ (lưu Firestore `settings/accountContact`); chưa lưu thì dùng env `NEXT_PUBLIC_CONTACT_*`.

**Lỗi thường gặp:** đăng nhập đúng mật khẩu nhưng báo *chưa được cấp quyền* → thiếu hoặc sai ID document Firestore (phải khớp `auth.uid`).

## 3.2) Đăng nhập đa phiên / đa máy (FAQ)

**Có cho phép không?** Có. Một user có thể đăng nhập cùng lúc trên nhiều máy/trình duyệt. App không giới hạn số phiên; Firebase Auth cấp refresh token riêng cho từng client.

**Smoke test (local hoặc production):**

1. Đăng nhập user thử trên Chrome (hoặc cửa sổ ẩn danh A).
2. Đăng nhập **cùng** username/password trên Firefox hoặc cửa sổ ẩn danh B.
3. Cả hai mở `/chat` → đều vào được, gửi tin được.
4. Đăng xuất trên A → B vẫn đăng nhập (hành vi mong đợi).

**Troubleshooting:**

| Triệu chứng | Giải thích |
|-------------|------------|
| Máy A đăng xuất nhưng máy B vẫn dùng được | `signOut` chỉ xóa session local trên máy A; không có “đăng xuất tất cả thiết bị”. |
| Admin disable user / reset mật khẩu | API đánh dấu `revoked` mọi `authSessions` → client đang mở bị đăng xuất gần như ngay; Auth `disabled` chặn refresh token. |
| Muốn đăng xuất một máy, giữ máy khác | User: `/account/sessions` → *Đăng xuất phiên*. Admin: `/admin/users` → **Phiên**. |
| Lỗi tải danh sách phiên | Deploy `firestore.rules` + `firestore.indexes.json` (collection `authSessions`). |

**Quản lý phiên:** sau deploy rules/index, user vào `/account/sessions` hoặc admin bấm **Phiên** trên từng user.

Chi tiết kiến trúc: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) mục 8.5.

## 4) Deploy security rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

> `firestore:indexes` deploy cả vector index cho collection `document_chunks` (field `embedding`, 1536 chiều). Index ở trạng thái `CREATING` vài phút — trong thời gian đó vector search trả rỗng, kết quả chỉ còn từ lexical search.

## 4b) Bật Firestore TTL policy (một lần)

Sau deploy lần đầu, bật TTL để tự dọn documents cũ trong `rate_limits`:

1. **Firebase Console → Firestore → Indexes → TTL Policies → Add**
2. Collection: `rate_limits` | Field: `expireAt`
3. Save.

## 5) Deploy app

Nếu App Hosting đã nối GitHub, push lên branch live (`main`) sẽ tự rollout. Hoặc deploy bằng CLI:

```bash
firebase deploy --only apphosting
```

## 6) Smoke test in production

- `/login`: form **username + password** (không có Google); copy *Zalo Content Guidelines*; có dòng liên hệ cấp tài khoản
- **Đa phiên:** cùng user đăng nhập trên 2 trình duyệt → cả hai vào `/chat` (xem mục 3.2)
- Login admin → `/admin/users` → tạo user thử (tùy chọn)
- Open `/chat` then exit: no empty `chatSessions` doc created
- Send first message: `chatSessions` doc is created
- Continue chatting: same session document updates
- Upload document with contributor/admin account: success; log App Hosting có `[Ingest] Wrote N chunks for doc ...`
- Open admin pages with regular user account: blocked
- Gửi chat nhiều hơn 20 lần/phút → nhận `429 Rate limit exceeded`
- Admin → **Analytics Reports** (`/admin/reports`): xem [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md) (filter thời gian, refresh 6h, smoke test).

