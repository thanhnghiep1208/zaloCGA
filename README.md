# Internal Knowledge Chat

Trợ lý nội bộ **Zalo Content Guidelines** — tra cứu guideline nội dung và soạn microcopy UX từ kho tài liệu nội bộ.

**Đăng nhập:** username + password (admin cấp tài khoản; không đăng ký công khai, không Google). Thiết lập Auth/Firestore: `docs/FIREBASE_DEPLOY.md`.

## Project docs

- Tổng quan kiến trúc + flow + frontend/backend + Firebase/deploy: `docs/PROJECT_OVERVIEW.md`
- Analytics Reports (`/admin/reports`): `docs/ANALYTICS_REPORTS.md`
- **UI & theme (triển khai thực tế):** `docs/UI_AND_THEME.md`
- Tham chiếu cảm hứng thiết kế (Superhuman): `docs/DESIGN.md`
- Quy trình release: `docs/RELEASE_PROCESS.md`
- Hướng dẫn lên live nhanh (VI): `docs/HUONG_DAN_LEN_LIVE.md`
- Checklist deploy Firebase: `docs/FIREBASE_DEPLOY.md`
- Checklist env pre-live: `docs/PRE_LIVE_ENV_CHECKLIST.md`
- Chất lượng retrieval (kết quả đo, cách chạy eval): `src/lib/retrieval/eval/BASELINE.md` và mục 5.5 / 5.5b trong `PROJECT_OVERVIEW.md`
- PRD + task list nâng cấp retrieval: `docs/tasks/`

**LLM:** Gemini API — mặc định `gemini-3.8-flash` (chat + ingest PDF), fallback `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`. Chi tiết env: mục 9 trong `PROJECT_OVERVIEW.md`.

## Cấu trúc thư mục

```
src/app/          Route Next.js (trang + API)
src/components/   UI (chat/, landing/, reports/)
src/hooks/        Hook phía client
src/lib/          Business logic (retrieval/, documents/, chat/, reports/, env/)
src/context/      Auth + theme provider
scripts/          Script vận hành (eval retrieval, migrate, reindex, validate env)
e2e/              Test Playwright
docs/             Tài liệu dự án; docs/tasks/ chứa PRD + task list
public/           Asset tĩnh (icon, og-image)
```

## Run local

```bash
npm install
cp .env.example .env.local   # điền Firebase + GEMINI_API_KEY
npm run validate:env
npm run dev
```

App chạy tại `http://localhost:3000`.

## Build check

```bash
npm test
npm run build
```

