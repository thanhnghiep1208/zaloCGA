# Pre-live Environment Checklist (Firebase App Hosting)

Checklist nay dung de xac nhan env truoc khi rollout production.

## 1) Bat buoc phai co (khong co se loi)

Dat trong **Firebase Console -> App Hosting -> Backend -> Environment variables**:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GEMINI_API_KEY` (chat `/api/chat` + PDF ingest `/api/ingest`; model mac dinh `gemini-3.7-flash`)
- `FIREBASE_SERVICE_ACCOUNT_KEY` (khuyen nghi dung Secret Manager, xem muc 3)
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` (domain noi bo map username -> Firebase email, vi du `accounts.internal`)
- `INTERNAL_AUTH_EMAIL_DOMAIN` (**bat buoc cung gia tri** voi bien `NEXT_PUBLIC_*`; server fail startup neu khac nhau)

> Kiem tra local: `npm run validate:env` (doc `.env.example`). Runtime server goi `src/instrumentation.ts` de validate cap domain.

## 1b) Gemini & chat (tuy chon)

- `GEMINI_CHAT_MODELS` — danh sach model chat, phan cach bang dau phay. Mac dinh: `gemini-3.7-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-2.5-flash`
- `CHAT_RATE_LIMIT_PER_MINUTE` — so request toi da moi user moi phut. Mac dinh: `20`
- `CHAT_ATTACHMENTS_CRON_SECRET` — bat buoc neu dung cron don anh chat het TTL (`apphosting.yaml` khai bao day la secret); route cron tra `503` neu chua dat

## 2) Khuyen nghi cho production

- `NEXT_PUBLIC_SITE_URL` (canonical/OG URL)
- `NEXT_PUBLIC_GA_ID` (neu bat Google Analytics)

## 3) Khuyen nghi bao mat

- Khong luu secrets trong source code.
- Uu tien cau hinh `FIREBASE_SERVICE_ACCOUNT_KEY` qua App Hosting secret:
  - Tao secret: `firebase apphosting:secrets:set FIREBASE_SERVICE_ACCOUNT_KEY`
  - Gan secret vao backend env theo huong dan App Hosting.
- Dam bao service account co quyen toi thieu can thiet (Firestore/Auth/Storage theo luong app).

## 4) Kiem tra truoc build (khuyen nghi)

```bash
npm run validate:env
npm test
npm run build
```

## 5) Bien toi uu token/chat (tuy chon, nen dat ro)

- `RETRIEVAL_MAX_SNIPPETS` (goi y: `8`-`10` neu can tong hop nhieu nguon)
- `RETRIEVAL_MAX_CHARS_PER_SNIPPET` (goi y: `2500`-`4000`)
- `RETRIEVAL_VECTOR_CANDIDATES` (goi y: `20`-`30` — so chunk lay tu vector search truoc khi dedup)
- `RETRIEVAL_FIRESTORE_FETCH_LIMIT` (goi y: `80`-`150` — chi dung cho lexical fallback)
- `CHAT_CONVERSATION_MAX_CHARS_PER_TURN` (goi y: `1500`-`3000`)
- `CHAT_QUERY_MAX_CHARS` (goi y: `6000`-`12000`)

> Neu chua dat cac bien tren, app van chay bang gia tri mac dinh trong code.

## 6) Availability cho NEXT_PUBLIC_* (quan trong)

Voi `NEXT_PUBLIC`_*, dam bao bien co hieu luc trong giai doan **BUILD**.
Neu chi doi env ma khong rollout lai, frontend co the van dung gia tri cu.

## 7) Quy trinh cap nhat env dung

1. Cap nhat env trong Firebase App Hosting backend.
2. Rollout lai de build/runtime nhan gia tri moi:
  - Push commit moi vao live branch, hoac
  - Chay `firebase deploy --only apphosting`.
3. Kiem tra rollout thanh cong trong Firebase Console -> App Hosting -> Rollouts.

## 8) Smoke test sau rollout (5-10 phut)

- Firebase Console -> Authentication: bat **Email/Password**, tat **Google**.
- Admin da tao it nhat 1 tai khoan (xem `docs/FIREBASE_DEPLOY.md` muc Auth); Firestore `users/{uid}` dung document ID = Auth UID.
- Mo `/admin/reports`: theo [ANALYTICS_REPORTS.md](./ANALYTICS_REPORTS.md#smoke-test-admin).
- Mo `/login`: khong co nut Google; co mo ta *Zalo Content Guidelines* va footer lien he cap tai khoan.
- Dang nhap bang **username + password** (khong phai email hien thi; khong co dang ky tu phuc vu).
- (Tuy chon) Cung user dang nhap tren 2 trinh duyet -> ca hai vao `/chat` duoc (da phiên la mac dinh; xem `docs/FIREBASE_DEPLOY.md` muc 3.2).
- Mo `/chat`, gui 1 cau hoi -> co stream response (NDJSON — Content-Type `application/x-ndjson`).
- Kiem tra `/api/chat` khong loi `Unauthorized` neu token hop le.
- Gui >20 message/phut voi 1 user -> phai nhan `429 Rate limit exceeded`.
- Upload tai lieu bang tai khoan contributor/admin; log App Hosting co `[Ingest] Wrote N chunks`.
- Kiem tra Firestore Console: collection `document_chunks` co documents voi field `embedding`.
- Mo trang admin bang user thuong -> bi chan dung (403/redirect).
- Kiem tra log App Hosting khong co loi env thieu.

## 9) Dau hieu cau hinh sai thuong gap

- Production van hien thi Google login / UI cu:
  - Chua rollout tu commit moi tren live branch (chi deploy rules khong doi Next.js UI).
- Dang nhap dung mat khau nhung bao *chua duoc cap quyen*:
  - Thieu `users/{auth.uid}` hoac sai document ID trong Firestore.
- Loi thieu Firebase client env:
  - `[Firebase] Missing required env vars: ...`
- Loi Admin SDK:
  - `[FirebaseAdmin] Could not initialize...`
  - `Invalid or expired token` do verify token that bai
- Loi Gemini:
  - `Gemini API Error` / parse failure trong `/api/ingest`

## 9) Nguon tham chieu trong repo

- `docs/FIREBASE_DEPLOY.md`
- `docs/HUONG_DAN_LEN_LIVE.md`
- `firebase.json`
- `apphosting.yaml`