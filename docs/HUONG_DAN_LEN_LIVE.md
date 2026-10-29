# Hướng dẫn đưa thay đổi lên môi trường live

Dự án deploy production qua **Firebase App Hosting**. Sau khi cập nhật tính năng, làm theo thứ tự dưới đây.

## Luồng tóm tắt

1. Kiểm tra local → 2. Commit & push Git → 3. Deploy app (tự động hoặc tay) → 4. (Nếu có) Deploy rules / cập nhật env → 5. Kiểm tra trên URL production.

---

## Bước 1 — Kiểm tra trên máy

```bash
npm install          # nếu vừa đổi package.json
npm run validate:env # kiểm tra cặp INTERNAL_AUTH / NEXT_PUBLIC domain
npm test             # Vitest (reports, env, chat stream, …)
npm run build
npm run dev          # smoke test nhanh
```

Nên thử nhanh các luồng liên quan tới thay đổi của bạn, ví dụ:

- `/login`: username + password (không Google); nếu sửa copy/UI login thì kiểm tra tại đây.
- Đăng nhập, mở `/chat`, gửi tin (API `/api/chat` có auth).
- `/admin/users` nếu sửa quản lý tài khoản.
- Upload tài liệu nếu sửa ingest/admin.
- `/admin/reports` nếu sửa analytics (filter thời gian, nút Cập nhật).
- Trang landing hoặc metadata nếu sửa SEO.

---

## Bước 2 — Đẩy code lên GitHub

Khuyên dùng: làm trên branch riêng, mở PR vào `main`, merge xong mới coi như bước này hoàn tất (push thẳng `main` = rollout production ngay).

```bash
git checkout -b feat/ten-thay-doi
git add <file>
git commit -m "feat: mô tả ngắn thay đổi"
git push -u origin feat/ten-thay-doi
gh pr create --base main
```

---

## Bước 3 — Lên live (App Hosting)

### Cách A — Đã nối GitHub với App Hosting (khuyên dùng)

- Trong Firebase Console, backend App Hosting đã trỏ **live branch** (thường là `main`).
- **Chỉ cần push lên đúng branch đó** → Cloud Build/Rollout chạy tự động.
- **Lưu ý:** thay đổi giao diện Next.js (ví dụ trang `/login`) chỉ lên production qua rollout này — `firebase deploy --only firestore:rules,storage` **không** cập nhật UI app.
- Theo dõi: **Firebase Console → App Hosting → Rollouts** cho đến trạng thái thành công.

### Cách B — Deploy thủ công từ máy (hotfix / chưa nối Git)

Tại thư mục gốc project, đã `firebase login` và `firebase use <project-id>`:

```bash
firebase deploy --only apphosting
```

---

## Bước 4 — Khi nào cần thêm lệnh?

### Đổi Firestore/Storage rules hoặc index

Nếu bạn sửa `firestore.rules`, `storage.rules` hoặc `firestore.indexes.json`:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### Đổi biến môi trường trên App Hosting

1. **Biến thường** (`GEMINI_CHAT_MODELS`, `NEXT_PUBLIC_*`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` + `INTERNAL_AUTH_EMAIL_DOMAIN` — **hai biến domain phải cùng giá trị**…): **Firebase Console → App Hosting → Backend → Environment variables**.
2. **Secret** (`GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `CHAT_ATTACHMENTS_CRON_SECRET`): `firebase apphosting:secrets:set <TÊN>` — **không** nhập giá trị vào Console (giá trị literal ở Console sẽ đè secret; xem `PROJECT_OVERVIEW.md` mục 9.1).
3. Local: `npm run validate:env` trước khi push (đọc `.env` / `.env.local`, chỉ kiểm tra cặp domain).
4. **Bắt buộc rollout lại** để build nhận giá trị mới (đặc biệt với `NEXT_PUBLIC_*` và secret):
  - push thêm một commit nhỏ, **hoặc**
  - chạy lại `firebase deploy --only apphosting`.

---

## Bước 5 — Kiểm tra sau khi live

- Mở URL production (ví dụ `https://…hosted.app`).
- Thử cửa sổ ẩn danh hoặc hard refresh (Cmd+Shift+R) nếu nghi cache.
- Admin: **Analytics Reports** — checklist trong [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md#smoke-test-admin).
- Xem log lỗi: **App Hosting → Logs** trong vài phút đầu.

---

## Rollback nhanh nếu bản mới lỗi

1. **Firebase Console → App Hosting → Rollouts**
2. Chọn bản rollout ổn định trước đó → rollback / release lại.
3. Sửa code trên branch phù hợp, merge/push và deploy lại sau khi đã test.

---

## Tài liệu liên quan

- [FIREBASE_DEPLOY.md](./FIREBASE_DEPLOY.md) — checklist deploy Firebase & env lần đầu.
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) — quy trình release (tiếng Anh: smoke test, rollback).

