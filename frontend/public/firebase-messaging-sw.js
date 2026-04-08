/**
 * Firebase Cloud Messaging — background handler (service worker).
 * Must live at origin root: /firebase-messaging-sw.js
 *
 * Setup: Replace firebaseConfig below with your project config from
 * Firebase Console → Project Settings → General → Your apps → Config.
 * Generate Web Push key pair in Project Settings → Cloud Messaging → Web Push certificates.
 */
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js')

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Notus'
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: payload.notification?.icon || payload.data?.icon || '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.data?.tag || 'notus',
    data: payload.data || {},
    requireInteraction: false,
  }
  return self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const path = data.url || data.link || '/app'
  const fullUrl = path.startsWith('http') ? path : self.location.origin + path
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.startsWith(self.location.origin))
      if (existing && 'focus' in existing) {
        if (existing.navigate) existing.navigate(fullUrl)
        return existing.focus()
      }
      return clients.openWindow(fullUrl)
    })
  )
})
