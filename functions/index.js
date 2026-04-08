/**
 * FCM on new messages; callable Agora token (hosting/prod when Express token route isn’t used).
 * Deploy: `firebase deploy --only functions`. Needs Blaze + Agora env vars for video.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineString } from 'firebase-functions/params'
import { getMessaging } from 'firebase-admin/messaging'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { RtcTokenBuilder, RtcRole } = require('agora-token')

const agoraAppId = defineString('AGORA_APP_ID')
const agoraAppCertificate = defineString('AGORA_APP_CERTIFICATE')

initializeApp()
const db = getFirestore()

async function sendToToken(token, notification, data = {}) {
  if (!token) return
  const messaging = getMessaging()
  try {
    await messaging.send({
      token,
      notification: {
        title: notification.title,
        body: notification.body || '',
      },
      data: { ...data },
      webpush: {
        fcmOptions: { link: data.url || '/app' },
      },
    })
  } catch (err) {
    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
      // Stale token; could prune Firestore here
    }
    console.warn('FCM send failed', err.code, err.message)
  }
}

async function getFCMTokenForUser(uid) {
  const snap = await db.doc(`users/${uid}/fcmTokens/current`).get()
  return snap.exists ? snap.data()?.token : null
}

/** Firestore trigger: new chat message → FCM to other members */
export const onNewMessage = onDocumentCreated(
  {
    document: 'organizations/{orgId}/conversations/{convId}/messages/{messageId}',
    region: 'us-central1',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const msg = snap.data()
    const senderId = msg?.senderId
    const text = (msg?.text || '').slice(0, 100)
    const { orgId, convId } = event.params

    const convSnap = await db.doc(`organizations/${orgId}/conversations/${convId}`).get()
    if (!convSnap.exists) return
    const members = convSnap.data()?.members || []
    const recipientIds = members.filter((id) => id !== senderId)

    const convTitle = convSnap.data()?.title || 'New message'
    const title = convTitle.length > 30 ? `${convTitle.slice(0, 27)}…` : convTitle
    const body = text ? (text.length > 80 ? `${text.slice(0, 77)}…` : text) : 'New message'
    const url = `/app/org/${orgId}/chats/${convId}`

    for (const uid of recipientIds) {
      const token = await getFCMTokenForUser(uid)
      await sendToToken(token, { title, body }, { url, type: 'message', orgId, convId })
    }
  }
)

// Org/team invite push skipped (no uid until accept).

/**
 * Callable Agora RTC token. Auth required; config: AGORA_APP_ID, AGORA_APP_CERTIFICATE.
 */
export const getAgoraToken = onCall(
  { region: 'us-central1' },
  (request) => {
    const appId = agoraAppId.value()
    const appCertificate = agoraAppCertificate.value()
    if (!appId || !appCertificate) {
      throw new HttpsError('failed-precondition', 'Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE for the functions.')
    }
    const { channel, uid: uidParam } = request.data || {}
    if (!channel || typeof channel !== 'string' || channel.length < 1) {
      throw new HttpsError('invalid-argument', 'Missing or invalid channel')
    }
    const uid = typeof uidParam === 'number' && Number.isInteger(uidParam) ? uidParam : parseInt(uidParam, 10) || 0
    const expirationTimeInSeconds = 3600
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds
    const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channel, uid, RtcRole.PUBLISHER, privilegeExpiredTs)
    return { token, appId, uid }
  }
)
