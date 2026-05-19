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
- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (khuyen nghi dung Secret Manager, xem muc 3)
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` (domain noi bo map username -> Firebase email, vi du `accounts.internal`)
- `INTERNAL_AUTH_EMAIL_DOMAIN` (cung gia tri, dung tren server/API)

## 2) Khuyen nghi cho production

- `NEXT_PUBLIC_SITE_URL` (canonical/OG URL)
- `NEXT_PUBLIC_GA_ID` (neu bat Google Analytics)

## 3) Khuyen nghi bao mat

- Khong luu secrets trong source code.
- Uu tien cau hinh `FIREBASE_SERVICE_ACCOUNT_KEY` qua App Hosting secret:
  - Tao secret: `firebase apphosting:secrets:set FIREBASE_SERVICE_ACCOUNT_KEY`
  - Gan secret vao backend env theo huong dan App Hosting.
- Dam bao service account co quyen toi thieu can thiet (Firestore/Auth/Storage theo luong app).

## 4) Bien toi uu token/chat (tuy chon, nen dat ro)

- `RETRIEVAL_MAX_SNIPPETS` (goi y: `8`-`10` neu can tong hop nhieu nguon)
- `RETRIEVAL_MAX_CHARS_PER_SNIPPET` (goi y: `2500`-`4000`)
- `RETRIEVAL_FIRESTORE_FETCH_LIMIT` (goi y: `80`-`150`)
- `CHAT_CONVERSATION_MAX_CHARS_PER_TURN` (goi y: `1500`-`3000`)
- `CHAT_QUERY_MAX_CHARS` (goi y: `6000`-`12000`)

> Neu chua dat cac bien tren, app van chay bang gia tri mac dinh trong code.

## 5) Availability cho NEXT_PUBLIC_* (quan trong)

Voi `NEXT_PUBLIC`_*, dam bao bien co hieu luc trong giai doan **BUILD**.
Neu chi doi env ma khong rollout lai, frontend co the van dung gia tri cu.

## 6) Quy trinh cap nhat env dung

1. Cap nhat env trong Firebase App Hosting backend.
2. Rollout lai de build/runtime nhan gia tri moi:
  - Push commit moi vao live branch, hoac
  - Chay `firebase deploy --only apphosting`.
3. Kiem tra rollout thanh cong trong Firebase Console -> App Hosting -> Rollouts.

## 7) Smoke test sau rollout (5-10 phut)

- Firebase Console -> Authentication: bat **Email/Password**, tat **Google**.
- Admin da tao it nhat 1 tai khoan (xem `docs/FIREBASE_DEPLOY.md` muc Auth).
- Mo `/login`, dang nhap bang **username + password** (khong co dang ky tu phuc vu).
- Mo `/chat`, gui 1 cau hoi -> co stream response.
- Kiem tra `/api/chat` khong loi `Unauthorized` neu token hop le.
- Upload tai lieu bang tai khoan contributor/admin (neu dung ingest).
- Mo trang admin bang user thuong -> bi chan dung (403/redirect).
- Kiem tra log App Hosting khong co loi env thieu.

## 8) Dau hieu cau hinh sai thuong gap

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