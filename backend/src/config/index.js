import dotenv from 'dotenv'

dotenv.config()

const clientUrlRaw = process.env.CLIENT_URL || 'http://localhost:5173'
const clientOrigins = clientUrlRaw.split(',').map((s) => s.trim()).filter(Boolean)

export const config = {
  port: process.env.PORT || 3001,
  clientUrl: clientUrlRaw,
  /** List of allowed CORS origins (comma-separated CLIENT_URL). */
  clientOrigins: clientOrigins.length > 0 ? clientOrigins : ['http://localhost:5173'],
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
  },
  agora: {
    appId: process.env.AGORA_APP_ID,
    appCertificate: process.env.AGORA_APP_CERTIFICATE,
  },
}
