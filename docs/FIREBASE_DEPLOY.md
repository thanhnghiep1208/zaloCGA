# Firebase Deploy Checklist

## 1) Prerequisites

- Install CLI: `npm i -g firebase-tools`
- Login: `firebase login`
- Select project: `firebase use <your-firebase-project-id>`

## 2) One-time App Hosting setup

Run this once at repo root:

```bash
firebase init apphosting
```

Choose the same Firebase project as above and connect to your GitHub repo.

## 3) Configure production environment variables

Set these in **Firebase App Hosting > Backend > Environment variables**:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON string of service account)
- `GEMINI_API_KEY` (cho `/api/chat` và `/api/ingest`)
- Tùy chọn: `NEXT_PUBLIC_SITE_URL` (canonical URL cho metadata/OG), `NEXT_PUBLIC_GA_ID`
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` và `INTERNAL_AUTH_EMAIL_DOMAIN` (cùng giá trị, ví dụ `accounts.internal`)

Chi tiet pre-live audit env (bat buoc + khuyen nghi + token tuning):

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
4. Trang `/login` hiển thị form username/password, mô tả *Zalo Content Guidelines*, và footer liên hệ xin cấp tài khoản (email + Zalo — chỉnh trong `src/app/login/page.tsx` nếu đổi người liên hệ).

**Lỗi thường gặp:** đăng nhập đúng mật khẩu nhưng báo *chưa được cấp quyền* → thiếu hoặc sai ID document Firestore (phải khớp `auth.uid`).

## 4) Deploy security rules

```bash
firebase deploy --only firestore:rules,storage
```

## 5) Deploy app

If App Hosting is connected to GitHub, pushing to the configured branch will auto-deploy.
You can also deploy via CLI:

```bash
firebase deploy --only apphosting
```

## 6) Smoke test in production

- `/login`: form **username + password** (không có Google); copy *Zalo Content Guidelines*; có dòng liên hệ cấp tài khoản
- Login admin → `/admin/users` → tạo user thử (tùy chọn)
- Open `/chat` then exit: no empty `chatSessions` doc created
- Send first message: `chatSessions` doc is created
- Continue chatting: same session document updates
- Upload document with contributor/admin account: success
- Open admin pages with regular user account: blocked

