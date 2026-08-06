/* LAXREE ERP Service Worker
 * Provides:
 *   - App-shell caching for offline / mobile-install use
 *   - Push event handling so admins/EAs can fire notifications to employees
 *
 * Browser notifications are triggered from the client (see
 * laxree-push-notifications.tsx) when new task-assignment notifications are
 * polled from /api/notifications. The 'push' event handler here is a
 * fallback for when the page is closed (requires a real push subscription
 * with VAPID keys, which is not configured by default).
 */

const CACHE_NAME = 'laxree-v13-0619'
const APP_SHELL = [
  '/',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first for navigations, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Skip cross-origin and API calls
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => null)
        return res
      }).catch(() => caches.match(req).then(r => r || caches.match('/')))
    )
    return
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone()
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => null)
      return res
    }).catch(() => cached))
  )
})

// Push event — show notification (used when server pushes via Web Push API)
self.addEventListener('push', (event) => {
  let data = { title: 'LAXREE ERP', body: 'You have a new update' }
  try {
    if (event.data) data = event.data.json()
  } catch {
    data = { title: 'LAXREE ERP', body: event.data ? event.data.text() : 'New update' }
  }
  const options = {
    body: data.body || data.message || 'You have a new update',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || data.id || 'laxree-notif',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(data.title || 'LAXREE ERP', options))
})

// Click handler — focus existing window or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.postMessage({ type: 'NOTIF_CLICK', url: targetUrl })
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})

// Message handler — allow page to trigger notifications when SW is registered
// (this is what we use for task-assignment notifications since we don't have
//  VAPID keys configured)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url } = event.data
    self.registration.showNotification(title || 'LAXREE ERP', {
      body: body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'laxree-notif',
      renotify: true,
      data: { url: url || '/' },
      vibrate: [80, 40, 80],
    }).catch(() => null)
  }
})
