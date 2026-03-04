/**
 * Injects Firebase config into public/firebase-messaging-sw.js at build time
 * so the service worker has the correct project. Run before build (e.g. prebuild).
 * Requires frontend/.env with VITE_FIREBASE_*.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const envPath = join(root, '.env')
const env = { ...process.env }
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*VITE_(\w+)=(.*)$/)
    if (m) env[`VITE_${m[1]}`] = m[2].replace(/^["']|["']$/g, '').trim()
  })
}
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
}

const swPath = join(root, 'public', 'firebase-messaging-sw.js')
let content = readFileSync(swPath, 'utf8')
content = content.replace(
  /const firebaseConfig = \{[\s\S]*?\};/,
  `const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`
)
writeFileSync(swPath, content)
console.log('Injected Firebase config into firebase-messaging-sw.js')
