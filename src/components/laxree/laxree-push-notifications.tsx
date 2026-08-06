'use client'

// Build: 2026-06-19-v13 — Push notification helper for mobile/PWA install
//
// What this does:
//   1. Registers /sw.js as a service worker (enables PWA install + push).
//   2. Polls /api/notifications every 12s for the current user.
//   3. Tracks which notification IDs we've already shown.
//   4. For each NEW notification:
//        - If the browser window is hidden (user not looking), fire a system
//          browser Notification via the service worker (so it appears in the
//          OS notification tray — works on Android, Windows, macOS, etc.).
//        - If the window is visible, just increment the in-app toast counter
//          (handled by LaxreeTopbar's existing notification bell).
//   5. Shows a one-time "Enable Notifications" prompt so the user can grant
//      permission. We only ask once per session and only if permission is
//      'default' (not yet granted or denied).
//
// This satisfies the user's request: "when admin ea provide task it will pop
// in notification" — newly assigned tasks create a Notification row in the DB
// (see /api/tasks POST handler), this component picks it up within 12 seconds
// and fires a system notification.

import { useEffect, useState, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'

interface NotifItem {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  sender?: { id: string; name: string; role: string }
}

export function LaxreePushNotifications() {
  const { currentUserId, currentUserName, addToast, toggleNotifPanel } = useWorkflowStore()
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [swRegistered, setSwRegistered] = useState(false)
  const shownIdsRef = useRef<Set<string>>(new Set())
  const lastPollTimeRef = useRef<number>(Date.now())

  // ── 1. Register service worker on mount ─────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      setSwRegistered(true)
      console.log('[push] Service worker registered, scope:', reg.scope)
    }).catch((err) => {
      console.warn('[push] Service worker registration failed:', err)
    })
  }, [])

  // ── 2. Poll notifications for the current user ──────────────────────────
  useEffect(() => {
    if (!currentUserId) return
    // Initial fetch — seed shownIdsRef so we don't fire notifications for
    // old unread notifications the moment the user logs in.
    let isInitialFetch = true

    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?userId=${currentUserId}&unreadOnly=true`)
        if (!res.ok) return
        const data = await res.json()
        const notifs: NotifItem[] = Array.isArray(data?.notifications) ? data.notifications : []

        if (isInitialFetch) {
          // Seed — mark all current notifications as "already shown" so we
          // only fire for notifications that arrive AFTER the user logs in.
          notifs.forEach(n => shownIdsRef.current.add(n.id))
          isInitialFetch = false
          lastPollTimeRef.current = Date.now()
          return
        }

        // Find new notifications we haven't shown yet
        const newNotifs = notifs.filter(n => !shownIdsRef.current.has(n.id))
        if (newNotifs.length === 0) return

        // Mark them as shown
        newNotifs.forEach(n => shownIdsRef.current.add(n.id))

        // Fire notifications for each new item
        newNotifs.forEach((n) => {
          const isTaskAssignment = n.type === 'STATUS_CHANGE' && /task/i.test(n.title || '')
          const title = n.title || 'LAXREE ERP'
          const body = n.message || ''
          const tag = n.id

          // If window is hidden OR permission is granted (user wants push
          // notifications even when app is open), fire a system notification.
          const shouldFireSystem = permission === 'granted' &&
            (document.visibilityState !== 'visible' || isTaskAssignment)

          if (shouldFireSystem && swRegistered && 'serviceWorker' in navigator) {
            // Use the service worker to show notification (works on mobile)
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(title, {
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag,
                // @ts-expect-error — renotify is supported by browsers but not in TS lib defs
                renotify: true,
                data: { url: '/' },
                vibrate: [80, 40, 80],
              }).catch(() => {
                // Fallback: try direct Notification API
                try {
                  new Notification(title, { body, tag, icon: '/icon-192.png' })
                } catch { /* ignore */ }
              })
            }).catch(() => {
              try {
                new Notification(title, { body, tag, icon: '/icon-192.png' })
              } catch { /* ignore */ }
            })
          }

          // Always show an in-app toast too (for when the user is in the app)
          if (isTaskAssignment) {
            addToast('info', `🔔 ${title}: ${body}`)
          }
        })
      } catch (err) {
        // Silent fail — don't spam console
      }
    }

    // Initial fetch — delay slightly so it doesn't compete with login
    const initialTimer = setTimeout(poll, 2000)
    // Then poll every 12 seconds for new notifications
    const interval = setInterval(poll, 12000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [currentUserId, permission, swRegistered, addToast])

  // ── 3. Show "Enable Notifications" prompt (only if permission is default) ─
  // Don't show prompt if:
  //   - Notifications API not supported
  //   - Permission already granted or denied
  //   - User previously dismissed the prompt this session
  if (permission === 'unsupported' || permission === 'granted' || permission === 'denied' || promptDismissed) {
    return null
  }

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        addToast('ok', '🔔 Notifications enabled — you\'ll be alerted when tasks are assigned to you')
        // Fire a test notification
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready
            reg.showNotification('🔔 LAXREE Notifications Enabled', {
              body: `Hi ${currentUserName || 'there'} — you'll now receive push notifications when Admin/EA assigns you a task.`,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: 'laxree-enabled',
              data: { url: '/' },
            })
          } else {
            new Notification('🔔 LAXREE Notifications Enabled', {
              body: `Hi ${currentUserName || 'there'} — you'll now receive push notifications when Admin/EA assigns you a task.`,
            })
          }
        } catch { /* ignore */ }
      } else if (result === 'denied') {
        addToast('info', 'Notifications blocked — you can enable them later from browser settings')
      }
    } catch (err) {
      console.warn('[push] Permission request failed:', err)
    }
    setPromptDismissed(true)
  }

  const dismissPrompt = () => {
    setPromptDismissed(true)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9000,
      maxWidth: 340, padding: '14px 16px',
      background: 'var(--card, #fff)',
      border: '1px solid var(--b2, #e5e7eb)',
      borderRadius: 12,
      boxShadow: '0 10px 30px rgba(0,0,0,.15)',
      fontFamily: "'DM Sans', sans-serif",
      animation: 'slideUp .3s ease',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 22, flexShrink: 0 }}>🔔</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t1, #111)', marginBottom: 4 }}>
            Enable Push Notifications
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t3, #666)', lineHeight: 1.5, marginBottom: 10 }}>
            Get alerted on your phone/desktop when Admin or EA assigns you a task. Works even when the app is closed (after install).
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={requestPermission}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 800,
                background: 'linear-gradient(135deg, #8B6914, #D4AA50)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ✓ Enable
            </button>
            <button
              onClick={dismissPrompt}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                background: 'var(--bg2, #f3f4f6)', color: 'var(--t3, #666)',
                border: '1px solid var(--b1, #e5e7eb)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismissPrompt}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--t4, #999)', fontSize: 14, padding: 0, lineHeight: 1,
            flexShrink: 0,
          }}
          title="Dismiss"
        >✕</button>
      </div>
    </div>
  )
}
