'use client'

import { useEffect, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery } from '@tanstack/react-query'

export function LaxreeTopbar() {
  const { currentUser, isDark, toggleDark, toggleNotifPanel, notifPanelOpen, setCmdPaletteOpen, setSidebarOpen, sidebarOpen, setCreateTaskOpen, currentUserId, currentRole } = useWorkflowStore()
  const [time, setTime] = useState('')
  const { data: notifData } = useQuery({
    queryKey: ['topbar-notifs', currentUserId],
    queryFn: () => fetch(`/api/notifications?userId=${currentUserId}`).then(r => r.json()).catch(() => ({ notifications: [], unreadCount: 0 })),
    refetchInterval: 30000, // 30s — reasonable refresh, was 5s (too aggressive, caused slowdowns)
    enabled: !!currentUserId,
  })
  const unreadCount = notifData?.unreadCount || 0

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <header className="topbar">
      <div className="tb-brand">
        <button id="sidebarToggle" onClick={() => setSidebarOpen(!sidebarOpen)}
          className="sidebar-toggle-btn"
          title="Menu"
          aria-label="Toggle navigation"
          aria-expanded={sidebarOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div className="tb-brand-name" style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 19, fontWeight: 700,
            letterSpacing: 3, textTransform: 'uppercase',
          }}>LAXREE</div>
          {/* Build version indicator — confirms the user is seeing the latest deployment */}
          <span title="Build version" style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--t4)', letterSpacing: 0.5, opacity: 0.7 }}>v24·0625</span>
        </div>
      </div>
      <div className="tb-center">
        <div className="tb-search" onClick={() => setCmdPaletteOpen(true)} style={{ cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t4)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search tasks, people, modules… (⌘K)" readOnly style={{ cursor: 'pointer' }} />
        </div>
        <span style={{ fontSize: '11.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{time}</span>
      </div>
      <div className="tb-right">
        {/* ADMIN, EA, DIRECTOR, and FOUNDER can create direct tasks */}
        {(currentRole === 'ADMIN' || currentRole === 'EA' || currentRole === 'DIRECTOR' || currentRole === 'FOUNDER') && (
        <button
          onClick={() => setCreateTaskOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #8B6914, #D4AA50)',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '6px 14px', fontFamily: "'DM Sans', sans-serif",
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            transition: 'all .15s', boxShadow: '0 1px 3px rgba(139,105,20,.3)',
            whiteSpace: 'nowrap',
          }}
          title="Create New Task"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Task
        </button>
        )}
        <div className="tb-icon-btn" onClick={toggleNotifPanel} title="Notifications" style={{ position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -6,
              background: '#EF4444', color: '#fff',
              fontSize: 9, fontWeight: 800, minWidth: 16, height: 16,
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', fontFamily: "'DM Sans', sans-serif",
              animation: 'pulse 2s infinite',
            }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </div>
        <button className={`dark-toggle${isDark ? ' on' : ''}`} onClick={toggleDark} title="Toggle dark mode" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED'][
              (() => { let h = 0; const n = currentUser?.name || ''; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h); return Math.abs(h) })() % 8
            ],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: "'DM Sans', sans-serif",
          }}>
            {(currentUser?.name || '—').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <span style={{
            fontSize: '11.5px', fontWeight: 700, color: 'var(--g2)',
          }}>{currentUser?.name || '—'}</span>
        </div>
      </div>
    </header>
  )
}
