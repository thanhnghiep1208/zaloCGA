# Internal Knowledge Chat

Trợ lý nội bộ **Zalo Content Guidelines** — tra cứu guideline nội dung và soạn microcopy UX từ kho tài liệu nội bộ.

**Đăng nhập:** username + password (admin cấp tài khoản; không đăng ký công khai, không Google). Thiết lập Auth/Firestore: `docs/FIREBASE_DEPLOY.md`.

## Project docs

- Tổng quan kiến trúc + flow + frontend/backend + Firebase/deploy: `docs/PROJECT_OVERVIEW.md`
- **UI & theme (triển khai thực tế):** `docs/UI_AND_THEME.md`
- Tham chiếu cảm hứng thiết kế (Superhuman): `docs/DESIGN.md`
- Quy trình release: `docs/RELEASE_PROCESS.md`
- Hướng dẫn lên live nhanh (VI): `docs/HUONG_DAN_LEN_LIVE.md`
- Checklist deploy Firebase: `docs/FIREBASE_DEPLOY.md`

## Run local

```bash
npm install
npm run dev
```

App chạy tại `http://localhost:3000`.

## Build check

```bash
npm run build
```

