'use client'

// Build: 2026-06-17-v7 — Employee "My Tasks" page (separate from Dashboard)
//
// Why this exists:
//   Previously, clicking "My Tasks" in the sidebar just opened the same
//   LaxreeEmployeeDashboard component with the Tasks tab auto-selected.
//   Worse, that Tasks tab ONLY showed tasks with a due date (today/upcoming/overdue),
//   so tasks without a due date were invisible to the employee.
//
//   This dedicated page fixes both issues:
//     1. It's a separate, focused page (not the dashboard with a different tab).
//     2. It shows ALL tasks assigned to the employee — including those without
//        a due date — via an "All" tab.
//
//   Employees get a READ-ONLY view of their tasks. They cannot mark tasks as
//   Done or Revise (that's admin/EA only), but they can:
//     - View all tasks assigned to them (as owner OR step assignee)
//     - Filter by Today / Upcoming / Overdue / All
//     - Search and filter by priority
//     - Click a task to open the detail panel and see steps

import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useEffect } from 'react'

const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  IN_PROGRESS: { bg: '#DBEAFE', color: '#1D4ED8', label: 'In Progress' },
  COMPLETED: { bg: '#DCFCE7', color: '#15803D', label: 'Done' },
  CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  ON_HOLD: { bg: '#EDE9FE', color: '#6D28D9', label: 'On Hold' },
  ESCALATED: { bg: '#FEE2E2', color: '#DC2626', label: 'Escalated' },
  EXTERNAL_HOLD: { bg: '#FFF7ED', color: '#C2410C', label: 'Ext Hold' },
  IN_REVIEW: { bg: '#FEF3C7', color: '#92400E', label: 'In Review' },
  DRAFT: { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
}

const priorityBadge: Record<string, { bg: string; color: string; label: string }> = {
  CRITICAL: { bg: '#FFF1F2', color: '#E11D48', label: '🔴 Critical' },
  HIGH: { bg: '#FEF2F2', color: '#DC2626', label: '🟠 High' },
  MEDIUM: { bg: '#FFFBEB', color: '#D97706', label: '🟡 Medium' },
  LOW: { bg: '#EFF6FF', color: '#2563EB', label: '🔵 Low' },
}

type EmpTab = 'today' | 'upcoming' | 'complete' | 'overdue' | 'all'

