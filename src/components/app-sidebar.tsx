'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery } from '@tanstack/react-query'

interface ApprovalData { pending?: unknown[] }
interface TaskData { tasks?: unknown[] }
type NotifData = unknown[]

export function AppSidebar() {
  const { activeView, setActiveView, sidebarOpen, setSidebarOpen } = useWorkflowStore()

  const { data: approvalData } = useQuery<ApprovalData>({
    queryKey: ['approvals-count'],
    queryFn: () => fetch('/api/approvals?userId=user-admin').then(r => r.json()),
  })

  const { data: taskData } = useQuery<TaskData>({
    queryKey: ['tasks-count'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()),
  })

  const { data: notifData } = useQuery<NotifData>({
    queryKey: ['notif-count-sidebar'],
    queryFn: () => fetch('/api/notifications?userId=user-admin').then(r => r.json()),
  })

  const approvalCount = Array.isArray(approvalData?.pending) ? approvalData!.pending.length : 0
  const taskCount = Array.isArray(taskData?.tasks) ? taskData!.tasks.length : Array.isArray(taskData) ? taskData.length : 0
  const unreadNotifs = Array.isArray(notifData) ? notifData.filter((n: any) => !n.isRead).length : 0

  const nav = (view: string) => {
    setActiveView(view as any)
    setSidebarOpen(false)
  }

  const navItems = [
    {
      section: 'Main',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          view: 'dashboard',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
          badge: null,
        },
        {
          id: 'employees',
          label: 'Employees',
          view: 'employees',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
          badge: null,
        },
        {
          id: 'departments',
          label: 'Departments',
          view: 'departments',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M13 17h8M17 13v8"/></svg>,
          badge: null,
        },
        {
          id: 'projects',
          label: 'Projects',
          view: 'projects',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
          badge: null,
        },
        {
          id: 'categories',
          label: 'Categories',
          view: 'categories',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
          badge: null,
        },
        {
          id: 'approvals',
          label: 'Approvals',
          view: 'approvals',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
          badge: approvalCount > 0 ? <span className="nb nb-alert">{approvalCount}</span> : null,
        },
      ],
    },
    {
      section: 'Review & Reports',
      items: [
        {
          id: 'scorecards',
          label: 'Scorecards',
          view: 'scorecards',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9zm12 0h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9zm-9 6l3 3 3-3"/><circle cx="12" cy="12" r="10"/></svg>,
          badge: <span className="nb" style={{ background: 'var(--gb)', color: 'var(--g2)' }}>Score</span>,
        },
        {
          id: 'reports',
          label: 'Reports',
          view: 'reports',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
          badge: null,
        },
        {
          id: 'analytics',
          label: 'Analytics',
          view: 'analytics',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
          badge: <span className="nb nb-warn">Live</span>,
        },
      ],
    },
    {
      section: 'Schedule',
      items: [
        {
          id: 'workflows',
          label: 'Monday Meeting',
          view: 'workflows',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
          badge: <span className="nb" style={{ background: 'var(--gb)', color: 'var(--g2)' }}>Score</span>,
        },
      ],
    },
    {
      section: 'Task Management',
      items: [
        {
          id: 'tasks',
          label: 'All Tasks',
          view: 'tasks',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
          badge: taskCount > 0 ? <span className="nb nb-live">{taskCount}</span> : null,
        },
        {
          id: 'cancelled',
          label: 'Cancelled',
          view: 'cancelled',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
          badge: null,
        },
      ],
    },
    {
      section: 'Intelligence',
      items: [
        {
          id: 'performance',
          label: 'Performance',
          view: 'performance',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>,
          badge: null,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          view: 'notifications',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
          badge: unreadNotifs > 0 ? <span className="nb nb-new">{unreadNotifs}</span> : null,
        },
        {
          id: 'director-dependency',
          label: 'Director Dependency',
          view: 'director-dependency',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#6D28D9' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
          badge: null,
          special: true,
        },
      ],
    },
    {
      section: 'Admin',
      items: [
        {
          id: 'team',
          label: 'Team Members',
          view: 'team',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
          badge: null,
        },
        {
          id: 'leaves',
          label: 'Leave Mgmt',
          view: 'leaves',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
          badge: <span className="nb nb-warn">EA</span>,
        },
        {
          id: 'settings',
          label: 'Settings',
          view: 'settings',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
          badge: null,
        },
        {
          id: 'executive',
          label: 'Executive Dashboard',
          view: 'executive',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
          badge: <span className="nb nb-new">CEO</span>,
        },
      ],
    },
  ]

  return (
    <>
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 399 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* LAXREE Brand */}
        <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: 4 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', color: '#fff', textAlign: 'center' }}>
            LAXREE
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', textAlign: 'center', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>
            Organization
          </div>
        </div>

        {navItems.map((section) => (
          <div className="sb-section" key={section.section}>
            <div className="sb-label">{section.section}</div>
            {section.items.map((item) => {
              const isActive = activeView === item.view
              return (
                <div
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => nav(item.view)}
                  style={item.special ? {
                    background: isActive ? 'var(--gb)' : 'linear-gradient(90deg,rgba(109,40,217,.09),transparent)',
                    borderLeftColor: isActive ? 'var(--g2)' : 'rgba(109,40,217,.5)',
                  } : undefined}
                >
                  {item.icon}
                  <span style={item.special ? { color: '#6D28D9', fontWeight: 700 } : undefined}>
                    {item.label}
                  </span>
                  {item.badge}
                </div>
              )
            })}
          </div>
        ))}
        <div className="sb-footer">
          <button className="logout-btn">⏏ Sign Out</button>
        </div>
      </aside>
    </>
  )
}
