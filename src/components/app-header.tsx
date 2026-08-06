'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

interface User {
  id: string
  name: string
  email: string
  role: string
  department: string | null
}

interface NotificationItem {
  id: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  type: string
}

export function AppHeader() {
  const { currentUserId, setCurrentUserId, setCurrentUserName, setCurrentRole, toggleSidebar, darkMode, toggleDarkMode, notifPanelOpen, toggleNotifPanel, setActiveView } = useWorkflowStore()
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  const { data: notifData } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', currentUserId],
    queryFn: () => fetch(`/api/notifications?userId=${currentUserId}`).then(r => r.json()),
    refetchInterval: 30000,
  })

  const currentUser = users.find(u => u.id === currentUserId)
  const notifications = Array.isArray(notifData) ? notifData : []
  const unreadCount = notifications.filter(n => !n.isRead).length

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  useEffect(() => {
    if (currentUser) {
      setCurrentUserName(currentUser.name)
      setCurrentRole((currentUser.role as any) || 'EMPLOYEE')
    }
  }, [currentUser, setCurrentUserName, setCurrentRole])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleUserSelect = (user: User) => {
    setCurrentUserId(user.id)
    setCurrentUserName(user.name)
    setCurrentRole((user.role as any) || 'EMPLOYEE')
    setUserDropdownOpen(false)
  }

  const roleColors: Record<string, string> = {
    ADMIN: 'var(--g2)',
    DIRECTOR: 'var(--purple)',
    EA: 'var(--blue)',
    MANAGER: 'var(--green)',
    EMPLOYEE: 'var(--t3)',
  }

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="tb-brand">
        <button
          onClick={toggleSidebar}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.7)', marginRight: 6, display: 'none' }}
          className="sidebar-toggle-btn"
          title="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="tb-brand-name">LAXREE</span>
      </div>

      {/* Search */}
      <div className="tb-center">
        <div className="tb-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#94a3b8' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search tasks, people, modules…" readOnly style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {/* Right */}
      <div className="tb-right">
        {/* Notification bell */}
        <div className="tb-icon-btn" onClick={toggleNotifPanel} title="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && <span className="tb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </div>

        {/* Dark toggle */}
        <button
          className={`dark-toggle ${darkMode ? 'on' : ''}`}
          onClick={toggleDarkMode}
          title="Toggle dark mode"
        />

        {/* User label */}
        <div
          style={{
            fontSize: '11.5px', fontWeight: 700, color: roleColors[currentUser?.role || 'EMPLOYEE'] || 'var(--g2)',
            padding: '6px 12px', background: 'var(--g5)',
            border: '1px solid var(--gbr)', borderRadius: 20,
            cursor: 'pointer', position: 'relative',
          }}
          onClick={() => setUserDropdownOpen(!userDropdownOpen)}
          ref={dropdownRef}
        >
          {currentUser?.name || 'Select User'}
          <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>({currentUser?.role || '—'})</span>
          {userDropdownOpen && users.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8,
              background: 'var(--card)', border: '1px solid var(--b2)',
              borderRadius: 'var(--r)', boxShadow: 'var(--s3)',
              minWidth: 260, maxHeight: 360, overflowY: 'auto', zIndex: 700,
            }}>
              {users.map(user => (
                <div
                  key={user.id}
                  onClick={(e) => { e.stopPropagation(); handleUserSelect(user) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid var(--b1)',
                    background: user.id === currentUserId ? 'var(--g5)' : 'transparent',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = user.id === currentUserId ? 'var(--g5)' : 'transparent' }}
                >
                  <div className="ua" style={{ width: 28, height: 28, fontSize: 10 }}>
                    {getInitials(user.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{user.role} · {user.department || '—'}</div>
                  </div>
                  {user.id === currentUserId && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="ua">
          {currentUser ? getInitials(currentUser.name) : '??'}
        </div>
      </div>

      {/* Notification Panel */}
      <div className={`np ${notifPanelOpen ? 'show' : ''}`}>
        <div className="np-hdr">
          <span>🔔 Notifications</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <span
              style={{ fontSize: 11, color: 'var(--g2)', cursor: 'pointer', fontWeight: 700 }}
              onClick={async () => {
                const unread = notifications.filter(n => !n.isRead)
                for (const n of unread.slice(0, 10)) {
                  await fetch('/api/notifications', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notificationId: n.id }),
                  })
                }
              }}
            >
              All read
            </span>
            <span
              style={{ fontSize: 11, color: 'var(--t3)', cursor: 'pointer' }}
              onClick={() => { setActiveView('notifications'); toggleNotifPanel() }}
            >
              View all
            </span>
          </div>
        </div>
        {notifications.length > 0 ? (
          notifications.slice(0, 8).map(n => (
            <div key={n.id} className={`np-item ${!n.isRead ? 'unread' : ''}`}>
              <div className="np-title">{n.title}</div>
              <div className="np-time">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))
        ) : (
          <div className="np-empty">🎉 All caught up!</div>
        )}
      </div>
    </header>
  )
}
