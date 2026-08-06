'use client'

import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useEffect } from 'react'
import { LaxreeHealthScoreWidget } from './laxree-health-score-widget'

interface DashboardData {
  statusCounts: Record<string, number>
  totalWorkflows: number
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  overdueTasks: number
  todayTasks: number
  upcomingTasks: number
  pendingApprovals: number
  escalationCount: number
  completionRate: number
  performanceScore: number
  userPerformance: any[]
  deptMap: Record<string, { total: number; done: number; overdue: number; inProgress: number; pending: number }>
  catMap: Record<string, { total: number; done: number; inProgress: number }>
  recentActivities: any[]
  todayTasksList: any[]
  upcomingTasksList: any[]
  overdueTasksList: any[]
  pendingApprovalsList: any[]
  recentLeaves?: any[]
}

interface User {
  id: string; name: string; email: string; role: string; department: string | null
}

const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED', '#0D9488', '#B8860B']
function avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length] }

export function LaxreeDashboard({ assignedById, directorName, strictAssignedBy }: { assignedById?: string; directorName?: string; strictAssignedBy?: boolean } = {}) {
  const { currentUser, setActivePage, currentUserId, currentRole } = useWorkflowStore()

  // Determine welcome title based on role
  const welcomeTitle = currentRole === 'ADMIN' ? 'Owner' : currentRole === 'FOUNDER' ? 'Founder' : directorName || currentUser?.name || 'Admin'

  // Fetch pending leaves for EA alert banner
  const { data: eaLeavesData } = useQuery({
    queryKey: ['ea-dash-leaves'],
    queryFn: () => fetch('/api/leaves?status=PENDING').then(r => r.json()),
    refetchInterval: 30000, // 30s — was 5s (too aggressive, caused dashboard slowdowns)
  })
  const pendingLeaves = Array.isArray((eaLeavesData as any)?.leaves) ? (eaLeavesData as any).leaves : []
  const pendingLeaveCount = pendingLeaves.length

  const { data: dash, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', currentUserId, assignedById, strictAssignedBy ? 'strict' : 'legacy'],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}${assignedById ? `&assignedById=${assignedById}${strictAssignedBy ? '&strictAssignedBy=1' : ''}` : ''}`).then(r => r.json()),
    enabled: !!currentUserId,
  })

  // ─── NEW: Persistent task activity feed (CREATED / DELETED / REVISED / COMPLETED / CANCELLED)
  // This is INDEPENDENT of the dashboard's `recentActivities` (which only tracks workflow
  // status changes). We poll every 60s so the user sees new events almost immediately.
  const { data: taskActivityData } = useQuery<{ activities: any[]; count: number }>({
    queryKey: ['task-activity-feed'],
    queryFn: () => fetch('/api/task-activity?limit=20').then(r => r.json()),
    refetchInterval: 60000, // 60s — was 15s (too aggressive, caused slowdowns)
    refetchOnMount: 'always',
  })
  const taskActivities = Array.isArray(taskActivityData?.activities) ? taskActivityData.activities : []

  const { data: rawUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })
  const users = Array.isArray(rawUsers) ? rawUsers : []

  if (isLoading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
      <div style={{ color: 'var(--t3)', fontWeight: 600 }}>Loading dashboard data...</div>
    </div>
  )

  const total = dash?.totalTasks || 0
  const completed = dash?.completedTasks || 0
  const overdue = dash?.overdueTasks || 0
  // pendingApprovals removed — approval center has been removed
  const inProgress = dash?.inProgressTasks || 0
  const completionRate = dash?.completionRate || 0
  const effScore = Math.max(0, completionRate - Math.round(overdue / Math.max(total, 1) * 10))

  const userPerf = (Array.isArray(dash?.userPerformance) ? dash.userPerformance : [])
    // Filter out:
    //   • Inactive (unavailable) employees — isActive === false means user has left / is on extended leave
    //   • DIRECTOR / ADMIN / FOUNDER roles — they are management, not part of team performance scorecard.
    //     (Ashish Sir = Director, Samarth Sir = Admin, Founder Sir = Founder — all excluded.)
    //   • EA role is kept — they do operational work and have measurable task output.
    // Only EMPLOYEE, MANAGER, EA appear in the scorecard.
    .filter((u: any) =>
      u.isActive !== false &&
      u.role !== 'DIRECTOR' &&
      u.role !== 'ADMIN' &&
      u.role !== 'FOUNDER'
    )
  const todayTasks = Array.isArray(dash?.todayTasksList) ? dash.todayTasksList : []
  const upcomingTasks = Array.isArray(dash?.upcomingTasksList) ? dash.upcomingTasksList : []
  const overdueTasks = Array.isArray(dash?.overdueTasksList) ? dash.overdueTasksList : []

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
  const scoreColor = (s: number) => s >= 70 ? 'var(--green)' : s >= 40 ? 'var(--amber)' : 'var(--red)'

  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft', PENDING: 'Pending', IN_REVIEW: 'In Review', APPROVED: 'Approved',
    REJECTED: 'Rejected', IN_PROGRESS: 'In Progress', ON_HOLD: 'On Hold',
    ESCALATED: 'Escalated', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXTERNAL_HOLD: 'External Hold',
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Welcome back, <span style={{ color: 'var(--g2)' }}>{welcomeTitle}</span></h2>
          <p>Live operations overview · <span style={{ color: 'var(--g2)', fontWeight: 700 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </span></p>
        </div>
      </div>

      {/* Alert Banners */}
      {/* v25·0801: Health Score Widget — visible to DIRECTOR and EA only (Founder/Admin see admin views) */}
      {(currentRole === 'DIRECTOR' || currentRole === 'EA') && (
        <LaxreeHealthScoreWidget />
      )}

      {overdue > 0 && (
        <div className="alert alert-red">
          <div className="alert-icon">🚨</div>
          <div className="alert-body">
            <div className="alert-title" style={{ color: 'var(--red)' }}>Critical: Overdue Tasks</div>
            <div className="alert-sub">{overdue} task(s) are past due date — immediate attention needed</div>
          </div>
          <button className="btn btn-red btn-sm" onClick={() => setActivePage('tasks')}>View →</button>
        </div>
      )}

      {/* Pending Leave Applications Alert — shown for ADMIN/EA/FOUNDER, not DIRECTOR */}
      {pendingLeaveCount > 0 && currentRole !== 'DIRECTOR' && (
        <div style={{
          padding: '14px 18px', marginBottom: 12, borderRadius: 10,
          background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
          border: '1.5px solid #F59E0B',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>🏖️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E' }}>
              {pendingLeaveCount} New Leave Application{pendingLeaveCount > 1 ? 's' : ''} from Employees
            </div>
            <div style={{ fontSize: 12, color: '#A16207', marginTop: 2 }}>
              {pendingLeaves.slice(0, 3).map((l: any, i: number) => (
                <span key={l.id}>
                  {i > 0 && ' · '}{l.user?.name || 'Unknown'} ({l.leaveType}, {l.totalDays}d)
                </span>
              ))}
              {pendingLeaves.length > 3 && ` · +${pendingLeaves.length - 3} more`}
            </div>
          </div>
          <button className="btn" style={{
            fontSize: 11, padding: '6px 14px', fontWeight: 800,
            background: '#92400E', color: '#fff', borderRadius: 6, whiteSpace: 'nowrap',
          }} onClick={() => setActivePage('leaves')}>
            View Leaves →
          </button>
        </div>
      )}

      {/* 4 KPI Stat Cards */}
      <div className="stat-grid sg-4" style={{ marginBottom: 16 }}>
        <div className="sc lux-border" style={{ cursor: 'pointer' }} onClick={() => setActivePage('tasks')}>
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top">
            <div><div className="sc-label">🔴 Overdue</div><div className="sc-val" style={{ color: 'var(--red)' }}>{overdue}</div></div>
            <div className="sc-icon" style={{ background: 'var(--red-m)' }}>⚠️</div>
          </div>
          <div className="sc-sub">Requires immediate action</div>
          <div className="sc-bar"><div className="sc-bar-fill" style={{ width: `${Math.min(100, overdue * 10)}%`, background: 'var(--red)' }} /></div>
        </div>
        <div className="sc lux-border" style={{ cursor: 'pointer' }} onClick={() => setActivePage('tasks')}>
          <div className="sc-accent" style={{ background: 'var(--amber)' }} />
          <div className="sc-top">
            <div><div className="sc-label">🟡 Today&apos;s Tasks</div><div className="sc-val" style={{ color: 'var(--amber)' }}>{todayTasks.length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--amber-m)' }}>📅</div>
          </div>
          <div className="sc-sub">Due today</div>
          <div className="sc-bar"><div className="sc-bar-fill" style={{ width: `${Math.min(100, todayTasks.length * 10)}%`, background: 'var(--amber)' }} /></div>
        </div>
        <div className="sc lux-border" style={{ cursor: 'pointer' }} onClick={() => setActivePage('tasks')}>
          <div className="sc-accent" style={{ background: 'var(--blue)' }} />
          <div className="sc-top">
            <div><div className="sc-label">🔵 In Progress</div><div className="sc-val" style={{ color: 'var(--blue)' }}>{inProgress}</div></div>
            <div className="sc-icon" style={{ background: 'var(--blue-m)' }}>🔄</div>
          </div>
          <div className="sc-sub">Currently active</div>
          <div className="sc-bar"><div className="sc-bar-fill" style={{ width: `${Math.min(100, inProgress * 7)}%`, background: 'var(--blue)' }} /></div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top">
            <div><div className="sc-label">🟢 Performance</div><div className="sc-val" style={{ color: 'var(--g2)' }}>{effScore}%</div></div>
            <div className="sc-icon" style={{ background: 'var(--gb)' }}>📈</div>
          </div>
          <div className="sc-sub">{effScore >= 70 ? 'Excellent performance' : effScore >= 40 ? 'On track' : 'Needs attention'}</div>
          <div className="sc-bar"><div className="sc-bar-fill" style={{ width: `${effScore}%`, background: 'var(--g2)' }} /></div>
        </div>
      </div>

      {/* Recent Leave Applications — View-only, auto-refresh every 5s */}
      {(() => {
        const recentLeaves = Array.isArray(dash?.recentLeaves) ? dash.recentLeaves : []
        if (recentLeaves.length === 0) return null
        const leaveStatusStyle: Record<string, { bg: string; color: string; label: string }> = {
          PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
          APPROVED: { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
          REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
          CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
        }
        return (
          <div className="lcard" style={{ marginBottom: 14 }}>
            <div className="ch">
              <div className="ct">🏖️ Recent Leave Applications</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge b-gold" style={{ fontSize: 10 }}>Live</span>
                <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 700 }}>Auto-refresh 5s</span>
              </div>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              <div className="tw">
                <table className="ltable">
                  <thead>
                    <tr><th>Employee</th><th>Leave Type</th><th>From</th><th>To</th><th>Days</th><th>Tag</th><th>Status</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {recentLeaves.slice(0, 10).map((l: any) => {
                      const ls = leaveStatusStyle[l.status] || leaveStatusStyle.PENDING
                      const isLate = l.applicationTag === 'LA'
                      return (
                        <tr key={l.id} style={isLate ? { background: '#FEF2F2' } : undefined}>
                          <td style={{ fontWeight: 600, fontSize: 12 }}>
                            {l.user?.name || 'Unknown'}
                            {l.user?.department && <span className="badge b-gray" style={{ fontSize: 8, padding: '1px 4px', marginLeft: 4 }}>{l.user.department}</span>}
                          </td>
                          <td style={{ fontSize: 11, fontWeight: 600 }}>{l.leaveType}</td>
                          <td style={{ fontSize: 11 }}>{l.fromDate ? new Date(l.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td style={{ fontSize: 11 }}>{l.toDate ? new Date(l.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td style={{ fontWeight: 700, fontSize: 11 }}>{l.totalDays}</td>
                          <td>
                            <span className="badge" style={{ fontSize: 10, padding: '2px 6px', fontWeight: 900, background: isLate ? '#DC2626' : 'var(--green)', color: '#fff', borderRadius: 4 }}>
                              {isLate ? 'LA' : 'AL'}
                            </span>
                          </td>
                          <td>
                            <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: ls.bg, color: ls.color, fontWeight: 700 }}>
                              {ls.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--t3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Performance Score Board */}
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch">
          <div className="ct">📊 Team Performance Score Board</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 700 }}>🟢 ≥70 Excellent | 🟡 40-69 On Track | 🔴 &lt;40 Attention</span>
          </div>
        </div>
        <div className="cb">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {userPerf.slice(0, 8).map((u: any) => (
              <div key={u.id} style={{
                background: 'var(--card)', border: '1.5px solid var(--b1)', borderRadius: 'var(--r-sm)',
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all .15s', cursor: 'pointer',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}
              >
                <div className="av" style={{ background: avatarColor(u.name) }}>{getInitials(u.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>{u.done}/{u.total} done · {u.department || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: scoreColor(u.score) }}>{u.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column: Tasks + AI Insights */}
      <div className="g-70-30" style={{ marginBottom: 14 }}>
        {/* Weekly Team Performance Table */}
        <div className="lcard">
          <div className="ch">
            <div className="ct">⚡ Weekly Team Performance</div>
            <span className="badge b-gold" style={{ fontSize: 10 }}>Live</span>
          </div>
          <div className="tw">
            <table className="ltable">
              <thead>
                <tr><th>Member</th><th>Department</th><th>Role</th><th>Tasks</th><th>Done</th><th>Score</th></tr>
              </thead>
              <tbody>
                {userPerf.slice(0, 10).map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="av" style={{ width: 26, height: 26, fontSize: 9, background: avatarColor(u.name) }}>{getInitials(u.name)}</div>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{u.name}</span>
                      </div>
                    </td>
                    <td><span className="badge b-gray" style={{ fontSize: 9 }}>{u.department || '—'}</span></td>
                    <td style={{ fontSize: 11 }}>{u.role}</td>
                    <td style={{ fontSize: 11, fontWeight: 700 }}>{u.total}</td>
                    <td style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>{u.done}</td>
                    <td>
                      <span style={{ fontWeight: 900, fontSize: 13, color: scoreColor(u.score) }}>{u.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Insights */}
        <div className="ai-widget">
          <div className="ai-label"><div className="ai-pulse" />AI Intelligence</div>
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: completionRate >= 70 ? 'var(--green)' : 'var(--red)' }} />
            <div className="ai-text"><strong>Completion Rate: {completionRate}%</strong> — {completionRate >= 70 ? 'Healthy output across departments.' : 'Below target. Consider workload redistribution.'}</div>
          </div>
          {overdue > 0 && (
            <div className="ai-item">
              <div className="ai-bullet" style={{ background: 'var(--red)' }} />
              <div className="ai-text"><strong>{overdue} Overdue Task(s)</strong> — Immediate attention required.</div>
            </div>
          )}
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: 'var(--green)' }} />
            <div className="ai-text"><strong>{users.length} Active Members</strong> — Team is operational.</div>
          </div>
        </div>
      </div>

      {/* Today + Upcoming Tasks */}
      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="lcard">
          <div className="ch">
            <div className="ct">📅 Today&apos;s Tasks</div>
            <span className="badge b-amber" style={{ fontSize: 10 }}>{todayTasks.length}</span>
          </div>
          <div className="cb">
            {todayTasks.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}><p>No tasks due today</p></div>
            ) : todayTasks.slice(0, 5).map((t: any) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--b1)', cursor: 'pointer' }}>
                <div className="av" style={{ width: 28, height: 28, fontSize: 10, background: avatarColor(t.owner?.name || 'T') }}>{getInitials(t.owner?.name || 'T')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{t.owner?.name} · {t.department || '—'}</div>
                </div>
                <span className="badge" style={{ fontSize: 9, padding: '2px 6px', background: statusLabels[t.status] ? 'var(--amber-l)' : 'var(--bg2)', color: 'var(--amber)' }}>
                  {statusLabels[t.status] || t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="lcard">
          <div className="ch">
            <div className="ct">📌 Upcoming Tasks</div>
            <span className="badge b-blue" style={{ fontSize: 10 }}>{upcomingTasks.length}</span>
          </div>
          <div className="cb">
            {upcomingTasks.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}><p>No upcoming tasks</p></div>
            ) : upcomingTasks.slice(0, 5).map((t: any) => {
              const daysLeft = t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--b1)', cursor: 'pointer' }}>
                  <div className="av" style={{ width: 28, height: 28, fontSize: 10, background: 'var(--blue)' }}>{getInitials(t.owner?.name || 'T')}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{t.owner?.name} · {t.department || '—'}</div>
                  </div>
                  <span className="badge b-blue" style={{ fontSize: 9, flexShrink: 0 }}>in {daysLeft}d</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">🏢 Department Breakdown</div><span className="badge b-gold" style={{ fontSize: 10 }}>Live</span></div>
        <div className="cb">
          {Object.entries(dash?.deptMap || {}).length === 0 ? (
            <div className="empty"><p>No department data yet</p></div>
          ) : Object.entries(dash?.deptMap || {}).map(([name, v]: [string, any]) => {
            const rate = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0
            return (
              <div key={name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{v.done}/{v.total} done · {rate}% · {v.overdue} overdue</span>
                </div>
                <div className="prog">
                  <div className="prog-bg" style={{ height: 8 }}>
                    <div className="prog-fill" style={{
                      width: `${rate}%`,
                      background: rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--amber)' : 'var(--red)',
                      height: '100%',
                    }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Activity — persistent audit log of task events (CREATED / DELETED / REVISED / etc.)
          This feed NEVER loses data: even if a task is deleted, its activity entry survives
          with a snapshot of the title, so the user can always see what happened. */}
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch">
          <div className="ct">🕐 Recent Activity</div>
          <span className="badge b-gold" style={{ fontSize: 10 }}>Live · {taskActivities.length}</span>
        </div>
        <div className="cb">
          {taskActivities.length === 0 ? (
            <div className="empty" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--t2)' }}>No task activity yet</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--t3)' }}>
                When you create, complete, revise, or delete a task, it will be recorded here permanently.
              </p>
            </div>
          ) : taskActivities.slice(0, 12).map((a: any) => {
            // Pick icon + color by action type
            const meta: Record<string, { icon: string; color: string; bg: string; label: string }> = {
              CREATED:        { icon: '✨', color: '#15803D', bg: '#DCFCE7', label: 'Created' },
              UPDATED:        { icon: '✏️', color: '#1D4ED8', bg: '#DBEAFE', label: 'Updated' },
              DELETED:        { icon: '🗑️', color: '#DC2626', bg: '#FEE2E2', label: 'Deleted' },
              COMPLETED:      { icon: '✅', color: '#15803D', bg: '#DCFCE7', label: 'Completed' },
              REVISED:        { icon: '🔁', color: '#D97706', bg: '#FFFBEB', label: 'Revised' },
              CANCELLED:      { icon: '🚫', color: '#6B7280', bg: '#F3F4F6', label: 'Cancelled' },
              STATUS_CHANGED: { icon: '🔄', color: '#6D28D9', bg: '#EDE9FE', label: 'Status Change' },
            }
            const m = meta[a.action] || meta.UPDATED
            const actorName = a.actor?.name || 'System'
            return (
              <div key={a.id} className="feed-item" style={{ padding: '10px 6px', borderBottom: '1px solid var(--b1)' }}>
                <div className="feed-dot" style={{ background: m.color, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {m.icon}
                </div>
                <div className="feed-body" style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-text" style={{ fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: m.color, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 6 }}>
                      {m.label}
                    </span>
                    {a.description || `Task "${a.taskTitle}" ${m.label.toLowerCase()}`}
                  </div>
                  <div className="feed-time" style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>by <strong style={{ color: 'var(--t2)' }}>{actorName}</strong></span>
                    {a.department && <span>· {a.department}</span>}
                    {a.priority && <span>· {a.priority}</span>}
                    <span>· {a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
