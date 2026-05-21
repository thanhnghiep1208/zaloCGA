# Release Process (App Hosting)

This project deploys production via **Firebase App Hosting**.

Vietnamese day-to-day guide: `[HUONG_DAN_LEN_LIVE.md](./HUONG_DAN_LEN_LIVE.md)`.

## 1) Pre-release checks (local)

Run before every release:

```bash
npm install
npm run build
```

Smoke test key flows locally:

- `/login`: username + password only (no Google); provisioning contact footer if applicable
- Sign in with a provisioned test user; sign-out if Firestore profile missing behaves as expected
- Open `/chat` then leave without sending -> no empty chat session created
- Send first message -> one `chatSessions` document is created
- Continue chat -> same session is updated
- Check admin pages (`/admin/*`) for role-based access behavior; `/admin/users` create/disable if auth changed

## 2) Release to production

### Preferred (Git-driven)

1. Open PR into `main`
2. Review and merge
3. App Hosting auto-builds and auto-rolls out from the connected branch

### Manual (hotfix)

Use when immediate deployment is required:

```bash
firebase deploy --only apphosting
```

## 3) Environment variables

Manage production vars in:

Firebase Console -> App Hosting -> Backend -> Environment variables

After changing env vars, trigger a new rollout (push commit or manual deploy).

Typical vars:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN` and `INTERNAL_AUTH_EMAIL_DOMAIN` (same value; username → Auth email mapping)
- `GEMINI_API_KEY` (chat + ingest PDF; default model `gemini-3.5-flash`)
- Optional: `GEMINI_CHAT_MODELS` (comma-separated fallback list for `/api/chat`)
- See `docs/PRE_LIVE_ENV_CHECKLIST.md` for the full pre-live list

## 4) Post-release validation

Right after rollout:

- Run `npm run validate:env` locally if env changed (auth domain pair)
- Open production `/login` (confirm no Google sign-in; username/password flow)
- Test `/chat`, `/chat/[id]`, and one admin page
- Admin `/admin/reports`: time-range filters and manual refresh
- Verify Firestore writes for chat history are correct
- Watch App Hosting logs for 5-10 minutes
- Check error monitoring (if enabled)

## 5) Rollback

If a release is unstable:

1. Firebase Console -> App Hosting -> Rollouts
2. Select the previous stable rollout
3. Roll back / re-release that version
4. Create a fix branch and ship a new rollout after validation

