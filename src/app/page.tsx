'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LaxreeDashboard } from '@/components/laxree/laxree-dashboard'
import { LaxreeCreateTask } from '@/components/laxree/laxree-create-task'
import { LaxreeTasks } from '@/components/laxree/laxree-tasks'
// Approval center and director dependency removed - simplified workflow
import { LaxreeExtHold } from '@/components/laxree/laxree-exthold'
import { LaxreeEscalations } from '@/components/laxree/laxree-escalations'
import { LaxreeMonday } from '@/components/laxree/laxree-monday'
import { LaxreeSidebar } from '@/components/laxree/laxree-sidebar'
import { LaxreeTopbar } from '@/components/laxree/laxree-topbar'
import { LaxreeCommandPalette } from '@/components/laxree/laxree-command-palette'
import { LaxreeNotifPanel } from '@/components/laxree/laxree-notif-panel'
import { LaxreeLogin } from '@/components/laxree/laxree-login'
import { LaxreeEmployeeDashboard } from '@/components/laxree/laxree-employee-dashboard'
import { LaxreeEaMyTasks } from '@/components/laxree/laxree-ea-my-tasks'
import { LaxreeEmpMyTasks } from '@/components/laxree/laxree-emp-my-tasks'
import { LaxreeLeaveManagement } from '@/components/laxree/laxree-leave-management'
import { LaxreeEmployeeLeaves } from '@/components/laxree/laxree-employee-leaves'
import { LaxreeAiAssistant } from '@/components/laxree/laxree-ai-assistant'
import { LaxreeUserManagement } from '@/components/laxree/laxree-user-management'
import { LaxreeTaskDetail } from '@/components/laxree/laxree-task-detail'
import { LaxreePushNotifications } from '@/components/laxree/laxree-push-notifications'
import { LaxreeAttendancePanel } from '@/components/laxree/laxree-attendance-panel'
import { LaxreeSalarySlipPanel } from '@/components/laxree/laxree-salary-slip-panel'
import { LaxreeHrReport } from '@/components/laxree/laxree-hr-report'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Component, useEffect, useState, Suspense, type ReactNode } from 'react'