export function LaxreeEmpMyTasks() {
  const { currentUserId, currentUserName, setActivePage, setSelectedTaskId } = useWorkflowStore()

  // Tab navigation — 'all' is the new tab that shows tasks without due dates too
  const [taskTab, setTaskTab] = useState<EmpTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  // When arriving from a "My Tasks" link with no due date set anywhere, default to 'all'
  useEffect(() => {
    // default to 'all' so user immediately sees every task assigned to them
    setTaskTab('all')
  }, [])

  // Fetch tasks where employee is owner OR step assignee
  // The API merges both sets and dedupes
  const { data: tasksData = [], isLoading } = useQuery({
    queryKey: ['emp-my-tasks', currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?ownerId=${currentUserId}&assignedTo=${currentUserId}`)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    enabled: !!currentUserId,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Helper: check if a date is today / upcoming / overdue (date-only comparison, no overlap)
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

  const allTasks = Array.isArray(tasksData) ? tasksData : []

  // Apply search + priority filter first
  let filtered = allTasks
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.owner?.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    )
  }
  if (priorityFilter) {
    filtered = filtered.filter((t: any) => t.priority === priorityFilter)
  }

  // Compute tab buckets
  // 'all' includes everything (including tasks without a due date and including COMPLETED/CANCELLED for context)
  const activeFiltered = filtered.filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  // Today: tasks WITHOUT a dueDate (need attention today) OR with dueDate today
  const todayTasks = activeFiltered.filter((t: any) => !t.dueDate || isToday(t.dueDate))
  const upcomingTasks = activeFiltered.filter((t: any) => t.dueDate && isUpcoming(t.dueDate))
  const overdueTasks = activeFiltered.filter((t: any) => t.dueDate && isOverdue(t.dueDate))
  // 'complete' = tasks that have been marked COMPLETED (so employees can review past work)
  const completedTasks = filtered.filter((t: any) => t.status === 'COMPLETED')
  // 'all' = active (non-completed/cancelled) tasks regardless of due date
  const allTabTasks = activeFiltered

  const tabTasks =
    taskTab === 'today' ? todayTasks
    : taskTab === 'upcoming' ? upcomingTasks
    : taskTab === 'complete' ? completedTasks
    : taskTab === 'overdue' ? overdueTasks
    : allTabTasks

  const tabs: { id: EmpTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: allTabTasks.length },
    { id: 'today', label: 'Today', count: todayTasks.length },
    { id: 'complete', label: 'Completed', count: completedTasks.length },
    { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length },
    { id: 'overdue', label: 'Overdue', count: overdueTasks.length },
  ]

  const userInitials = getInitials(currentUserName || 'E')
  const userAvatarBg = avatarColor(currentUserName || 'Employee')

  return (
    <>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="av" style={{ width: 42, height: 42, fontSize: 16, background: userAvatarBg }}>
            {userInitials}
          </div>
          <div>
            <h2>My Tasks</h2>
            <p>Tasks assigned to you — {currentUserName || 'Employee'}</p>
          </div>
        </div>
        <div className="ph-right">
          <button className="btn" style={{ fontSize: 11, padding: '6px 14px', background: 'rgba(109,40,217,.1)', color: '#6D28D9', fontWeight: 800, border: '1px solid rgba(109,40,217,.3)' }}
            onClick={() => setActivePage('ai-assistant')}>
            🤖 AI Assistant
          </button>
          <button className="btn btn-gold" onClick={() => setActivePage('employee-dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Read-only notice */}
      <div style={{
        padding: '10px 14px', marginBottom: 12, borderRadius: 8,
        background: 'rgba(109,40,217,.06)', border: '1px solid rgba(109,40,217,.15)',
        display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#6D28D9', fontWeight: 700,
      }}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <span>
          You can view all tasks assigned to you here. To mark a task as Done or Revise, contact your Admin or EA.
          Click any task to see its steps and full details.
        </span>
      </div>

      {/* Search + Priority Filter */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search" style={{ maxWidth: 400, flex: '1 1 280px', minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t4)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search my tasks by name, department, owner..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: 'var(--t1)', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Priority</label>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid var(--b1)',
              background: 'var(--bg)', color: 'var(--t1)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">🔴 Critical</option>
            <option value="HIGH">🟠 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">🔵 Low</option>
          </select>
        </div>

        {(priorityFilter || searchQuery) && (
          <button
            onClick={() => { setPriorityFilter(''); setSearchQuery('') }}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid var(--b1)',
              background: 'var(--bg2)', color: 'var(--t2)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Clear
          </button>
        )}

        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginLeft: 'auto' }}>
          Showing {tabTasks.length} of {allTasks.length} tasks
        </span>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab${taskTab === tab.id ? ' active' : ''}`}
            onClick={() => setTaskTab(tab.id)}>
            {tab.label}
            {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
          </div>
        ))}
      </div>

      {/* Task Cards */}
      {isLoading ? (
        <div className="lcard">
          <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Loading your tasks…</div>
          </div>
        </div>
      ) : tabTasks.length === 0 ? (
        <div className="lcard">
          <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {taskTab === 'all'
                ? 'No tasks assigned to you yet'
                : taskTab === 'today'
                ? 'No tasks due today'
                : taskTab === 'upcoming'
                ? 'No upcoming tasks'
                : taskTab === 'complete'
                ? 'No completed tasks yet'
                : 'No overdue tasks'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {taskTab === 'all'
                ? 'Tasks assigned to you by Admin or EA will appear here.'
                : taskTab === 'today'
                ? 'Switch to the "All" tab to see every task assigned to you.'
                : taskTab === 'upcoming'
                ? 'Switch to the "All" tab to see every task assigned to you.'
                : taskTab === 'complete'
                ? 'Tasks you finish will appear here for your records.'
                : 'Great job staying on track! Switch to "All" to see all your tasks.'}
            </div>
            {taskTab !== 'all' && (
              <button
                className="btn btn-gold"
                style={{ marginTop: 12, fontSize: 12, padding: '6px 16px' }}
                onClick={() => setTaskTab('all')}
              >
                View All My Tasks →
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tabTasks.map((task: any) => {
            const sStyle = statusStyle[task.status] || statusStyle.PENDING
            const pBadge = priorityBadge[task.priority] || priorityBadge.MEDIUM
            const stepsTotal = task.taskSteps?.length || 0
            const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
            const owner = task.owner
            const isOwner = task.ownerId === currentUserId
            const isStepAssignee = !isOwner && task.taskSteps?.some((s: any) => s.assigneeId === currentUserId)

            // Highlight overdue tasks even in "All" tab
            const taskIsOverdue = task.dueDate && isOverdue(task.dueDate) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED'

            return (
              <div key={task.id} className="lcard" style={{
                cursor: 'pointer',
                transition: 'all .15s',
                borderLeft: taskIsOverdue ? '3px solid var(--red)' : isOwner ? '3px solid var(--g2)' : '3px solid #6D28D9',
              }}
                onClick={() => setSelectedTaskId(task.id)}>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Avatar */}
                    <div className="av" style={{ width: 38, height: 38, fontSize: 13, background: avatarColor(owner?.name || 'T'), flexShrink: 0 }}>
                      {getInitials(owner?.name || 'T')}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--t1)' }}>{task.title}</span>
                        <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: pBadge.bg, color: pBadge.color, fontWeight: 700 }}>
                          {pBadge.label}
                        </span>
                        <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: sStyle.bg, color: sStyle.color, fontWeight: 700 }}>
                          {sStyle.label}
                        </span>
                        {isStepAssignee && (
                          <span className="badge" style={{ fontSize: 8, padding: '1px 6px', background: 'rgba(109,40,217,.1)', color: '#6D28D9', fontWeight: 700 }}>
                            ASSIGNED STEP
                          </span>
                        )}
                        {isOwner && (
                          <span className="badge" style={{ fontSize: 8, padding: '1px 6px', background: 'rgba(180,83,9,.1)', color: '#B45309', fontWeight: 700 }}>
                            OWNER
                          </span>
                        )}
                        {task.reviseCount > 0 && (
                          <span className="badge" style={{
                            fontSize: 8, padding: '1px 6px',
                            background: task.reviseCount >= 3 ? 'var(--red-l)' : 'var(--amber-l)',
                            color: task.reviseCount >= 3 ? 'var(--red)' : 'var(--amber)',
                            fontWeight: 800,
                          }} title={`This task has been revised ${task.reviseCount} time(s). Each revision reduces your work score.`}>
                            ↩ REVISED ×{task.reviseCount}
                          </span>
                        )}
                      </div>

                      {/* Task description (if any) */}
                      {task.description && (
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6, lineHeight: 1.5 }}>
                          {task.description.length > 140 ? task.description.slice(0, 140) + '…' : task.description}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--t3)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>
                          {isOwner ? 'You (Owner)' : owner?.name || 'Unassigned'}
                        </span>
                        {task.department && <span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{task.department}</span>}
                        {task.category && <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--amber-l)', color: 'var(--amber)' }}>{task.category}</span>}
                        {task.dueDate ? (
                          <span style={taskIsOverdue ? { color: 'var(--red)', fontWeight: 700 } : {}}>
                            📅 Due: {new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {taskIsOverdue && ' (Overdue)'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--t4)', fontStyle: 'italic' }}>📅 No due date</span>
                        )}
                      </div>

                      {/* Step Progress */}
                      {stepsTotal > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <div className="prog" style={{ flex: 1, minWidth: 60 }}>
                            <div className="prog-bg" style={{ height: 6 }}>
                              <div className="prog-fill" style={{
                                width: `${stepsTotal > 0 ? (stepsDone / stepsTotal * 100) : 0}%`,
                                background: stepsDone === stepsTotal ? 'var(--green)' : 'var(--g2)',
                                height: '100%',
                              }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: stepsDone === stepsTotal ? 'var(--green)' : 'var(--t2)' }}>
                            {stepsDone}/{stepsTotal} steps
                          </span>
                          {/* Highlight which steps are assigned to me */}
                          {isStepAssignee && (
                            <span style={{ fontSize: 9, color: '#6D28D9', fontWeight: 700 }}>
                              (you: {task.taskSteps?.filter((s: any) => s.assigneeId === currentUserId).length || 0} step{(task.taskSteps?.filter((s: any) => s.assigneeId === currentUserId).length || 0) !== 1 ? 's' : ''})
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action area — view details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        className="btn btn-xs"
                        style={{
                          background: 'var(--blue-l)', color: 'var(--blue)',
                          border: '1.5px solid var(--blue)', fontWeight: 800,
                          padding: '5px 14px', fontSize: 11,
                        }}
                        onClick={() => setSelectedTaskId(task.id)}
                        title="View task details"
                      >
                        👁 View Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary footer */}
      <div style={{
        marginTop: 16, padding: '10px 14px', borderRadius: 8,
        background: 'var(--bg2)', border: '1px solid var(--b1)',
        fontSize: 11, color: 'var(--t3)', textAlign: 'center', fontWeight: 600,
      }}>
        📊 Total tasks: <strong style={{ color: 'var(--t1)' }}>{allTasks.length}</strong>
        {' · '}Active: <strong style={{ color: 'var(--g2)' }}>{allTabTasks.length}</strong>
        {' · '}Today: <strong style={{ color: 'var(--g2)' }}>{todayTasks.length}</strong>
        {' · '}Upcoming: <strong style={{ color: 'var(--blue)' }}>{upcomingTasks.length}</strong>
        {' · '}Complete: <strong style={{ color: 'var(--green)' }}>{completedTasks.length}</strong>
        {' · '}Overdue: <strong style={{ color: 'var(--red)' }}>{overdueTasks.length}</strong>
      </div>
    </>
  )
}
