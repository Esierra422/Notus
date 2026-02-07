# Notus

A team collaboration platform designed to simplify communication and productivity. Video and voice calls, real-time transcripts, AI assistant, text channels, collaborative notebook, and calendar—all in one place.

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

- **Documentation/STRUCTURE.md** — File map and where to add new code
- **Documentation/ARCHITECTURE.md** — Non-negotiable rules (Auth, Firestore, users). Read before building auth.

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
- **Video Call** – Uses [Agora](https://console.agora.io). Add `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` to `backend/.env`.

## Troubleshooting

- **"Permission denied" when starting a chat** – Queries must match security rules. Deploy both rules and indexes: `firebase deploy --only firestore`
- **"The query requires an index"** – Deploy indexes: `firebase deploy --only firestore:indexes`
- **Profile picture not saving** – Profile pics are stored in Firestore (base64). Ensure Firestore rules allow users to write their own `profilePicture` field.
- **404 for deleted files / SettingsPage export error** – Stop the dev server, delete `frontend/node_modules/.vite`, then run `npm run dev` again

## Team

Balabros · Ahmed, Emilio, Gavin, Timothy, David
