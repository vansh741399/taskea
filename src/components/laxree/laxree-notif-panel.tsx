'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export function LaxreeNotifPanel() {
  const { notifPanelOpen, toggleNotifPanel, currentUser, currentUserId } = useWorkflowStore()
  const queryClient = useQueryClient()

  const { data: notifData, refetch } = useQuery({
    queryKey: ['notifications-panel', currentUserId],
    queryFn: () => fetch(`/api/notifications?userId=${currentUserId}`).then(r => r.json()).catch(() => ({ notifications: [], unreadCount: 0 })),
    refetchInterval: 30000,
    enabled: notifPanelOpen && !!currentUserId,
  })

  const notifications = notifData?.notifications || []
  const unreadCount = notifData?.unreadCount || notifications.filter((n: any) => !n.isRead).length

  const markAllRead = async () => {
    await fetch(`/api/notifications?action=markAllRead&userId=${currentUserId}`, { method: 'PATCH' }).catch(() => {})
    refetch()
    queryClient.invalidateQueries({ queryKey: ['topbar-notifs'] })
  }

  const clearAll = async () => {
    await fetch(`/api/notifications?userId=${currentUserId}`, { method: 'DELETE' }).catch(() => {})
    refetch()
    queryClient.invalidateQueries({ queryKey: ['topbar-notifs'] })
  }

  const timeAgo = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime()
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000)
    if (dy > 0) return dy + 'd ago'; if (h > 0) return h + 'h ago'; if (m > 0) return m + 'm ago'; return 'Just now'
  }

  const typeIcon: Record<string, string> = {
    APPROVAL_REQUIRED: '📋',
    APPROVED: '✅',
    REJECTED: '❌',
    ESCALATION: '🚨',
    REMINDER: '⏰',
    DEADLINE_REMINDER: '⏰',
    STATUS_CHANGE: '🔄',
    COMMENT: '💬',
    DELEGATION: '👥',
    LEAVE_APPROVED: '🏖️',
    LEAVE_REJECTED: '🚫',
    LEAVE_APPLIED: '📝',
  }

  if (!notifPanelOpen) return null

  return (
    <div className="np show">
      <div className="np-hdr">
        <span>🔔 Notifications {unreadCount > 0 && <span style={{ background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10, marginLeft: 6 }}>{unreadCount}</span>}</span>
        <div className="flex">
          <span style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 700 }} onClick={markAllRead}>All read</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', cursor: 'pointer', marginLeft: 10 }} onClick={clearAll}>Clear</span>
        </div>
      </div>
      {notifications.length === 0 ? (
        <div className="np-empty">🎉 All caught up!</div>
      ) : notifications.slice(0, 25).map((n: any) => (
        <div key={n.id} className={`np-item${n.isRead ? '' : ' unread'}`}>
          <div style={{ fontSize: 16, marginRight: 8, flexShrink: 0 }}>{typeIcon[n.type] || '🔔'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="np-title">{n.title}</div>
            <div style={{ fontWeight: 400, color: 'var(--t2)', fontSize: '11.5px', marginTop: 2 }}>{n.message}</div>
          </div>
          <div className="np-time">{n.createdAt ? timeAgo(n.createdAt) : ''}</div>
        </div>
      ))}
    </div>
  )
}
