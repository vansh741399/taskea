'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { formatDistanceToNow } from 'date-fns'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  readAt: string | null
  createdAt: string
  sender: { name: string } | null
  workflow: { id: string; title: string } | null
}

export function NotificationList() {
  const { currentUserId } = useWorkflowStore()
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications-list', currentUserId],
    queryFn: () => fetch(`/api/notifications?userId=${currentUserId}`).then(r => r.json()),
  })

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.isRead)
      for (const n of unread) {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: n.id }),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const getTypeColor = (type: string) => {
    const map: Record<string, string> = {
      APPROVAL_REQUIRED: 'var(--amber)',
      APPROVED: 'var(--green)',
      REJECTED: 'var(--red)',
      ESCALATION: 'var(--rose)',
      REMINDER: 'var(--blue)',
      STATUS_CHANGE: 'var(--g2)',
      COMMENT: 'var(--purple)',
      DELEGATION: 'var(--teal)',
    }
    return map[type] || 'var(--t3)'
  }

  const getTypeIcon = (type: string) => {
    const map: Record<string, string> = {
      APPROVAL_REQUIRED: '📋',
      APPROVED: '✅',
      REJECTED: '❌',
      ESCALATION: '🚨',
      REMINDER: '⏰',
      STATUS_CHANGE: '🔄',
      COMMENT: '💬',
      DELEGATION: ' delegation',
    }
    return map[type] || '📢'
  }

  const getBadgeClass = (type: string) => {
    const map: Record<string, string> = {
      APPROVAL_REQUIRED: 'b-amber',
      APPROVED: 'b-green',
      REJECTED: 'b-red',
      ESCALATION: 'b-rose',
      REMINDER: 'b-blue',
      STATUS_CHANGE: 'b-gold',
      COMMENT: 'b-purple',
      DELEGATION: 'b-teal',
    }
    return map[type] || 'b-gray'
  }

  // Group by date
  const grouped: Record<string, Notification[]> = {}
  notifications.forEach(n => {
    const date = new Date(n.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(n)
  })

  const unreadCount = notifications.filter(n => !n.isRead).length

  if (isLoading) {
    return (
      <div>
        <div className="ph"><div className="ph-left"><h2>Notifications</h2></div></div>
        <div className="lcard"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading notifications…</div></div>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>Notifications</h2>
          <p>{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}</p>
        </div>
        <div className="ph-right">
          {unreadCount > 0 && (
            <button className="btn btn-out btn-sm" onClick={() => markAllReadMutation.mutate()}>
              ✓ Mark all read
            </button>
          )}
        </div>
      </div>
      <div className="page-accent" />

      {notifications.length > 0 ? (
        Object.entries(grouped).map(([date, items]) => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
              letterSpacing: 1.5, color: 'var(--t4)', marginBottom: 8, padding: '0 4px',
            }}>
              {date}
            </div>
            <div className="lcard">
              {items.map(n => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--b1)',
                    borderLeft: !n.isRead ? '3px solid var(--g2)' : 'none',
                    background: !n.isRead ? 'var(--g5)' : 'transparent',
                    cursor: !n.isRead ? 'pointer' : 'default',
                    transition: 'background .1s',
                  }}
                  onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = !n.isRead ? 'var(--g5)' : 'transparent' }}
                >
                  <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{getTypeIcon(n.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)' }}>{n.title}</span>
                      <span className={`badge ${getBadgeClass(n.type)}`} style={{ fontSize: 9 }}>
                        {n.type.replace(/_/g, ' ')}
                      </span>
                      {!n.isRead && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: 'var(--g2)', flexShrink: 0,
                          animation: 'pulse 2s infinite',
                        }} />
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>{n.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
                      {n.sender && <span>From {n.sender.name} · </span>}
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="lcard">
          <div className="cb empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <h3>All caught up!</h3>
            <p>You have no notifications at this time.</p>
          </div>
        </div>
      )}
    </div>
  )
}
