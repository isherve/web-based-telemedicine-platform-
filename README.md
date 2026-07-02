# Gara — Offline Telemedicine Platform

Gara (from the Kinyarwanda *amagara* — life & health) is a web-based telemedicine
platform for independent, single-doctor private practices in Rwanda. Patients
submit a structured triage, book an appointment, pay via MTN Mobile Money
(manual verification), chat in real time with the doctor, and receive PDF
prescriptions/transfer slips. Bilingual: **English + Kinyarwanda**.

> **This build runs fully offline / locally — no Supabase, no cloud account.**
> The cloud stack (Supabase Postgres/Auth/Storage/Realtime + Groq + Gmail) has
> been replaced by a small local Node/Express + SQLite backend, Socket.IO for
> realtime, the local filesystem for storage, and offline stubs for AI/email
> (with seams to plug the real services back in when online).

## Architecture

Four-layer clean architecture is preserved on the frontend, with a mirrored
service layer on the backend:

```
src/                     # React frontend (Vite + TS + Tailwind)
  presentation/          # pages, components — no direct API calls
  state/                 # React Context providers — call services only
  services/              # business logic — call the API client only
  data/                  # types + the API client singleton (only HTTP caller)
  i18n/                  # en.json / rw.json

server/                  # Local backend (Express + SQLite + Socket.IO)
  src/db/                # schema.sql + SQLite client singleton
  src/services/          # AuthService, EmailService, ... (all access control here)
  src/routes/            # Express routers
  src/middleware/        # session auth (replaces Supabase RLS)
  src/realtime/          # Socket.IO (replaces Supabase Realtime)
  data/                  # gara.db (created at runtime, git-ignored)
  uploads/               # photos / voice / PDFs (git-ignored)
```

### Why local server instead of browser-only storage?
A doctor and a patient use different devices, so they need **one shared
database** to chat, pay, and exchange documents. A browser-only store (IndexedDB)
would isolate each device and break that. This local server needs **no internet
and no cloud signup** — everything runs on your machine/LAN.

### Access control (no RLS)
The original relied on Supabase with permissive RLS and enforced access control
in the service layer scoped to the session user id. SQLite has no RLS, so **all**
access control lives in the backend service/middleware layer, scoped to the
session user id — intentional, not an oversight.

## Getting started

```bash
# 1. Install frontend + backend deps
npm run setup

# 2. Create env files from the examples
cp .env.example .env
cp server/.env.example server/.env   # (Windows: copy)

# 3. Run backend + frontend together
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api
- Health check: http://localhost:4000/api/health

The SQLite database is created automatically at `server/data/gara.db` on first run.
Demo data (patients, consultations, pharmacy stock, notifications) is seeded on first
backend start.

### Environment (optional online features)
Copy `server/.env.example` → `server/.env` and set:
- `GROQ_API_KEY` — enables live AI (triage, chatbots, doctor suggestions)
- `GMAIL_SMTP_USER` / `GMAIL_SMTP_PASS` — enables email OTP for password reset

### Demo accounts

| Role | Login | Password |
|------|-------|----------|
| Doctor | `doctor@gara.rw` | `docpass123` |
| Finance | `fin@gara.rw` | `secret123` |
| Pharmacy | `pharma@gara.rw` | `secret123` |
| Patient | `+250788333444` | `Patient@123` |
| Patient | `+250788555666` | `Patient@123` |
| Patient | `+250788111222` | `pass123` |

Staff registration tokens (in `server/.env`): `gara-doctor-2026`, `gara-finance-2026`, `gara-pharmacy-2026`.

### Doctor registration token
Doctor sign-up requires the one-time token in `server/.env`
(`DOCTOR_REGISTRATION_TOKEN`, default `gara-doctor-2026`).

### Password reset (offline)
Without Gmail SMTP configured, the OTP is shown on screen and logged to the
server console so you can test reset flows offline.

## Testing

```bash
npm test                 # frontend (Vitest)
npm --prefix server test # backend service tests (hashing, doctor gate, login)
```

## Build status (phased, mirrors the original)

- [x] **Phase 1** — Foundation: schema, AuthService, login/register/reset UI, EN/RW
- [x] **Phase 2** — Triage wizard + consultation lifecycle + localStorage draft
- [x] **Phase 3** — AI brief (offline template + Groq seam)
- [x] **Phase 4** — Payment flow (MoMo instructions + doctor verification)
- [x] **Phase 5** — Realtime chat (text/photo/voice) via Socket.IO
- [x] **Phase 6** — PDF documents (prescription + transfer) + local uploads
- [x] **Phase 7** — Password reset (offline OTP)
- [x] **Phase 8** — Follow-ups (doctor → patient → reply)
- [x] **Phase 9** — Appointments + weekly schedule editor
- [x] **Phase 10** — EN/RW strings across all screens

## Security baseline
- Passwords: SHA-256 + unique 16-byte random salt per user.
- Session tokens: UUID v4, kept in memory + `sessionStorage` (never plain
  `localStorage`).
- Doctor registration gated by a one-time token.
