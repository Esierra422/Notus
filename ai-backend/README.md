# AI backend (FastAPI)

Handles **transcription WebSocket** (Whisper) and future RAG/Chroma. Use this when you want the frontend to send audio to FastAPI instead of Express.

---

## Teammate / first-time setup (local dev)

Anyone cloning the repo can run the AI backend like this:

1. **Open a terminal in the repo**, then:
   ```bash
   cd ai-backend
   python -m venv .venv
   ```
2. **Activate the venv**
   - Windows (PowerShell): `.\.venv\Scripts\Activate.ps1`
   - Windows (cmd): `\.venv\Scripts\activate.bat`
   - macOS/Linux: `source .venv/bin/activate`
3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
4. **Configure env (do not commit `.env`)**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`: set `OPENAI_API_KEY`. Optionally `CORS_ORIGIN=http://localhost:5173` and `PORT=8000`.
   For AI-powered calendar features (creating meetings/tasks via the video call Ask panel), also set `FIREBASE_SERVICE_ACCOUNT_KEY` to your Firebase service account JSON as a single-line string. You can generate one from the Firebase Console under Project Settings > Service accounts > Generate new private key, then collapse the JSON to one line (e.g. `cat key.json | jq -c`). Without this key, transcription and RAG still work but calendar write features are disabled.
5. **Run the server**
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
6. **Frontend**: in `frontend/.env` set `VITE_AI_WS_URL=http://localhost:8000` and restart Vite so transcription uses this backend.

Teammates use the same steps; each person has their own `.venv` and `.env` (add `.env` to `.gitignore` if it isn’t already).

---

## Steps to connect WebSockets to FastAPI (reference)

### 1. Create and activate a virtualenv (recommended)

```bash
cd ai-backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and optionally CORS_ORIGIN, PORT
```

### 4. Run the AI backend

```bash
uvicorn main:app --reload --port 8000
```

(Or use `PORT` from `.env`.)

### 5. Point the frontend at the AI backend for transcription

In the **frontend** project, set in `.env`:

```env
VITE_AI_WS_URL=http://localhost:8000
```

Restart the Vite dev server so it picks up the new env. When a user joins a video call, the transcription WebSocket will connect to `ws://localhost:8000/ws/transcription` instead of the Express server.

### 6. Run both servers for local dev

- **Express** (auth, video tokens, etc.): from repo root, e.g. `cd backend && npm run dev` (or whatever runs it on port 3001).
- **FastAPI** (transcription): `cd ai-backend && uvicorn main:app --reload --port 8000`.
- **Frontend**: `cd frontend && npm run dev` (e.g. port 5173).

Ensure `CORS_ORIGIN` in `ai-backend/.env` includes your frontend origin (e.g. `http://localhost:5173`).

### 7. (Optional) Turn off transcription on Express

If you no longer want Express to handle transcription at all, you can remove or disable the WebSocket attachment in `backend/src/index.js` (the `WebSocketServer` and `handleTranscriptionConnection`). The frontend will only use the AI backend when `VITE_AI_WS_URL` is set.

## API

- **GET /health** – health check.
- **WS /ws/transcription** – same protocol as the Node version: first message JSON `{ type: 'meta', channel, uid }`, then binary raw Int16 PCM (16 kHz mono) chunks.

---

## Production: how to host this

**Locally you use a venv; in production you don’t.** Production runs the app in a single process (or container). The host installs dependencies from `requirements.txt` (or a built image) and runs `uvicorn`. No venv is required on the server.

### Option A: Docker (works anywhere)

Build and run the app in a container. Any host that runs Docker (your own VPS, Railway, Render, Fly.io, etc.) can use this.

```bash
# From repo root
cd ai-backend
docker build -t notus-ai-backend .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... -e CORS_ORIGIN=https://your-app.com notus-ai-backend
```

Set env vars via `-e`, a `.env` file, or your platform’s “Environment” / “Secrets” UI.

### Option B: PaaS (Railway, Render, Fly.io, etc.)

- Connect the repo (or the `ai-backend` folder) to the platform.
- Set **build command** to install deps (e.g. `pip install -r requirements.txt`) and **start command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Add **environment variables**: `OPENAI_API_KEY`, `CORS_ORIGIN` (your production frontend URL, e.g. `https://app.notus.com`). The platform usually sets `PORT`.
- Deploy. The service URL is your “AI backend” base URL.

### Option C: VPS (e.g. Ubuntu)

- On the server: clone repo, `cd ai-backend`, `pip install -r requirements.txt` (or use a venv if you prefer).
- Run with a process manager (e.g. systemd) or behind gunicorn/uvicorn. Example: `uvicorn main:app --host 0.0.0.0 --port 8000`.
- Put nginx (or Caddy) in front for HTTPS and optional reverse proxy to your Express app.

### Frontend in production

Point the frontend at the **deployed** AI backend URL:

```env
VITE_AI_WS_URL=https://your-ai-backend.example.com
```

Build the frontend (`npm run build`) so this value is baked in. The app will open the transcription WebSocket to that host.
