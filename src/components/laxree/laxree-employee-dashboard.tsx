'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'
import { LaxreeAttendancePanel } from './laxree-attendance-panel'
import { LaxreeSalarySlipPanel } from './laxree-salary-slip-panel'
import { LaxreePunchWidget } from './laxree-punch-widget'
import { LaxreeHrReport } from './laxree-hr-report'

// Avatar colors
const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function LaxreeEmployeeDashboard() {
  const { currentUserId, currentUserName, currentRole, addToast, setActivePage } = useWorkflowStore()
  const queryClient = useQueryClient()
  const userInitials = getInitials(currentUserName || 'E')
  const userAvatarBg = avatarColor(currentUserName || 'Employee')

  // Tab navigation for employee dashboard
  const [empTab, setEmpTab] = useState<'overview' | 'tasks' | 'scorecard' | 'attendance' | 'salary-slip' | 'hr-report'>('overview')
  const [taskFilter, setTaskFilter] = useState<string>('all')

  // NOTE: 'emp-tasks' is now a dedicated page (LaxreeEmpMyTasks) — no need to auto-switch tabs here.
  // The 'tasks' tab below remains as a quick preview inside the dashboard Overview.

  // Fetch employee's tasks (read-only) — tasks where employee is owner OR step assignee
  const { data: tasksData = [] } = useQuery({
    queryKey: ['emp-tasks', currentUserId],
    queryFn: () => fetch(`/api/tasks?ownerId=${currentUserId}&assignedTo=${currentUserId}`).then(r => r.json()),
    enabled: !!currentUserId,
  })

  // ─── Recent Activity feed (persistent audit log) ─────────────────
  // Shows task events for the whole system so employees can see what's happening.
  const { data: taskActivityData } = useQuery<{ activities: any[]; count: number }>({
    queryKey: ['emp-task-activity-feed'],
    queryFn: () => fetch('/api/task-activity?limit=10').then(r => r.json()),
    refetchInterval: 15000,
    refetchOnMount: 'always',
  })
  const taskActivities = Array.isArray(taskActivityData?.activities) ? taskActivityData.activities : []

  // Fetch employee's leaves — with auto-refresh for real-time status updates
  const { data: leavesData = { leaves: [] }, refetch: refetchLeaves } = useQuery({
    queryKey: ['emp-leaves', currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/leaves?userId=${currentUserId}`)
      if (!res.ok) throw new Error('Failed to fetch leaves')
      return res.json()
    },
    enabled: !!currentUserId,
    refetchOnMount: 'always',
    staleTime: 0,
    refetchInterval: 10000, // Auto-refresh every 10 seconds so employee sees status changes
  })

  // Fetch employee's weekly score
  const getWeekInfo = () => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return { monday, sunday, weekNum, year: now.getFullYear() }
  }

  const weekInfo = getWeekInfo()

  const { data: scoreData } = useQuery({
    queryKey: ['emp-score', currentUserId],
    queryFn: () => fetch(
      `/api/weekly-score?userId=${currentUserId}&weekStart=${weekInfo.monday.toISOString()}&weekEnd=${weekInfo.sunday.toISOString()}`
    ).then(r => r.json()),
    enabled: !!currentUserId,
  })

  const tasks = Array.isArray(tasksData) ? tasksData : []
  const leaves = Array.isArray(leavesData) ? leavesData : (leavesData.leaves || [])
  const score = scoreData as any

  // Stats
  const isToday = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  const isUpcoming = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return d >= tomorrowStart
  }
  const isOverdue = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return dueDayStart < todayStart
  }
  // Today: tasks WITHOUT a dueDate (need attention today) OR with dueDate today
  const todayTasks = tasks.filter((t: any) =>
    t.status !== 'COMPLETED' && t.status !== 'CANCELLED' &&
    (!t.dueDate || isToday(t.dueDate))
  )
  const upcomingTasks = tasks.filter((t: any) => t.dueDate && isUpcoming(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const overdueTasks = tasks.filter((t: any) => t.dueDate && isOverdue(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const activeTasks = tasks.filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'PENDING' || t.status === 'ON_HOLD')
  const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED')
  const pendingLeaves = leaves.filter((l: any) => l.status === 'PENDING')
  const approvedLeaves = leaves.filter((l: any) => l.status === 'APPROVED')

  const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    IN_PROGRESS: { bg: '#DBEAFE', color: '#1D4ED8', label: 'In Progress' },
    COMPLETED: { bg: '#DCFCE7', color: '#15803D', label: 'Done' },
    CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
    ON_HOLD: { bg: '#EDE9FE', color: '#6D28D9', label: 'On Hold' },
    ESCALATED: { bg: '#FEE2E2', color: '#DC2626', label: 'Escalated' },
    EXTERNAL_HOLD: { bg: '#EDE9FE', color: '#6D28D9', label: 'Ext Hold' },
  }

  const leaveStatusStyle: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    APPROVED: { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
    REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  }

  const tabItems = [
    { id: 'overview' as const, label: 'Overview', icon: '📊' },
    { id: 'tasks' as const, label: 'My Tasks', icon: '📋' },
    { id: 'scorecard' as const, label: 'My Scorecard', icon: '📈' },
    { id: 'attendance' as const, label: 'Attendance', icon: '📅' },
    { id: 'salary-slip' as const, label: 'Salary Slip', icon: '🧾' },
    { id: 'hr-report' as const, label: 'HR Report', icon: '📊' },
  ]

  return (
    <>
      <div className="ph">
        <div className="ph-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="av" style={{ width: 42, height: 42, fontSize: 16, background: userAvatarBg }}>
            {userInitials}
          </div>
          <div>
            <h2>My Dashboard</h2>
            <p>Welcome, {currentUserName || 'Employee'}</p>
          </div>
        </div>
        <div className="ph-right">
          <button className="btn" style={{ fontSize: 11, padding: '6px 14px', background: 'rgba(109,40,217,.1)', color: '#6D28D9', fontWeight: 800, border: '1px solid rgba(109,40,217,.3)' }}
            onClick={() => setActivePage('ai-assistant')}>
            🤖 AI Assistant
          </button>
          <button className="btn btn-gold" onClick={() => setActivePage('emp-leaves')}>
            🏖️ Leave Management
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Punch-in/Punch-out Widget with Geofencing */}
      <LaxreePunchWidget />

      {/* Leave Status Alert Banner for Employee */}
      {pendingLeaves.length > 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: 12, borderRadius: 10,
          background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
          border: '1.5px solid #F59E0B',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 24 }}>⏳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#92400E' }}>
              {pendingLeaves.length} Leave Application{pendingLeaves.length > 1 ? 's' : ''} Pending — Awaiting Admin Approval
            </div>
            <div style={{ fontSize: 11, color: '#A16207', marginTop: 2 }}>
              {pendingLeaves.slice(0, 2).map((l: any, i: number) => (
                <span key={l.id}>
                  {i > 0 && ' · '}{l.leaveType} ({new Date(l.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
                </span>
              ))}
              {pendingLeaves.length > 2 && ` · +${pendingLeaves.length - 2} more`}
              {' · '}Admin will review shortly
            </div>
          </div>
          <button className="btn" style={{
            fontSize: 11, padding: '6px 14px', fontWeight: 800,
            background: '#92400E', color: '#fff', borderRadius: 6, whiteSpace: 'nowrap',
          }} onClick={() => setActivePage('emp-leaves')}>
            View Leaves →
          </button>
        </div>
      )}

      {/* Recently Approved/Rejected Leaves Alert */}
      {leaves.filter((l: any) => {
        if (!l.approvedAt) return false
        const approvedTime = new Date(l.approvedAt).getTime()
        const hoursSinceApproval = (Date.now() - approvedTime) / (1000 * 60 * 60)
        return hoursSinceApproval < 24 && (l.status === 'APPROVED' || l.status === 'REJECTED')
      }).length > 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: 12, borderRadius: 10,
          background: 'linear-gradient(135deg, #DCFCE7, #BBF7D0)',
          border: '1.5px solid #22C55E',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 24 }}>{'✅'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#15803D' }}>
              Leave Status Update
            </div>
            <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>
              {leaves.filter((l: any) => {
                if (!l.approvedAt) return false
                const hoursSince = (Date.now() - new Date(l.approvedAt).getTime()) / (1000 * 60 * 60)
                return hoursSince < 24 && (l.status === 'APPROVED' || l.status === 'REJECTED')
              }).slice(0, 2).map((l: any, i: number) => (
                <span key={l.id}>
                  {i > 0 && ' · '}{l.leaveType} leave {l.status === 'APPROVED' ? 'approved' : 'rejected'}
                  {l.eaRemark ? ` (${l.eaRemark})` : ''}
                </span>
              ))}
            </div>
          </div>
          <button className="btn" style={{
            fontSize: 11, padding: '6px 14px', fontWeight: 800,
            background: '#15803D', color: '#fff', borderRadius: 6, whiteSpace: 'nowrap',
          }} onClick={() => setActivePage('emp-leaves')}>
            View Details →
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {tabItems.map(tab => (
          <div key={tab.id} className={`tab${empTab === tab.id ? ' active' : ''}`}
            onClick={() => setEmpTab(tab.id)}>
            <span style={{ marginRight: 4 }}>{tab.icon}</span> {tab.label}
            {tab.id === 'tasks' && todayTasks.length > 0 && <span className="tab-cnt">{todayTasks.length}</span>}
          </div>
        ))}
      </div>

      {/* ===================== OVERVIEW TAB ===================== */}
      {empTab === 'overview' && (
        <>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <div className="lcard" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Today</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--g2)' }}>{todayTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Upcoming</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--blue)' }}>{upcomingTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Overdue</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--red)' }}>{overdueTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>PR Score</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: score?.prScore >= 70 ? 'var(--green)' : score?.prScore >= 40 ? 'var(--amber)' : 'var(--red)' }}>{score?.prScore || 0}</div>
            </div>
          </div>

          {/* Quick Overview: Recent Tasks */}
          <div className="lcard" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ct">📋 All My Assigned Tasks</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>
                  🔒 Read Only
                </span>
                <span className="badge b-blue" style={{ fontSize: 10 }}>{tasks.length}</span>
                <button className="btn" style={{ fontSize: 10, padding: '3px 10px', background: 'var(--gb)', color: 'var(--g2)', fontWeight: 700 }}
                  onClick={() => setEmpTab('tasks')}>
                  View All →
                </button>
              </div>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--t3)' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
                  <div style={{ fontWeight: 700 }}>No tasks assigned to you</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Tasks will appear here when assigned by Admin</div>
                </div>
              ) : (
                <div className="tw">
                  <table className="ltable">
                    <thead>
                      <tr><th>Task</th><th>Assigned By</th><th>Priority</th><th>Status</th><th>Due</th><th>Steps</th></tr>
                    </thead>
                    <tbody>
                      {tasks.slice(0, 10).map((task: any) => {
                        const sStyle = statusStyle[task.status] || statusStyle.PENDING
                        const stepsTotal = task.taskSteps?.length || 0
                        const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
                        const isStepAssignee = task.ownerId !== currentUserId
                        return (
                          <tr key={task.id}>
                            <td style={{ fontWeight: 600 }}>
                              {task.title}
                              {isStepAssignee && <span style={{ fontSize: 8, color: '#6D28D9', fontWeight: 700, marginLeft: 6, background: 'rgba(109,40,217,.1)', padding: '1px 4px', borderRadius: 2 }}>STEP</span>}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--t3)' }}>
                              {task.owner?.name && isStepAssignee ? task.owner.name : '—'}
                            </td>
                            <td>
                              <span className="badge" style={{
                                fontSize: 9, padding: '2px 8px',
                                background: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? '#FEF2F2' : task.priority === 'MEDIUM' ? '#FFFBEB' : '#EFF6FF',
                                color: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? '#DC2626' : task.priority === 'MEDIUM' ? '#D97706' : '#2563EB',
                                fontWeight: 700,
                              }}>
                                {task.priority || 'MEDIUM'}
                              </span>
                            </td>
                            <td><span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: sStyle.bg, color: sStyle.color, fontWeight: 700 }}>{sStyle.label}</span></td>
                            <td style={{ fontSize: 11, color: 'var(--t3)' }}>
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </td>
                            <td style={{ fontSize: 11 }}>
                              {stepsTotal > 0 ? (
                                <span style={{ fontWeight: 700, color: stepsDone === stepsTotal ? 'var(--green)' : 'var(--blue)' }}>
                                  {stepsDone}/{stepsTotal}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Read-only notice */}
              <div style={{ padding: '8px 16px', background: 'var(--bg2)', borderTop: '1px solid var(--b1)', fontSize: 10, color: 'var(--t4)', fontWeight: 600 }}>
                🔒 Only Admin can mark tasks as Done or Revise. You can view your assigned tasks here.
              </div>
            </div>
          </div>

          {/* Quick Leave Overview */}
          <div className="lcard" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ct">🏖️ My Recent Leaves</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn" style={{ fontSize: 10, padding: '3px 10px', background: 'var(--gb)', color: 'var(--g2)', fontWeight: 700 }}
                  onClick={() => setActivePage('emp-leaves')}>
                  View All & Apply
                </button>
                <span className="badge b-gold" style={{ fontSize: 10 }}>{leaves.length}</span>
              </div>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              {leaves.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--t3)' }}>
                  <div style={{ fontWeight: 700 }}>No leaves applied</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 12px', background: 'var(--gb)', color: 'var(--g2)', fontWeight: 700 }}
                      onClick={() => setActivePage('emp-leaves')}>
                      Go to Leave Management →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="tw">
                  <table className="ltable">
                    <thead>
                      <tr><th>Type</th><th>From</th><th>To</th><th>Tag</th><th>Status</th><th>EA Remark</th></tr>
                    </thead>
                    <tbody>
                      {leaves.slice(0, 5).map((leave: any) => {
                        const lsStyle = leaveStatusStyle[leave.status] || leaveStatusStyle.PENDING
                        return (
                          <tr key={leave.id}>
                            <td style={{ fontWeight: 600, fontSize: 11 }}>{leave.leaveType}</td>
                            <td style={{ fontSize: 11 }}>{new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td style={{ fontSize: 11 }}>{new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td>
                              <span className="badge" style={{
                                fontSize: 10, padding: '2px 8px', fontWeight: 900, letterSpacing: 0.5,
                                background: leave.applicationTag === 'AL' ? 'var(--green-l)' : '#FEE2E2',
                                color: leave.applicationTag === 'AL' ? 'var(--green)' : 'var(--red)',
                              }}>
                                {leave.applicationTag === 'AL' ? '✓ AL' : '⚠ LA'}
                              </span>
                            </td>
                            <td><span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: lsStyle.bg, color: lsStyle.color, fontWeight: 700 }}>{lsStyle.label}</span></td>
                            <td style={{ fontSize: 10, color: 'var(--t3)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leave.eaRemark || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Quick Score Overview */}
          <div className="lcard">
            <div className="ch">
              <div className="ct">📈 My Weekly Score</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>
                Week {weekInfo.weekNum}
              </span>
            </div>
            <div className="cb">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: '#FEF2F2' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#DC2626', marginBottom: 2 }}>Red</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#DC2626' }}>{score?.redScore || 0}%</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: '#FFFBEB' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#D97706', marginBottom: 2 }}>Yellow</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#D97706' }}>{score?.yellowScore || 0}%</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: '#DCFCE7' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#15803D', marginBottom: 2 }}>Green</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#15803D' }}>{score?.greenScore || 0}%</div>
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: score?.prScore >= 70 ? 'var(--green-l)' : score?.prScore >= 40 ? 'var(--amber-l)' : 'var(--red-l)', textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: 'var(--t3)' }}>PR Score</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: score?.prScore >= 70 ? 'var(--green)' : score?.prScore >= 40 ? 'var(--amber)' : 'var(--red)' }}>{score?.prScore || 0}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--t3)' }}>
                <span style={{ color: '#22C55E' }}>✓ On time: {score?.completedOnTime || 0}</span> ·{' '}
                <span style={{ color: '#F59E0B' }}>◐ In progress/Late: {(score?.inProgressOnTrack || 0) + (score?.completedLate || 0)}</span> ·{' '}
                <span style={{ color: '#EF4444' }}>✕ Overdue: {score?.overdue || 0}</span> ·{' '}
                <span style={{ fontWeight: 700 }}>Total: {score?.totalTasks || 0}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== MY TASKS TAB (READ ONLY) ===================== */}
      {empTab === 'tasks' && (
        <>
          {/* Task Stats Summary — clickable cards to filter tasks (now includes 'All' and 'Complete') */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <div className="lcard" style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: taskFilter === 'all' ? '3px solid var(--t2)' : undefined, background: taskFilter === 'all' ? 'rgba(109,40,217,.04)' : undefined }}
              onClick={() => setTaskFilter('all')}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 2 }}>All</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--t2)' }}>{activeTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: taskFilter === 'today' ? '3px solid var(--g2)' : undefined, background: taskFilter === 'today' ? 'rgba(180,83,9,.04)' : undefined }}
              onClick={() => setTaskFilter('today')}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 2 }}>Today</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--g2)' }}>{todayTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: taskFilter === 'upcoming' ? '3px solid var(--blue)' : undefined, background: taskFilter === 'upcoming' ? 'rgba(29,78,216,.04)' : undefined }}
              onClick={() => setTaskFilter('upcoming')}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 2 }}>Upcoming</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--blue)' }}>{upcomingTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: taskFilter === 'complete' ? '3px solid var(--green)' : undefined, background: taskFilter === 'complete' ? 'rgba(22,163,74,.04)' : undefined }}
              onClick={() => setTaskFilter('complete')}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 2 }}>Complete</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>{completedTasks.length}</div>
            </div>
            <div className="lcard" style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: taskFilter === 'overdue' ? '3px solid var(--red)' : undefined, background: taskFilter === 'overdue' ? 'rgba(220,38,38,.04)' : undefined }}
              onClick={() => setTaskFilter('overdue')}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 2 }}>Overdue</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--red)' }}>{overdueTasks.length}</div>
            </div>
          </div>

          <div className="lcard">
            <div className="ch">
              <div className="ct">📋 All My Assigned Tasks</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>
                  {taskFilter === 'all' ? `${activeTasks.length} all` : taskFilter === 'today' ? `${todayTasks.length} today` : taskFilter === 'upcoming' ? `${upcomingTasks.length} upcoming` : taskFilter === 'complete' ? `${completedTasks.length} complete` : `${overdueTasks.length} overdue`}
                </span>
              </div>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              {(() => {
                const filteredTasks = taskFilter === 'all' ? activeTasks
                  : taskFilter === 'today' ? todayTasks
                  : taskFilter === 'upcoming' ? upcomingTasks
                  : taskFilter === 'complete' ? completedTasks
                  : overdueTasks

                return filteredTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {taskFilter === 'all' ? 'No tasks assigned to you' : taskFilter === 'today' ? 'No tasks due today' : taskFilter === 'upcoming' ? 'No upcoming tasks' : taskFilter === 'complete' ? 'No completed tasks yet' : 'No overdue tasks'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {taskFilter === 'complete' ? 'Tasks you finish will appear here for your records.' : 'Tasks will appear here when assigned by Admin'}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filteredTasks.map((task: any) => {
                      const sStyle = statusStyle[task.status] || statusStyle.PENDING
                      const stepsTotal = task.taskSteps?.length || 0
                      const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
                      const stepsAllDone = stepsTotal > 0 && stepsDone === stepsTotal
                      const isCompleted = task.status === 'COMPLETED'
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted && task.status !== 'CANCELLED'
                      // Check if this is a task where employee is a step assignee (not owner)
                      const isStepAssignee = task.ownerId !== currentUserId && task.taskSteps?.some((s: any) => s.assigneeId === currentUserId)

                      return (
                        <div key={task.id} style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--b1)',
                          background: isCompleted ? 'rgba(22,163,74,.03)' : isOverdue ? 'rgba(220,38,38,.03)' : undefined,
                        }}>
                          {/* Task header row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            {/* Status dot */}
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: isCompleted ? 'var(--green)' : isOverdue ? 'var(--red)' : task.status === 'IN_PROGRESS' ? 'var(--blue)' : 'var(--amber)',
                            }} />

                            {/* Title */}
                            <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>
                              {isCompleted && '✅ '}{task.title}
                            </div>

                            {/* Step assignee indicator */}
                            {isStepAssignee && (
                              <span className="badge" style={{ fontSize: 8, padding: '1px 6px', background: 'rgba(109,40,217,.1)', color: '#6D28D9', fontWeight: 700 }}>
                                ASSIGNED STEP
                              </span>
                            )}

                            {/* Priority badge */}
                            <span className="badge" style={{
                              fontSize: 9, padding: '2px 8px',
                              background: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? '#FEF2F2' : task.priority === 'MEDIUM' ? '#FFFBEB' : '#EFF6FF',
                              color: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? '#DC2626' : task.priority === 'MEDIUM' ? '#D97706' : '#2563EB',
                              fontWeight: 700,
                            }}>
                              {task.priority || 'MEDIUM'}
                            </span>

                            {/* Status badge */}
                            <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: sStyle.bg, color: sStyle.color, fontWeight: 700 }}>
                              {sStyle.label}
                            </span>
                          </div>

                          {/* Task meta */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--t3)', marginLeft: 18, flexWrap: 'wrap' }}>
                            {task.owner?.name && task.ownerId !== currentUserId && (
                              <span>Assigned by: <b>{task.owner.name}</b></span>
                            )}
                            {task.department && (
                              <span><span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{task.department}</span></span>
                            )}
                            {task.dueDate && (
                              <span style={isOverdue ? { color: 'var(--red)', fontWeight: 700 } : {}}>
                                Due: {new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                {isOverdue && ' (Overdue)'}
                              </span>
                            )}
                            {task.category && <span>Category: {task.category}</span>}
                          </div>

                          {/* Steps progress */}
                          {stepsTotal > 0 && (
                            <div style={{ marginTop: 8, marginLeft: 18 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>
                                  Steps: {stepsDone}/{stepsTotal}
                                </span>
                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg2)' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${stepsTotal > 0 ? (stepsDone / stepsTotal) * 100 : 0}%`,
                                    background: stepsAllDone ? 'var(--green)' : 'var(--blue)',
                                    transition: 'width 0.3s ease',
                                  }} />
                                </div>
                              </div>
                              {/* Step items — highlight employee's assigned steps */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {task.taskSteps?.map((step: any) => {
                                  const isMyStep = step.assigneeId === currentUserId
                                  return (
                                    <div key={step.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      fontSize: 10, color: step.status === 'COMPLETED' ? 'var(--green)' : isMyStep ? 'var(--blue)' : 'var(--t3)',
                                      fontWeight: isMyStep ? 700 : 400,
                                      background: isMyStep ? 'rgba(29,78,216,.04)' : 'transparent',
                                      padding: isMyStep ? '2px 6px' : undefined,
                                      borderRadius: isMyStep ? 3 : undefined,
                                    }}>
                                      <span style={{ fontWeight: 700 }}>{step.status === 'COMPLETED' ? '✓' : '○'}</span>
                                      <span style={step.status === 'COMPLETED' ? { textDecoration: 'line-through' } : {}}>{step.title}</span>
                                      {isMyStep && <span style={{ fontSize: 8, color: 'var(--blue)', fontWeight: 800, marginLeft: 4 }}>(YOU)</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Completed notice */}
                          {isCompleted && (
                            <div style={{ marginTop: 6, marginLeft: 18, fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                              ✅ Completed task
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Footer notice */}
              <div style={{ padding: '10px 16px', background: 'var(--bg2)', borderTop: '1px solid var(--b1)', fontSize: 10, color: 'var(--t4)', fontWeight: 600 }}>
                🔒 Read only — Only Admin can mark tasks as Done or Revise them. Click the stat cards above to filter tasks.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== MY SCORECARD TAB ===================== */}
      {empTab === 'scorecard' && (
        <>
          <div className="lcard" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ct">📈 My Performance Scorecard</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>
                Week {weekInfo.weekNum} · {weekInfo.year}
              </span>
            </div>
            <div className="cb">
              {/* Big Score Display */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* PR Score */}
                <div style={{
                  padding: '20px 16px', borderRadius: 12,
                  background: score?.prScore >= 70 ? 'linear-gradient(135deg, #DCFCE7, #BBF7D0)' : score?.prScore >= 40 ? 'linear-gradient(135deg, #FEF3C7, #FDE68A)' : 'linear-gradient(135deg, #FEE2E2, #FECACA)',
                  textAlign: 'center', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>PR Score</div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: score?.prScore >= 70 ? 'var(--green)' : score?.prScore >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                    {score?.prScore || 0}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginTop: 2 }}>
                    {score?.prScore >= 70 ? 'Excellent' : score?.prScore >= 40 ? 'Needs Improvement' : 'Critical'}
                  </div>
                </div>

                {/* Total Tasks */}
                <div style={{
                  padding: '20px 16px', borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--bg), var(--bg2))',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Total Tasks</div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--t1)' }}>
                    {score?.totalTasks || 0}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginTop: 2 }}>
                    this week
                  </div>
                </div>
              </div>

              {/* R/Y/G Scores */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 10, background: '#FEF2F2', border: '1px solid rgba(220,38,38,.15)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#DC2626', marginBottom: 2 }}>Red Score</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#DC2626' }}>{score?.redScore || 0}%</div>
                  <div style={{ fontSize: 9, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>Overdue/Rejected: {((score?.overdue || 0) + (score?.rejected || 0))}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 10, background: '#FFFBEB', border: '1px solid rgba(217,119,6,.15)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#D97706', marginBottom: 2 }}>Yellow Score</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#D97706' }}>{score?.yellowScore || 0}%</div>
                  <div style={{ fontSize: 9, color: '#D97706', fontWeight: 600, marginTop: 2 }}>In Progress/Late: {(score?.inProgressOnTrack || 0) + (score?.completedLate || 0)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 10, background: '#DCFCE7', border: '1px solid rgba(21,128,61,.15)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#15803D', marginBottom: 2 }}>Green Score</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#15803D' }}>{score?.greenScore || 0}%</div>
                  <div style={{ fontSize: 9, color: '#15803D', fontWeight: 600, marginTop: 2 }}>On Time: {score?.completedOnTime || 0}</div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--t2)' }}>Task Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#22C55E' }}>✓ Completed on time</span>
                    <span style={{ fontWeight: 800 }}>{score?.completedOnTime || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#F59E0B' }}>◐ In progress / On track</span>
                    <span style={{ fontWeight: 800 }}>{score?.inProgressOnTrack || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#F59E0B' }}>◐ Completed late</span>
                    <span style={{ fontWeight: 800 }}>{score?.completedLate || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#EF4444' }}>✕ Overdue</span>
                    <span style={{ fontWeight: 800 }}>{score?.overdue || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#EF4444' }}>✕ Rejected</span>
                    <span style={{ fontWeight: 800 }}>{score?.rejected || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderTop: '1px solid var(--b1)', paddingTop: 6, marginTop: 2 }}>
                    <span style={{ fontWeight: 800 }}>Total</span>
                    <span style={{ fontWeight: 900, color: 'var(--g2)' }}>{score?.totalTasks || 0}</span>
                  </div>
                </div>
              </div>

              {/* Read only notice */}
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--bg2)', fontSize: 10, color: 'var(--t4)', fontWeight: 600, textAlign: 'center' }}>
                📊 This scorecard is auto-calculated from your task performance. Only Admin can update Monday Meeting scores.
              </div>
            </div>
          </div>

          {/* ─── Revision Tracking Panel (reporting only — no score impact) ─── */}
          <div className="lcard" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
            <div className="ch">
              <div className="ct">↩ Revision Tracking</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>
                Reporting Only
              </span>
            </div>
            <div className="cb">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: '14px 8px', borderRadius: 8, background: '#FFFBEB' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#D97706', marginBottom: 2 }}>Tasks Revised</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#D97706' }}>{score?.tasksRevised || 0}</div>
                  <div style={{ fontSize: 9, color: '#92400E', marginTop: 2 }}>of {score?.totalTasks || 0} total</div>
                </div>
                <div style={{ textAlign: 'center', padding: '14px 8px', borderRadius: 8, background: '#FEF2F2' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#DC2626', marginBottom: 2 }}>Total Revisions</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#DC2626' }}>{score?.totalRevisions || 0}</div>
                  <div style={{ fontSize: 9, color: '#991B1B', marginTop: 2 }}>cumulative count</div>
                </div>
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(37,99,235,.06)',
                border: '1px solid rgba(37,99,235,.2)',
                fontSize: 11, color: '#1E40AF', lineHeight: 1.6, fontWeight: 600,
              }}>
                <div style={{ fontWeight: 800, marginBottom: 4, color: 'var(--blue)' }}>
                  ℹ Revisions do not affect your score
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#1E40AF' }}>
                  Score is calculated only on task timeliness &amp; status. Revisions are
                  tracked here for transparency and reporting, but they no longer carry
                  any score penalty.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== ATTENDANCE TAB (v24·0625) ===================== */}
      {/* Live HRMS attendance (read-only) + raise attendance query form. */}
      {/* Sourced via /api/attendance/bridge — never modifies HRMS data.     */}
      {empTab === 'attendance' && (
        <LaxreeAttendancePanel />
      )}

      {/* ===================== SALARY SLIP TAB (v24·0625-salary) ===================== */}
      {/* Live HRMS payroll (read-only) + download/print salary slip as PDF. */}
      {/* Sourced via /api/salary-slip/bridge — never modifies HRMS data.   */}
      {empTab === 'salary-slip' && (
        <LaxreeSalarySlipPanel />
      )}

      {/* ===================== HR REPORT TAB (v25·0806) ===================== */}
      {/* Monthly HR report with marking scheme — visible to employee for self-review */}
      {empTab === 'hr-report' && (
        <LaxreeHrReport />
      )}

      {/* ===================== RECENT ACTIVITY (always last — v24·0625-layout fix) ===================== */}
      {/* Moved from above tab content to BELOW all tab content so when the user clicks
          Attendance / Salary Slip / Tasks / Scorecard, the tab content shows FIRST and
          Recent Activity shows LAST (matches the user's expected layout). */}
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
                When tasks are created, completed, revised, or deleted, those events will appear here permanently.
              </p>
            </div>
          ) : taskActivities.slice(0, 8).map((a: any) => {
            const meta: Record<string, { icon: string; color: string; label: string }> = {
              CREATED:        { icon: '✨', color: '#15803D', label: 'Created' },
              UPDATED:        { icon: '✏️', color: '#1D4ED8', label: 'Updated' },
              DELETED:        { icon: '🗑️', color: '#DC2626', label: 'Deleted' },
              COMPLETED:      { icon: '✅', color: '#15803D', label: 'Completed' },
              REVISED:        { icon: '🔁', color: '#D97706', label: 'Revised' },
              CANCELLED:      { icon: '🚫', color: '#6B7280', label: 'Cancelled' },
              STATUS_CHANGED: { icon: '🔄', color: '#6D28D9', label: 'Status Change' },
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
