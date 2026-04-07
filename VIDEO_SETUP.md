# How to get video calls working on your live website

**The problem:**  
Video works on your computer (localhost) because your backend runs there. On the real site (e.g. notusapp.com), there is no backend - so "Join call" has nowhere to get a token and it fails.

**The fix:**  
Put your backend on the internet for free using Render, then tell your frontend to use that URL. After that, the live site can get tokens and video will work.

---

## What you need before starting

1. Your Notus code on **GitHub** (push this repo if it isn’t already).
2. An **Agora** account. If you don’t have one: go to [console.agora.io](https://console.agora.io), sign up, create a project, and copy the **App ID** and **App Certificate**.

---

## Step 1: Create a free account on Render

1. Go to [render.com](https://render.com).
2. Sign up (e.g. with GitHub).
3. You do **not** need to pay; the free tier is enough.

---

## Step 2: Deploy your backend from GitHub

1. In Render, click **New** → **Blueprint**.
2. Connect your **GitHub** account if asked.
3. Choose the **Notus** repo (the one that has the `render.yaml` file).
4. Render will see `render.yaml` and create a service named **notus-api**. Click **Apply** (or **Create**).
5. Wait for the first deploy to finish (a few minutes). When it’s done, you’ll see a URL like:  
   `https://notus-api.onrender.com`  
   **Copy that URL**  -  you’ll need it in Step 4.

---

## Step 3: Add your keys in Render

1. In Render, open your **notus-api** service.
2. Go to the **Environment** tab (or **Environment Variables**).
3. Add these three variables (use **Add variable** for each):

   | Name                 | Value |
   |----------------------|--------|
   | `CLIENT_URL`         | Comma-separated **exact** origins your users use (scheme + host, no path). Example: `https://notusapp.com,https://www.notusapp.com,https://notus-e026b.web.app` |
   | `AGORA_APP_ID`       | (paste your Agora App ID) |
   | `AGORA_APP_CERTIFICATE` | (paste your Agora App Certificate) |

4. Save. Render will redeploy with the new values.

If the browser shows **“Couldn’t reach the video server”**, it is usually **CORS**: the page’s origin (e.g. `https://www.notusapp.com`) must appear in `CLIENT_URL`. Add every hostname you use (with and without `www`).

### Quick check (after deploy)

Replace the URL with your **notus-api** service URL from the Render dashboard:

```bash
curl -sS "https://YOUR-SERVICE.onrender.com/api/health"
```

You should see JSON like `{"status":"ok",...}`. If that fails, the service is not up or the URL is wrong - update `VITE_API_URL` to match the URL Render shows (it may not be exactly `notus-api.onrender.com`).

---

## Step 4: Tell your frontend where the backend is

1. On your computer, open the Notus project.
2. In the **frontend** folder, create a file named **`.env.production`** (if it doesn’t exist).
3. Put this line in it (copy the **exact** **notus-api** URL from Render → your service → URL; no trailing slash):

   ```
   VITE_API_URL=https://notus-api.onrender.com
   ```

   Example: if your URL is `https://notus-api-xyz.onrender.com`, the line is:

   ```
   VITE_API_URL=https://notus-api-xyz.onrender.com
   ```

   The value is **baked in at build time**. After you change it, you must run **`npm run deploy`** again from the project root so Firebase Hosting serves a new bundle.

4. Save the file.

---

## Step 5: Deploy the frontend again

1. In the Notus project root (where `package.json` is), run in the terminal:

   ```bash
   npm run deploy
   ```

2. Wait for it to finish. That rebuilds the frontend with the backend URL and deploys it to Firebase.

---

## Done

Open your live site (e.g. notusapp.com), go to the video call page, and click **Join call**. It should work.

**Note:** On Render’s free tier, the backend may “sleep” after 15 minutes of no use. The first person who tries video after that might wait 30–60 seconds for it to wake up; after that it’s fast again.

---

## Quick checklist

- [ ] Repo is on GitHub  
- [ ] Agora App ID and Certificate from console.agora.io  
- [ ] Render account, Blueprint deploy from repo, notus-api service has a URL  
- [ ] In Render: `CLIENT_URL`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` set  
- [ ] In project: `frontend/.env.production` has `VITE_API_URL=https://your-render-url`  
- [ ] Ran `npm run deploy` from project root  

If something doesn’t work, say which step you’re on and what you see (e.g. error message or URL).