/* ═══════════════════════════════════════════════════════════
   Error Boundary
   ═══════════════════════════════════════════════════════════ */
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('View rendering error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#333' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            style={{ padding: '8px 20px', background: '#B8860B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function ActiveView() {
  const { activePage, currentRole, currentUserId, currentUserName } = useWorkflowStore()

  const isAdmin = currentRole === 'ADMIN'
  const isEA = currentRole === 'EA'
  const isDirector = currentRole === 'DIRECTOR'
  const isFounder = currentRole === 'FOUNDER'
  // DIRECTOR + FOUNDER get the same admin-level access (Executive View, Monday Meeting, etc.)
  // — only difference is task data is filtered to tasks they assigned.
  // FOUNDER uses STRICT filter (only their own tasks, no legacy NULL fallback).
  // DIRECTOR uses legacy-NULL-compatible filter (their tasks + NULL-assignedBy tasks).
  const isAdminOrDirector = isAdmin || isDirector || isFounder

  const renderView = () => {
    switch (activePage) {
      case 'dashboard':
        // EMPLOYEE / MANAGER: never see admin dashboard — always land on their own.
        // (v24·0625 BUG FIX: previously employees fell through to <LaxreeDashboard />
        //  which is the admin/EA view, causing the "employee sees admin page" bug.)
        if (currentRole === 'EMPLOYEE' || currentRole === 'MANAGER') {
          return <LaxreeEmployeeDashboard />
        }
        // FOUNDER: STRICT filter — sees ONLY tasks they assigned (no NULL fallback)
        if (isFounder) {
          return <LaxreeDashboard assignedById={currentUserId} strictAssignedBy directorName="Founder" />
        }
        // DIRECTOR: legacy-NULL-compatible filter — sees their tasks + NULL-assignedBy tasks
        if (isDirector) {
          return <LaxreeDashboard assignedById={currentUserId} directorName={currentUserName || 'Director'} />
        }
        // ADMIN/EA: no filter — sees ALL tasks
        return <LaxreeDashboard />
      case 'executive':
        // Executive View is ADMIN+DIRECTOR+FOUNDER — EA gets redirected to dashboard
        if (!isAdminOrDirector) return <LaxreeDashboard />
        return <ExecutiveView />
      // approvals removed
      case 'tasks':
        // FOUNDER: STRICT filter — sees ONLY tasks they assigned
        if (isFounder) {
          return <LaxreeTasks assignedById={currentUserId} strictAssignedBy />
        }
        // DIRECTOR: legacy-NULL-compatible filter
        if (isDirector) {
          return <LaxreeTasks assignedById={currentUserId} />
        }
        // ADMIN/EA: no filter
        return <LaxreeTasks />
      case 'cancelled':
        if (isFounder) {
          return <LaxreeTasks showCancelled assignedById={currentUserId} strictAssignedBy />
        }
        if (isDirector) {
          return <LaxreeTasks showCancelled assignedById={currentUserId} />
        }
        return <LaxreeTasks showCancelled />
      case 'analytics':
        return <AnalyticsView />
      case 'performance':
        return <PerformanceView />
      case 'departments':
        return <DepartmentsView />
      case 'team':
        return <TeamView />
      case 'categories':
        return <CategoriesView />
      case 'employee-dashboard':
        return <LaxreeEmployeeDashboard />
      case 'emp-tasks':
        return <LaxreeEmpMyTasks />  // Employee's dedicated My Tasks page (separate from Dashboard)
      case 'ea-tasks':
        return <LaxreeEaMyTasks />          // EA's personal My Tasks page (Done/Revise/Reassign)
      case 'leaves':
        return <LaxreeLeaveManagement />
      case 'emp-leaves':
        return <LaxreeEmployeeLeaves />
      case 'attendance':
        // v24·0625: Standalone Attendance tab — live HRMS attendance (read-only)
        // + raise attendance query + view past queries. Wrapped in a page header
        // so it matches the layout of other top-level sidebar pages.
        return (
          <>
            <div className="ph">
              <div className="ph-left">
                <h2>My Attendance</h2>
                <p>Live HRMS attendance · read-only · raise queries for any discrepancy</p>
              </div>
            </div>
            <div className="page-accent" />
            <LaxreeAttendancePanel />
          </>
        )
      case 'salary-slip':
        // v24·0625-salary: Standalone Salary Slip tab — view/download HRMS-computed
        // salary slip as PDF (exact HRMS format). Read-only.
        return (
          <>
            <div className="ph">
              <div className="ph-left">
                <h2>My Salary Slip</h2>
                <p>Live HRMS payroll · read-only · download as PDF (exact HRMS format)</p>
              </div>
            </div>
            <div className="page-accent" />
            <LaxreeSalarySlipPanel />
          </>
        )
      case 'user-management':
        return <LaxreeUserManagement />
      case 'hr-report':
        return <LaxreeHrReport />
      case 'ai-assistant':
        return <LaxreeAiAssistant />
      // dirDep removed
      case 'exthold':
        return <LaxreeExtHold />
      case 'escalations':
        return <LaxreeEscalations />
      case 'monday':
      case 'workflows':
        // Monday Meeting is ADMIN+DIRECTOR — EA gets redirected to dashboard
        if (!isAdminOrDirector) return <LaxreeDashboard />
        return <LaxreeMonday />
      case 'notifications':
        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Notifications coming soon</div>
      case 'employees':
        return <EmployeesView />
      case 'projects':
        return <ProjectsView />
      case 'reports':
        return <ReportsView />
      case 'scorecards':
        return <ScorecardsView />
      case 'settings':
        return <SettingsView />
      default:
        return <LaxreeDashboard />
    }
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading…</div>}>
        {renderView()}
      </Suspense>
    </ErrorBoundary>
  )
}

/* ═══════════════════════════════════════════════════════════
   Executive View
   ═══════════════════════════════════════════════════════════ */
function ExecutiveView() {
  const { currentUserId } = useWorkflowStore()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading executive data…</div>

  const d = data as any
  const score = d?.performanceScore || d?.completionRate || 0
  const userPerf = Array.isArray(d?.userPerformance) ? d.userPerformance : []
  const deptMap = d?.deptMap || {}

  return (
    <div>
      <div className="ph">
        <div className="ph-left">
          <h2>Executive Command Center</h2>
          <p>C-Suite operational intelligence · Real-time business health overview</p>
        </div>
        <div className="ph-right">
          <span className="badge b-green">● Live Feed</span>
        </div>
      </div>
      <div className="page-accent" />

      <div className="g2">
        <div className="lcard">
          <div className="ch"><div className="ct">🏆 Business Health Score</div></div>
          <div className="cb" style={{ textAlign: 'center', padding: 30 }}>
            <div className="health-val" style={{ color: score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)' }}>{score}</div>
            <div className="health-lbl">Overall Score</div>
            <div className="health-status" style={{
              background: score >= 70 ? 'var(--green-l)' : score >= 40 ? 'var(--amber-l)' : 'var(--red-l)',
              color: score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)',
            }}>
              {score >= 70 ? 'Healthy' : score >= 40 ? 'Needs Attention' : 'Critical'}
            </div>
          </div>
        </div>
        <div className="ai-widget">
          <div className="ai-label"><div className="ai-pulse" />CEO AI Briefing</div>
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: score >= 70 ? 'var(--green)' : 'var(--amber)' }} />
            <div className="ai-text"><strong>Operations {score >= 70 ? 'stable' : 'need attention'}.</strong> Overall score at {score}%.</div>
          </div>

          <div className="ai-item">
            <div className="ai-bullet" style={{ background: 'var(--red)' }} />
            <div className="ai-text"><strong>{d?.overdueTasks || 0} overdue tasks</strong> require director intervention.</div>
          </div>
          {userPerf.length > 0 && (
            <div className="ai-item">
              <div className="ai-bullet" style={{ background: 'var(--g2)' }} />
              <div className="ai-text"><strong>Top performer:</strong> {userPerf[0]?.name} (score: {userPerf[0]?.score}).</div>
            </div>
          )}
        </div>
      </div>

      <div className="stat-grid sg-4" style={{ marginBottom: 14 }}>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--g2)' }} />
          <div className="sc-top"><div><div className="sc-label">Total Tasks</div><div className="sc-val c-gold">{d?.totalTasks || 0}</div></div><div className="sc-icon" style={{ background: 'var(--gb)' }}>📋</div></div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top"><div><div className="sc-label">Completed</div><div className="sc-val c-green">{d?.completedTasks || 0}</div></div><div className="sc-icon" style={{ background: 'var(--green-m)' }}>✅</div></div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--amber)' }} />
          <div className="sc-top"><div><div className="sc-label">In Progress</div><div className="sc-val c-amber">{d?.inProgressTasks || 0}</div></div><div className="sc-icon" style={{ background: 'var(--amber-m)' }}>🔄</div></div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top"><div><div className="sc-label">Overdue</div><div className="sc-val c-red">{d?.overdueTasks || 0}</div></div><div className="sc-icon" style={{ background: 'var(--red-m)' }}>⚠</div></div>
        </div>
      </div>

      <div className="lcard">
        <div className="ch"><div className="ct">🏢 Department Breakdown</div><span className="badge b-gold f10">Live</span></div>
        <div className="cb">
          {Object.entries(deptMap).map(([name, v]: [string, any]) => {
            const rate = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0
            return (
              <div key={name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{v.done}/{v.total} · {rate}%</span>
                </div>
                <div className="prog">
                  <div className="prog-bg" style={{ height: 8 }}>
                    <div className="prog-fill" style={{ width: `${rate}%`, background: rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--amber)' : 'var(--red)', height: '100%' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Analytics View
   ═══════════════════════════════════════════════════════════ */
function AnalyticsView() {
  const { currentUserId } = useWorkflowStore()

  const { data } = useQuery({
    queryKey: ['dashboard', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
  })

  const d = data as any
  const deptMap = d?.deptMap || {}
  const deptChartData = Object.entries(deptMap).map(([name, v]: [string, any]) => ({
    name, Total: v.total, Completed: v.done, Overdue: v.overdue,
  }))
  const catMap = d?.catMap || {}

  return (
    <div>
      <div className="ph">
        <div className="ph-left">
          <h2>Analytics &amp; Reports</h2>
          <p>Business intelligence &amp; operational reporting hub</p>
        </div>
        <div className="ph-right">
          <span className="badge b-gold">● Live</span>
        </div>
      </div>
      <div className="page-accent" />

      <div className="stat-grid sg-4" style={{ marginBottom: 16 }}>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--g2)' }} /><div className="sc-top"><div><div className="sc-label">Total Tasks</div><div className="sc-val c-gold">{d?.totalTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--green)' }} /><div className="sc-top"><div><div className="sc-label">Completed</div><div className="sc-val c-green">{d?.completedTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--amber)' }} /><div className="sc-top"><div><div className="sc-label">In Progress</div><div className="sc-val c-amber">{d?.inProgressTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--red)' }} /><div className="sc-top"><div><div className="sc-label">Overdue</div><div className="sc-val c-red">{d?.overdueTasks || 0}</div></div></div></div>
      </div>

      <div className="g2">
        <div className="lcard">
          <div className="ch"><div className="ct">📊 Department Performance</div><span className="badge b-gold f10">Live</span></div>
          <div className="cb">
            {deptChartData.length > 0 ? (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--b2)', borderRadius: 'var(--r-sm)', fontSize: 12 }} />
                    <Bar dataKey="Total" fill="var(--blue)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Completed" fill="var(--green)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Overdue" fill="var(--red)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty"><p>No data yet</p></div>
            )}
          </div>
        </div>
        <div className="lcard">
          <div className="ch"><div className="ct">📂 Category Distribution</div></div>
          <div className="cb">
            {Object.entries(catMap).length > 0 ? Object.entries(catMap).map(([name, v]: [string, any]) => {
              const rate = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0
              return (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{name}</span>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{v.done}/{v.total} · {rate}%</span>
                  </div>
                  <div className="prog">
                    <div className="prog-bg"><div className="prog-fill" style={{ width: `${rate}%`, background: rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--amber)' : 'var(--red)' }} /></div>
                  </div>
                </div>
              )
            }) : (
              <div className="empty"><p>No category data</p></div>
            )}
          </div>
        </div>
      </div>

      <div className="ai-widget" style={{ marginTop: 14 }}>
        <div className="ai-label"><div className="ai-pulse" />AI Insights</div>
        <div className="ai-item">
          <div className="ai-bullet" style={{ background: 'var(--g2)' }} />
          <div className="ai-text"><strong>Completion rate:</strong> {d?.completionRate || 0}% across all departments.</div>
        </div>
        <div className="ai-item">
          <div className="ai-bullet" style={{ background: 'var(--amber)' }} />
          <div className="ai-text"><strong>{d?.pendingTasks || 0} pending tasks</strong> awaiting action from team members.</div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Performance View
   ═══════════════════════════════════════════════════════════ */
function PerformanceView() {
  const { currentUserId } = useWorkflowStore()
  const { data } = useQuery({
    queryKey: ['dashboard', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
  })
  const d = data as any
  const userPerf = Array.isArray(d?.userPerformance) ? d.userPerformance : []
  const getInitials = (name: string) => name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const scoreColor = (score: number) => score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Performance Intelligence</h2><p>Deep-dive employee analytics &amp; comparison engine</p></div></div>
      <div className="page-accent" />
      <div className="mc-grid">
        {userPerf.map((u: any) => (
          <div key={u.id} className="mc">
            <div className="mc-top">
              <div className="av" style={{ width: 36, height: 36, fontSize: 13, background: `linear-gradient(135deg,${scoreColor(u.score)},${scoreColor(u.score)}88)` }}>{getInitials(u.name)}</div>
              <div className="mc-info"><div className="mc-name">{u.name}</div><div className="mc-role">{u.role} · {u.department || '—'}</div></div>
            </div>
            <div className="mc-stat"><span>Total Tasks</span><span>{u.total}</span></div>
            <div className="mc-stat"><span>Completed</span><span style={{ color: 'var(--green)' }}>{u.done}</span></div>
            <div className="mc-stat"><span>In Progress</span><span style={{ color: 'var(--blue)' }}>{u.inProgress}</span></div>
            <div className="mc-stat"><span>Overdue</span><span style={{ color: u.overdue > 0 ? 'var(--red)' : 'var(--t2)' }}>{u.overdue}</span></div>
            <div className="prog" style={{ marginTop: 8 }}><div className="prog-bg"><div className="prog-fill" style={{ width: `${u.completionRate}%`, background: scoreColor(u.score) }} /></div><span className="prog-lbl">{u.completionRate}%</span></div>
            <div className="mc-score"><span>Score:</span><span style={{ fontSize: 18, color: scoreColor(u.score) }}>{u.score}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Departments View
   ═══════════════════════════════════════════════════════════ */
function DepartmentsView() {
  const { currentUserId } = useWorkflowStore()
  const { data } = useQuery({
    queryKey: ['dashboard', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
  })
  const d = data as any
  const deptMap = d?.deptMap || {}
  const userPerf = Array.isArray(d?.userPerformance) ? d.userPerformance : []
  const deptColors: Record<string, string> = { 'Sales': 'var(--blue)', 'Back Office': 'var(--amber)', 'Accounts': 'var(--green)' }

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Departments</h2><p>Department structure and productivity analysis</p></div></div>
      <div className="page-accent" />
      <div className="mc-grid">
        {Object.entries(deptMap).map(([name, v]: [string, any]) => {
          const rate = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0
          const color = deptColors[name] || 'var(--g2)'
          const deptUsers = userPerf.filter((u: any) => u.department === name)
          return (
            <div key={name} className="dept-card" style={{ borderLeft: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏢</div>
                <div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>{name}</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>{deptUsers.length} members</div></div>
              </div>
              <div className="mc-stat"><span>Total Tasks</span><span>{v.total}</span></div>
              <div className="mc-stat"><span>Completed</span><span style={{ color: 'var(--green)' }}>{v.done}</span></div>
              <div className="mc-stat"><span>In Progress</span><span style={{ color: 'var(--blue)' }}>{v.inProgress}</span></div>
              <div className="mc-stat"><span>Overdue</span><span style={{ color: v.overdue > 0 ? 'var(--red)' : 'var(--t2)' }}>{v.overdue}</span></div>
              <div className="prog" style={{ marginTop: 8 }}><div className="prog-bg"><div className="prog-fill" style={{ width: `${rate}%`, background: color }} /></div><span className="prog-lbl">{rate}%</span></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Team View
   ═══════════════════════════════════════════════════════════ */
function TeamView() {
  const { currentUserId } = useWorkflowStore()
  const qc = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' })
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [teamTab, setTeamTab] = useState('active')

  const { data: rawUsers } = useQuery({ queryKey: ['users-list'], queryFn: () => fetch('/api/users').then(r => r.json()) })
  const users = Array.isArray(rawUsers) ? rawUsers : []
  const { data } = useQuery({ queryKey: ['dashboard', currentUserId], queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()) })
  const d = data as any
  const userPerf = Array.isArray(d?.userPerformance) ? d.userPerformance : []
  const getInitials = (name: string) => name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const roleBadge: Record<string, string> = { ADMIN: 'b-gold', DIRECTOR: 'b-purple', EA: 'b-blue', MANAGER: 'b-green', EMPLOYEE: 'b-gray' }

  // Fetch ALL users (including inactive) for full team view
  const { data: allUsersData } = useQuery({
    queryKey: ['all-users-team'],
    queryFn: () => fetch('/api/employees').then(r => r.json()),
  })
  const allUsers = Array.isArray((allUsersData as any)?.employees) ? (allUsersData as any).employees : []
  const activeUsers = Array.isArray(allUsers) ? allUsers.filter((u: any) => u.isActive) : []
  const inactiveUsers = Array.isArray(allUsers) ? allUsers.filter((u: any) => !u.isActive) : []

  const displayUsers = teamTab === 'active' ? activeUsers : teamTab === 'inactive' ? inactiveUsers : allUsers

  const addMutation = useMutation({
    mutationFn: (formData: typeof addForm) => fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
    }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to add employee')
      return res
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setShowAddDialog(false)
      setAddForm({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => fetch(`/api/employees?userId=${userId}`, {
      method: 'DELETE',
    }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to remove employee')
      return res
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setRemoveConfirm(null)
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => fetch('/api/employees', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isActive: true }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
    },
  })

  const tabs = [
    { id: 'active', label: 'Active', count: activeUsers.length },
    { id: 'inactive', label: 'Left / Inactive', count: inactiveUsers.length },
    { id: 'all', label: 'All', count: allUsers.length },
  ]

  return (
    <div>
      <div className="ph">
        <div className="ph-left"><h2>Team Members</h2><p>Team management — add new members or remove those who left</p></div>
        <div className="ph-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge b-gold">{activeUsers.length} Active</span>
          <button className="btn btn-gold" onClick={() => setShowAddDialog(true)}>+ Add Employee</button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab${teamTab === tab.id ? ' active' : ''}`}
            onClick={() => setTeamTab(tab.id)}>
            {tab.label}
            {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
          </div>
        ))}
      </div>

      <div className="mc-grid">
        {displayUsers.map((u: any) => {
          const perf = userPerf.find((p: any) => p.id === u.id)
          const score = perf?.score || 0
          const scoreCol = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'
          const isRemoving = removeConfirm === u.id

          return (
            <div key={u.id} className="mc" style={u.isActive ? {} : { opacity: 0.6, borderLeft: '3px solid var(--red)' }}>
              <div className="mc-top">
                <div className="av" style={{ width: 38, height: 38, fontSize: 14, background: u.isActive ? 'linear-gradient(135deg,var(--g1),var(--g3))' : 'var(--red)' }}>{getInitials(u.name)}</div>
                <div className="mc-info">
                  <div className="mc-name">{u.name}</div>
                  <div className="mc-role" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${roleBadge[u.role] || 'b-gray'}`} style={{ fontSize: 9, padding: '1px 6px' }}>{u.role}</span>
                    <span>{u.department || '—'}</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{u.email}</div>
              {u.designation && <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>{u.designation}</div>}
              {u.phone && <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>📞 {u.phone}</div>}
              {perf && u.isActive && (
                <>
                  <div className="mc-stat"><span>Tasks</span><span>{perf.total}</span></div>
                  <div className="mc-stat"><span>Completed</span><span>{perf.done}</span></div>
                  <div className="mc-stat"><span>Overdue</span><span style={{ color: perf.overdue > 0 ? 'var(--red)' : 'var(--t2)' }}>{perf.overdue}</span></div>
                  <div className="mc-score"><span>Score:</span><span style={{ fontSize: 18, color: scoreCol }}>{score}</span></div>
                </>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${u.isActive ? 'b-green' : 'b-red'}`} style={{ fontSize: 10 }}>
                  {u.isActive ? '● Active' : '● Left'}
                </span>
                {u.isActive && u.role !== 'ADMIN' && (
                  isRemoving ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-red btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => removeMutation.mutate(u.id)} disabled={removeMutation.isPending}>
                        {removeMutation.isPending ? 'Removing...' : '✓ Confirm Remove'}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => setRemoveConfirm(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={{ fontSize: 9, padding: '1px 6px', background: 'var(--red-l)', color: 'var(--red)',
                      border: '1px solid rgba(220,38,38,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => setRemoveConfirm(u.id)}>
                      ✕ Remove
                    </button>
                  )
                )}
                {!u.isActive && (
                  <button style={{ fontSize: 9, padding: '1px 6px', background: 'var(--green-l)', color: 'var(--green)',
                    border: '1px solid rgba(21,128,61,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                    onClick={() => reactivateMutation.mutate(u.id)} disabled={reactivateMutation.isPending}>
                    ↩ Reactivate
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {displayUsers.length === 0 && (
          <div className="lcard" style={{ gridColumn: '1 / -1' }}>
            <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>No team members found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Employee" to add a new team member</div>
            </div>
          </div>
        )}
      </div>

      {/* Add Employee Dialog */}
      {showAddDialog && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowAddDialog(false) }}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setShowAddDialog(false)}>✕</button>
            <div className="mt">Add New Employee</div>
            <div className="ms">Add a new team member to LAXREE</div>
            <div className="gold-divider" />
            <div className="form-row fr-2">
              <div className="fg">
                <label>Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" placeholder="Enter full name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
              <div className="fg">
                <label>Email <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" type="email" placeholder="Enter email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="fg">
                <label>Role</label>
                <select className="fi" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                  <option value="FOUNDER">Founder</option>
                  <option value="ADMIN">Admin</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EA">EA (Executive Assistant)</option>
                  <option value="DIRECTOR">Director</option>
                </select>
              </div>
              <div className="fg">
                <label>Department</label>
                <select className="fi" value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })}>
                  <option value="">Select Department</option>
                  <option value="Sales">Sales</option>
                  <option value="Account">Account</option>
                  <option value="HR">HR</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Back Office">Back Office</option>
                  <option value="Admin">Admin</option>
                  <option value="Management">Management</option>
                </select>
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="fg">
                <label>Designation</label>
                <input className="fi" placeholder="e.g. Sales Executive" value={addForm.designation} onChange={e => setAddForm({ ...addForm, designation: e.target.value })} />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input className="fi" placeholder="Enter phone number" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row fr-1">
              <div className="fg">
                <label>Location</label>
                <input className="fi" placeholder="e.g. Ajmer Office" value={addForm.location} onChange={e => setAddForm({ ...addForm, location: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={() => addMutation.mutate(addForm)} disabled={addMutation.isPending || !addForm.name || !addForm.email}>
                {addMutation.isPending ? 'Adding...' : '✓ Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Categories View
   ═══════════════════════════════════════════════════════════ */
function CategoriesView() {
  const { currentUserId } = useWorkflowStore()
  const { data } = useQuery({ queryKey: ['dashboard', currentUserId], queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()) })
  const d = data as any
  const catMap = d?.catMap || {}
  const catIcons: Record<string, string> = { 'Operations': '⚙️', 'Finance': '💰', 'HR': '👥', 'IT': '💻', 'Marketing': '📢', 'Sales': '📊', 'Admin': '📋', 'Compliance': '🔒' }

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Categories</h2><p>Task and workflow category management</p></div></div>
      <div className="page-accent" />
      <div className="stat-grid sg-4" style={{ marginBottom: 16 }}>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--g2)' }} /><div className="sc-top"><div><div className="sc-label">Total Categories</div><div className="sc-val c-gold">{Object.keys(catMap).length}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--blue)' }} /><div className="sc-top"><div><div className="sc-label">Total Tasks</div><div className="sc-val c-amber">{Object.values(catMap).reduce((s: number, v: any) => s + v.total, 0)}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--green)' }} /><div className="sc-top"><div><div className="sc-label">Completed</div><div className="sc-val c-green">{Object.values(catMap).reduce((s: number, v: any) => s + v.done, 0)}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--amber)' }} /><div className="sc-top"><div><div className="sc-label">In Progress</div><div className="sc-val c-amber">{Object.values(catMap).reduce((s: number, v: any) => s + v.inProgress, 0)}</div></div></div></div>
      </div>
      <div className="mc-grid">
        {Object.entries(catMap).map(([name, v]: [string, any]) => {
          const rate = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0
          return (
            <div key={name} className="dept-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{catIcons[name] || '📁'}</div>
                <div><div style={{ fontSize: 14, fontWeight: 800 }}>{name}</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>{v.total} tasks</div></div>
              </div>
              <div className="mc-stat"><span>Completed</span><span style={{ color: 'var(--green)' }}>{v.done}</span></div>
              <div className="mc-stat"><span>In Progress</span><span style={{ color: 'var(--blue)' }}>{v.inProgress}</span></div>
              <div className="prog" style={{ marginTop: 8 }}><div className="prog-bg"><div className="prog-fill" style={{ width: `${rate}%`, background: rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--amber)' : 'var(--red)' }} /></div><span className="prog-lbl">{rate}%</span></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Employees View
   ═══════════════════════════════════════════════════════════ */
function EmployeesView() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' })
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [empTab, setEmpTab] = useState('active')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => fetch('/api/employees').then(r => r.json()),
  })

  const addMutation = useMutation({
    mutationFn: (formData: typeof addForm) => fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
    }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to add employee')
      return res
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setShowAddDialog(false); setAddForm({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' }) },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => fetch(`/api/employees?userId=${userId}`, { method: 'DELETE' }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to remove')
      return res
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setRemoveConfirm(null) },
  })

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => fetch('/api/employees', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isActive: true }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }) },
  })

  const employees: any[] = Array.isArray((data as any)?.employees) ? (data as any).employees : []
  const stats = (data as any)?.stats || {}
  const activeEmps = Array.isArray(employees) ? employees.filter(e => e.isActive) : []
  const inactiveEmps = Array.isArray(employees) ? employees.filter(e => !e.isActive) : []
  const displayEmps = empTab === 'active' ? activeEmps : empTab === 'inactive' ? inactiveEmps : employees

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading employees…</div>

  const tabs = [
    { id: 'active', label: 'Active', count: activeEmps.length },
    { id: 'inactive', label: 'Left / Inactive', count: inactiveEmps.length },
    { id: 'all', label: 'All', count: employees.length },
  ]

  return (
    <div>
      <div className="ph">
        <div className="ph-left"><h2>Employees</h2><p>Employee directory and management</p></div>
        <div className="ph-right">
          <span className="badge b-gold" style={{ marginRight: 8 }}>{stats.active || 0} Active</span>
          <button className="btn btn-gold" onClick={() => setShowAddDialog(true)}>+ Add Employee</button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab${empTab === tab.id ? ' active' : ''}`}
            onClick={() => setEmpTab(tab.id)}>
            {tab.label}
            {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
          </div>
        ))}
      </div>

      <div className="lcard">
        <div className="ch"><div className="ct">👥 Employee Directory</div><span className="badge b-gold">{employees.length} employees</span></div>
        <div className="tw">
          <table className="ltable">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Designation</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {displayEmps.map((u: any) => {
                const isRemoving = removeConfirm === u.id
                return (
                  <tr key={u.id} style={!u.isActive ? { opacity: 0.6 } : {}}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>{u.email}</td>
                    <td><span className="badge b-gray" style={{ fontSize: 9 }}>{u.role}</span></td>
                    <td>{u.department || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--t3)' }}>{u.designation || '—'}</td>
                    <td><span className={`badge ${u.isActive ? 'b-green' : 'b-red'}`} style={{ fontSize: 9 }}>{u.isActive ? 'Active' : 'Left'}</span></td>
                    <td>
                      {u.isActive && u.role !== 'ADMIN' && (
                        isRemoving ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-red btn-sm" style={{ fontSize: 9, padding: '2px 6px' }}
                              onClick={() => removeMutation.mutate(u.id)} disabled={removeMutation.isPending}>
                              {removeMutation.isPending ? '...' : '✓ Confirm'}
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '2px 6px' }}
                              onClick={() => setRemoveConfirm(null)}>✕</button>
                          </div>
                        ) : (
                          <button style={{ fontSize: 9, padding: '2px 6px', background: 'var(--red-l)', color: 'var(--red)',
                            border: '1px solid rgba(220,38,38,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                            onClick={() => setRemoveConfirm(u.id)}>Remove</button>
                        )
                      )}
                      {!u.isActive && (
                        <button style={{ fontSize: 9, padding: '2px 6px', background: 'var(--green-l)', color: 'var(--green)',
                          border: '1px solid rgba(21,128,61,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                          onClick={() => reactivateMutation.mutate(u.id)} disabled={reactivateMutation.isPending}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddDialog && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowAddDialog(false) }}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setShowAddDialog(false)}>✕</button>
            <div className="mt">Add Employee</div>
            <div className="ms">Add a new team member to LAXREE</div>
            <div className="gold-divider" />
            <div className="form-row fr-2">
              <div className="fg"><label>Full Name <span style={{ color: 'var(--red)' }}>*</span></label><input className="fi" placeholder="Enter name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} /></div>
              <div className="fg"><label>Email <span style={{ color: 'var(--red)' }}>*</span></label><input className="fi" type="email" placeholder="Enter email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} /></div>
            </div>
            <div className="form-row fr-2">
              <div className="fg"><label>Role</label><select className="fi" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}><option value="FOUNDER">Founder</option><option value="ADMIN">Admin</option><option value="EMPLOYEE">Employee</option><option value="MANAGER">Manager</option><option value="EA">EA</option><option value="DIRECTOR">Director</option></select></div>
              <div className="fg"><label>Department</label><select className="fi" value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })}><option value="">Select</option><option value="Sales">Sales</option><option value="Account">Account</option><option value="HR">HR</option><option value="Coordinator">Coordinator</option><option value="Back Office">Back Office</option><option value="Admin">Admin</option><option value="Management">Management</option></select></div>
            </div>
            <div className="form-row fr-2">
              <div className="fg"><label>Designation</label><input className="fi" placeholder="e.g. Sales Executive" value={addForm.designation} onChange={e => setAddForm({ ...addForm, designation: e.target.value })} /></div>
              <div className="fg"><label>Phone</label><input className="fi" placeholder="Enter phone" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={() => addMutation.mutate(addForm)} disabled={addMutation.isPending || !addForm.name || !addForm.email}>{addMutation.isPending ? 'Adding...' : '✓ Add Employee'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Projects View
   ═══════════════════════════════════════════════════════════ */
function ProjectsView() {
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => fetch('/api/projects').then(r => r.json()) })
  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading projects…</div>
  const projects: any[] = Array.isArray(data) ? data : []

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Projects</h2><p>Project management and tracking</p></div><div className="ph-right"><span className="badge b-gold">{projects.length} Projects</span></div></div>
      <div className="page-accent" />
      <div className="mc-grid">
        {projects.map((p: any) => (
          <div key={p.id} className="mc">
            <div className="mc-top"><div><div className="mc-name">{p.name}</div><div className="mc-role">{p.status} · {p.department || '—'}</div></div></div>
            <div className="mc-stat"><span>Progress</span><span>{p.completionRate || 0}%</span></div>
          </div>
        ))}
        {projects.length === 0 && <div className="empty"><p>No projects yet</p></div>}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Reports View
   ═══════════════════════════════════════════════════════════ */
function ReportsView() {
  const { currentUserId } = useWorkflowStore()
  const { data } = useQuery({ queryKey: ['dashboard', currentUserId], queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()) })
  const d = data as any

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Reports</h2><p>Generated reports and export center</p></div></div>
      <div className="page-accent" />
      <div className="stat-grid sg-4" style={{ marginBottom: 16 }}>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--g2)' }} /><div className="sc-top"><div><div className="sc-label">Total Tasks</div><div className="sc-val c-gold">{d?.totalTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--green)' }} /><div className="sc-top"><div><div className="sc-label">Completed</div><div className="sc-val c-green">{d?.completedTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--amber)' }} /><div className="sc-top"><div><div className="sc-label">Pending</div><div className="sc-val c-amber">{d?.pendingTasks || 0}</div></div></div></div>
        <div className="sc"><div className="sc-accent" style={{ background: 'var(--red)' }} /><div className="sc-top"><div><div className="sc-label">Overdue</div><div className="sc-val c-red">{d?.overdueTasks || 0}</div></div></div></div>
      </div>
      <div className="lcard"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Detailed reports coming soon. Use Analytics for live data.</div></div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Scorecards View
   ═══════════════════════════════════════════════════════════ */
function ScorecardsView() {
  const { currentUserId } = useWorkflowStore()
  const { data } = useQuery({ queryKey: ['dashboard', currentUserId], queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()) })
  const d = data as any
  const userPerf = Array.isArray(d?.userPerformance) ? d.userPerformance : []

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Scorecards</h2><p>Employee performance scorecard overview</p></div></div>
      <div className="page-accent" />
      <div className="lcard">
        <div className="ch"><div className="ct">📊 Team Scorecards</div></div>
        <div className="cb">
          {userPerf.length === 0 ? <div className="empty"><p>No scorecard data yet</p></div> : (
            <table className="ltable">
              <thead><tr><th>Member</th><th>Department</th><th>Tasks</th><th>Done</th><th>Score</th></tr></thead>
              <tbody>
                {userPerf.map((u: any) => (
                  <tr key={u.id}><td style={{ fontWeight: 600 }}>{u.name}</td><td>{u.department || '—'}</td><td>{u.total}</td><td>{u.done}</td><td style={{ fontWeight: 800, color: u.score >= 70 ? 'var(--green)' : u.score >= 40 ? 'var(--amber)' : 'var(--red)' }}>{u.score}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Settings View
   ═══════════════════════════════════════════════════════════ */
function SettingsView() {
  const { currentUser, darkMode, toggleDarkMode } = useWorkflowStore()

  return (
    <div>
      <div className="ph"><div className="ph-left"><h2>Settings</h2><p>Application configuration and preferences</p></div></div>
      <div className="page-accent" />
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">👤 Account</div></div>
        <div className="cb">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>Name</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{currentUser?.name || '—'}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>Role</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{currentUser?.role || '—'}</div></div>
          </div>
        </div>
      </div>
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">🎨 Appearance</div></div>
        <div className="cb">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--b1)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 700 }}>Dark Mode</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>Switch between light and dark theme</div></div>
            <button className={`dark-toggle ${darkMode ? 'on' : ''}`} onClick={toggleDarkMode} title="Toggle dark mode" />
          </div>
        </div>
      </div>
      <div className="lcard">
        <div className="ch"><div className="ct">ℹ️ About LAXREE Enterprise Suite</div></div>
        <div className="cb">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>Version</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>2.0.0</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>Environment</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Production</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>License</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Enterprise</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>Support</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>support@laxree.com</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Main Page Export
   ═══════════════════════════════════════════════════════════ */
export default function HomePage() {
  // v24·0625-refresh-fix: read _hasHydrated so we don't render the login gate
  // until persist has finished rehydrating auth state from localStorage.
  // Without this, every refresh showed the login page for a split second
  // (because the store starts with currentUser=null until persist loads it),
  // even though the user was actually logged in.
  const { darkMode, currentUser, _hasHydrated } = useWorkflowStore()

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode)
    }
  }, [darkMode])

  // v24·0625-refresh-fix: while persist hasn't rehydrated yet, render a tiny
  // neutral placeholder so we don't flash the login screen on every refresh.
  // This is only visible for ~1 frame on slow devices; on most clients it's
  // imperceptible because persist hydrates synchronously from localStorage.
  if (!_hasHydrated) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: '#fffcf2',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8B6914', fontSize: 13, fontWeight: 600, letterSpacing: 0.4,
      }}>
        LAXREE
      </div>
    )
  }

  // Login gate — show login page if not authenticated
  if (!currentUser) {
    return <LaxreeLogin />
  }

  return (
    <ErrorBoundary>
      <div style={{ background: '#f8fafc', minHeight: '100vh', transition: 'background .3s' }}>
        <LaxreeTopbar />
        <LaxreeSidebar />
        <main className="main-area">
          <ActiveView />
        </main>
        <LaxreeCreateTask />
        <LaxreeCommandPalette />
        <LaxreeNotifPanel />
        {/* Global Task Detail Modal — renders when selectedTaskId is set in the store.
            Works on ANY page (Admin/EA/Employee), fixing the bug where employees
            clicking "View Details" saw nothing happen. */}
        <LaxreeTaskDetail />
        {/* Push-notification helper — requests permission, registers SW, shows
            browser notifications when new task-assignment notifications arrive. */}
        <LaxreePushNotifications />
        <div id="toastArea" />
      </div>
    </ErrorBoundary>
  )
}
