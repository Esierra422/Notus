# Notus

A team collaboration platform designed to simplify communication and productivity. Video and voice calls, real-time transcripts, AI assistant, text channels, collaborative notebook, and calendar, all in one place.

**Tech stack:** FERN (Firebase, Express, React, Node.js)

## Project Structure

```
Notus/
├── frontend/        # React frontend (Vite)
│   └── src/
│       ├── components/   # UI & landing sections
│       ├── pages/        # LandingPage, etc.
│       ├── lib/          # Firebase, API helpers
│       └── styles/       # Global CSS, variables
├── backend/         # Express backend (Node.js)
│   └── src/
│       ├── config/       # Env & app config
│       ├── routes/       # API endpoints
│       └── middleware/   # Auth, error handling
├── Documentation/   # Project docs
│   ├── ARCHITECTURE.md  # Auth, Firestore, user rules
│   └── STRUCTURE.md     # File map & where to add code
└── README.md
```

- **Documentation/STRUCTURE.md:** file map and where to add new code
- **Documentation/ARCHITECTURE.md:** non-negotiable rules (Auth, Firestore, users). Read before building auth.

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

Or manually:

```bash
npm install
cd frontend && npm install
cd ../backend && npm install
```

### 2. Environment variables

**Frontend** – Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Add your Firebase config from [Firebase Console](https://console.firebase.google.com) → Project Settings → General.

**Backend** – Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Add Firebase Admin SDK credentials (Project Settings → Service Accounts → Generate new private key).

### 3. Run development servers

From the project root:

```bash
npm run dev
```

This starts:

- **Frontend:** http://localhost:5173  
- **Backend:** http://localhost:3001  

Or run separately:

```bash
npm run dev:frontend   # Frontend only
npm run dev:backend    # Backend only
```

## API Proxy

The Vite dev server proxies `/api` requests to `http://localhost:3001`. Use `/api/...` in the frontend for backend calls.

- **Calendar ICS import from URL** – The backend provides `/api/calendar/fetch-ics?url=...` to proxy external ICS URLs and avoid CORS. Ensure the backend is running when importing calendars from URLs (e.g. Canvas, Google Calendar).
- **Video Call** – Uses [Agora](https://console.agora.io). **Local:** add `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` to `backend/.env`. **Production (free, no Firebase Blaze):** deploy the backend to [Render](https://render.com) (free tier) using the repo’s `render.yaml`, set `CLIENT_URL` and Agora env vars on the service, then set `VITE_API_URL` in `frontend/.env.production` to your Render backend URL and run `npm run deploy`. See **Production video (free)** below.
- **Push notifications** – Uses Firebase Cloud Messaging (FCM). In Firebase Console: **Project Settings → Cloud Messaging → Web Push certificates** → generate a key pair. Add the **public** key to `frontend/.env` as `VITE_VAPID_KEY`. Users enable push in **Settings → Push notifications**. For sending notifications when new messages arrive, deploy Cloud Functions: `cd functions && npm install && cd .. && firebase deploy --only functions` (requires Blaze plan). The service worker config is injected into `public/firebase-messaging-sw.js` at build time from your Firebase env vars.

## SEO and Marketing Basics

- Default SEO meta tags, Open Graph, and Twitter cards are configured in `frontend/index.html`.
- Public-page metadata is updated per route via `frontend/src/lib/seo.js`.
- Static crawler files:
  - `frontend/public/robots.txt`
  - `frontend/public/sitemap.xml`
  - `frontend/public/og-image.svg`

## Production video (free)

Video on the live site needs a backend on the internet. **→ See [VIDEO_SETUP.md](VIDEO_SETUP.md)** for a simple step-by-step guide (Render free tier, no Firebase Blaze).

## Troubleshooting

- **“Couldn’t reach the video server” on the live site** – The browser must be able to call your **Express API** over HTTPS. Follow **[VIDEO_SETUP.md](VIDEO_SETUP.md)** (Render free tier): deploy **notus-api** from `render.yaml`, set `CLIENT_URL` (include **every** frontend origin you use, e.g. `https://notusapp.com` and `https://www.notusapp.com`), set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`, set `frontend/.env.production` → `VITE_API_URL` to that Render URL, then run **`npm run deploy`**. Verify with `curl https://YOUR-RENDER-URL/api/health`. On Render’s free tier, the first request after idle can take ~30–60s while the service wakes.
- **Error 400: redirect_uri_mismatch (Google Sign-In)** – Add the correct redirect URIs in [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth 2.0 Client ID (Web application) → Authorized redirect URIs. The live app uses **https://notusapp.com** (Firebase’s `*.web.app` / `*.firebaseapp.com` URLs redirect there in `index.html`). Still list Firebase handler URLs if your project uses the default auth domain, e.g. `https://notusapp.com/__/auth/handler`, `https://notus-e026b.firebaseapp.com/__/auth/handler`, and `https://notus-e026b.web.app/__/auth/handler` as needed. Match what Firebase shows under Authentication → Settings → Authorized domains.
- **"Permission denied" when starting a chat** – Queries must match security rules. Deploy both rules and indexes: `firebase deploy --only firestore`
- **"The query requires an index"** – Deploy indexes: `firebase deploy --only firestore:indexes`
- **Profile picture not saving** – Profile pics are stored in Firestore (base64). Ensure Firestore rules allow users to write their own `profilePicture` field.
- **404 for deleted files / SettingsPage export error** – Stop the dev server, delete `frontend/node_modules/.vite`, then run `npm run dev` again

## QA and Release Hygiene

Playwright smoke tests are available in `frontend/tests/e2e`:

- `public-smoke.spec.js` (landing + public navigation)
- `app-smoke.spec.js` (auth + org/team/calendar/video route checks; requires env credentials)

Run locally:

```bash
cd frontend
npm run build
npm run test:e2e
```

Optional env vars for authenticated smoke tests:

- `E2E_EMAIL`
- `E2E_PASSWORD`
- `E2E_ORG_ID`
- `E2E_TEAM_ID`

CI workflow:

- `.github/workflows/frontend-ci.yml` runs lint, build, preview-based Playwright smoke tests, and uploads the Playwright report artifact.

## Team

Balabros · Ahmed, Emilio, Gavin, Timothy, David
