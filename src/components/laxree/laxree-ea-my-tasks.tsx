'use client'

// Build: 2026-06-16-v6 — EA "My Tasks" with Done / Revise / Reassign / Steps controls

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useRef, useEffect } from 'react'

/**
 * EA "My Tasks" page.
 *
 * Shows tasks where the EA is:
 *   - The owner (task assigned to EA), OR
 *   - A step assignee (task delegated to EA for a specific step)
 *
 * EA can:
 *   - Mark a task Done (COMPLETED)
 *   - Revise a task (reopen with reason + next date)
 *   - Reassign a task they own to another employee
 *   - Open the task detail panel to complete steps
 */

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
}

const priorityBadge: Record<string, { bg: string; color: string; label: string }> = {
  CRITICAL: { bg: '#FFF1F2', color: '#E11D48', label: '🔴 Critical' },
  HIGH: { bg: '#FEF2F2', color: '#DC2626', label: '🟠 High' },
  MEDIUM: { bg: '#FFFBEB', color: '#D97706', label: '🟡 Medium' },
  LOW: { bg: '#EFF6FF', color: '#2563EB', label: '🔵 Low' },
}

export function LaxreeEaMyTasks() {
  const { currentUserId, currentUserName, addToast, setSelectedTaskId, setCreateTaskOpen, setActivePage } = useWorkflowStore()
  const queryClient = useQueryClient()

  // Today / Upcoming / Overdue / Complete / All filter — 'all' is the default and shows every active task regardless of due date
  const [taskTab, setTaskTab] = useState<'today' | 'upcoming' | 'complete' | 'overdue' | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  // Revise modal state
  const [reviseTask, setReviseTask] = useState<any>(null)
  const [reviseReason, setReviseReason] = useState('')
  const [reviseNextDate, setReviseNextDate] = useState('')

  // Reassign modal state
  const [reassignTask, setReassignTask] = useState<any>(null)
  const [reassignTo, setReassignTo] = useState<string>('')

  // Confirm action state
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'done' | 'cancel' } | null>(null)

  // Fetch all tasks (EA can see all, then filter to "mine")
  const { data: tasks = [] } = useQuery({
    queryKey: ['ea-my-tasks', currentUserId],
    queryFn: async () => {
      const res = await fetch('/api/tasks')
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Fetch users (employees list) for reassignment
  const { data: users = [] } = useQuery({
    queryKey: ['ea-users-list'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  // Helper: check if a date is today / upcoming / overdue (date-only comparison)
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

  // Filter to "my tasks" — tasks where EA is owner OR step assignee
  const myTasks = (Array.isArray(tasks) ? tasks : []).filter((t: any) => {
    if (!currentUserId) return false
    return t.ownerId === currentUserId || t.taskSteps?.some((s: any) => s.assigneeId === currentUserId)
  })

  // Apply search + priority filter first, then date-tab filter
  let filtered = myTasks
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.owner?.name?.toLowerCase().includes(q)
    )
  }
  if (priorityFilter) {
    filtered = filtered.filter((t: any) => t.priority === priorityFilter)
  }

  // Today: tasks WITHOUT a dueDate (need attention today) OR with dueDate today
  const todayTasks = filtered.filter((t: any) =>
    t.status !== 'COMPLETED' && t.status !== 'CANCELLED' &&
    (!t.dueDate || isToday(t.dueDate))
  )
  const upcomingTasks = filtered.filter((t: any) => t.dueDate && isUpcoming(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const overdueTasks = filtered.filter((t: any) => t.dueDate && isOverdue(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  // 'complete' = tasks that have been marked COMPLETED
  const completedTasks = filtered.filter((t: any) => t.status === 'COMPLETED')
  // 'all' = every active task (excludes COMPLETED/CANCELLED) regardless of whether it has a dueDate
  const allTabTasks = filtered.filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')

  const tabTasks =
    taskTab === 'today' ? todayTasks
    : taskTab === 'upcoming' ? upcomingTasks
    : taskTab === 'complete' ? completedTasks
    : taskTab === 'overdue' ? overdueTasks
    : allTabTasks

  const tabs = [
    { id: 'all' as const, label: 'All', count: allTabTasks.length },
    { id: 'today' as const, label: 'Today', count: todayTasks.length },
    { id: 'complete' as const, label: 'Completed', count: completedTasks.length },
    { id: 'upcoming' as const, label: 'Upcoming', count: upcomingTasks.length },
    { id: 'overdue' as const, label: 'Overdue', count: overdueTasks.length },
  ]

  // Mutations
  const completeMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ea-my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task completed! ✓')
      setConfirmAction(null)
    },
  })

  const reviseMutation = useMutation({
    mutationFn: ({ id, reason, nextDate }: { id: string; reason: string; nextDate: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'IN_PROGRESS',
          reviseReason: reason || null,
          reviseNextDate: nextDate || null,
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ea-my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task revised with new date')
      setReviseTask(null)
      setReviseReason('')
      setReviseNextDate('')
    },
  })

  const reassignMutation = useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ea-my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task reassigned successfully')
      setReassignTask(null)
      setReassignTo('')
    },
  })

  return (
    <>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>My Tasks</h2>
          <p>Tasks assigned to you — complete, revise, or reassign to your team</p>
        </div>
        <div className="ph-right">
          <button className="btn btn-gold" onClick={() => setCreateTaskOpen(true)}>+ Create Task</button>
        </div>
      </div>
      <div className="page-accent" />

      {/* v24·0625: Leave Management quick-access card for EA — per user requirement
          "EA dashboard ke 'My Tasks' section me Leave Management add karna hai".
          This is purely a navigation card — no data is created/modified here. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <button
          onClick={() => setActivePage('leaves')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            background: 'var(--card)', border: '1px solid var(--b1)', borderRadius: 'var(--r)',
            cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
            boxShadow: 'var(--s1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--g2)'; e.currentTarget.style.boxShadow = 'var(--s2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1)'; e.currentTarget.style.boxShadow = 'var(--s1)' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'rgba(184,134,11,.12)', color: 'var(--g2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Leave Management</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              View &amp; approve/reject leave applications
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)', flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Employee leave view — EA can also see their own leave applications */}
        <button
          onClick={() => setActivePage('emp-leaves')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            background: 'var(--card)', border: '1px solid var(--b1)', borderRadius: 'var(--r)',
            cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
            boxShadow: 'var(--s1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--g2)'; e.currentTarget.style.boxShadow = 'var(--s2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1)'; e.currentTarget.style.boxShadow = 'var(--s1)' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'rgba(29,78,216,.1)', color: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>My Leave Applications</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              Apply for leave &amp; track your application status
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)', flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Search + Priority Filter */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search" style={{ maxWidth: 400, flex: '1 1 280px', minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t4)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search my tasks..."
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

        {priorityFilter && (
          <button
            onClick={() => setPriorityFilter('')}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tabTasks.length === 0 ? (
          <div className="lcard">
            <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {taskTab === 'all'
                  ? 'No active tasks assigned to you'
                  : taskTab === 'complete'
                  ? 'No completed tasks yet'
                  : `No ${taskTab} tasks`}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {taskTab === 'all'
                  ? 'Tasks assigned to you will appear here. Create one to get started.'
                  : taskTab === 'today'
                  ? 'You have no tasks due today — switch to "All" to see every task.'
                  : taskTab === 'upcoming'
                  ? 'No upcoming tasks scheduled — switch to "All" to see every task.'
                  : taskTab === 'complete'
                  ? 'Tasks you finish will appear here for your records.'
                  : 'No overdue tasks — great job staying on track! Switch to "All" to see every task.'}
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
        ) : tabTasks.map((task: any) => {
          const sStyle = statusStyle[task.status] || statusStyle.PENDING
          const pBadge = priorityBadge[task.priority] || priorityBadge.MEDIUM
          const stepsTotal = task.taskSteps?.length || 0
          const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
          const owner = task.owner
          const isOwner = task.ownerId === currentUserId
          const isStepAssignee = !isOwner && task.taskSteps?.some((s: any) => s.assigneeId === currentUserId)

          return (
            <div key={task.id} className="lcard" style={{ cursor: 'pointer', transition: 'all .15s' }}
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
                      {task.reviseCount > 0 && (
                        <span className="badge" style={{
                          fontSize: 8, padding: '1px 6px',
                          background: task.reviseCount >= 3 ? 'var(--red-l)' : 'var(--amber-l)',
                          color: task.reviseCount >= 3 ? 'var(--red)' : 'var(--amber)',
                          fontWeight: 800,
                        }} title={`Revised ${task.reviseCount} time(s)`}>
                          ↩ REVISED ×{task.reviseCount}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--t3)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{owner?.name || 'Unassigned'}</span>
                      {task.department && <span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{task.department}</span>}
                      {task.category && <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--amber-l)', color: 'var(--amber)' }}>{task.category}</span>}
                      {task.dueDate && (
                        <span style={(taskTab === 'overdue' || (task.dueDate && isOverdue(task.dueDate) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')) ? { color: 'var(--red)', fontWeight: 700 } : {}}>
                          Due: {new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          {(taskTab === 'overdue' || (task.dueDate && isOverdue(task.dueDate) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')) && ' (Overdue)'}
                        </span>
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
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                      <>
                        {/* Steps button (if has steps and not all done) */}
                        {stepsTotal > 0 && stepsDone < stepsTotal && (
                          <button
                            className="btn btn-xs"
                            style={{ background: 'var(--blue-l)', color: 'var(--blue)', border: '1.5px solid var(--blue)', fontWeight: 800, padding: '4px 12px' }}
                            onClick={() => setSelectedTaskId(task.id)}
                            title="Complete steps"
                          >
                            ☰ Steps {stepsDone}/{stepsTotal}
                          </button>
                        )}

                        {/* Done button */}
                        <button
                          className="btn btn-xs"
                          style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1.5px solid var(--green)', fontWeight: 800, padding: '4px 12px' }}
                          onClick={() => setConfirmAction({ id: task.id, action: 'done' })}
                          disabled={completeMutation.isPending}
                          title="Mark as Done"
                        >
                          ✓ Done
                        </button>

                        {/* Revise button */}
                        <button
                          className="btn btn-xs"
                          style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)', fontWeight: 700, padding: '4px 10px' }}
                          onClick={() => { setReviseTask(task); setReviseReason(''); setReviseNextDate('') }}
                          title="Revise Task"
                        >
                          ✏ Revise
                        </button>

                        {/* Reassign button — only if EA is the owner */}
                        {isOwner && (
                          <button
                            className="btn btn-xs"
                            style={{ background: 'rgba(109,40,217,.1)', color: '#6D28D9', border: '1px solid rgba(109,40,217,.3)', fontWeight: 700, padding: '4px 10px' }}
                            onClick={() => { setReassignTask(task); setReassignTo('') }}
                            title="Reassign to another employee"
                          >
                            ↗ Reassign
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ───────── Revise Modal ───────── */}
      {reviseTask && (
        <div className="overlay show" onClick={() => setReviseTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="mx" onClick={() => setReviseTask(null)}>✕</button>
            <div className="mt" style={{ marginBottom: 14 }}>Revise Task</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14, fontWeight: 600 }}>
              {reviseTask.title}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Reason for revision
              </label>
              <textarea
                value={reviseReason}
                onChange={e => setReviseReason(e.target.value)}
                placeholder="Why is this task being revised?"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--b1)', borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Next target date <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="date"
                value={reviseNextDate}
                onChange={e => setReviseNextDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--b1)', borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5 }}
              />
              <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
                Task will move out of Today and appear in Upcoming/Overdue based on this date.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setReviseTask(null)}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={!reviseNextDate || reviseMutation.isPending}
                onClick={() => reviseMutation.mutate({ id: reviseTask.id, reason: reviseReason, nextDate: reviseNextDate })}
              >
                {reviseMutation.isPending ? 'Saving...' : 'Revise Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Reassign Modal ───────── */}
      {reassignTask && (
        <div className="overlay show" onClick={() => setReassignTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="mx" onClick={() => setReassignTask(null)}>✕</button>
            <div className="mt" style={{ marginBottom: 14 }}>Reassign Task</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14, fontWeight: 600 }}>
              {reassignTask.title}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Assign to <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <select
                value={reassignTo}
                onChange={e => setReassignTo(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--b1)', borderRadius: 6,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, background: 'var(--bg)', color: 'var(--t1)',
                }}
              >
                <option value="">Select an employee…</option>
                {Array.isArray(users) && users
                  .filter((u: any) => u.id !== currentUserId) // don't show self
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.department ? `· ${u.department}` : ''} ({u.role})
                    </option>
                  ))}
              </select>
              <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
                The task will be moved out of your My Tasks list and into the selected employee&apos;s dashboard.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setReassignTask(null)}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={!reassignTo || reassignMutation.isPending}
                onClick={() => reassignMutation.mutate({ id: reassignTask.id, ownerId: reassignTo })}
              >
                {reassignMutation.isPending ? 'Reassigning...' : 'Reassign Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Confirm Done Modal ───────── */}
      {confirmAction && confirmAction.action === 'done' && (
        <div className="overlay show" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="mx" onClick={() => setConfirmAction(null)}>✕</button>
            <div className="mt" style={{ marginBottom: 14 }}>Mark Task as Done?</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
              This will mark the task as COMPLETED. You can revise it later if needed.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate({ id: confirmAction.id })}
              >
                {completeMutation.isPending ? 'Marking...' : '✓ Confirm Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
