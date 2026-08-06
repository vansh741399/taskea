'use client'

// Build: 2026-06-18-v10 — 'All' tab now shows EVERY task (incl. COMPLETED/CANCELLED). Added Recent Activity section.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useRef, useEffect } from 'react'

interface LaxreeTasksProps {
  showCancelled?: boolean
  showExtHold?: boolean
  showEscalations?: boolean
  assignedById?: string  // When set (Director/Founder view), only tasks assigned by this user are shown
  strictAssignedBy?: boolean  // When true (FOUNDER), only tasks with assignedById === X (no NULL fallback)
}

export function LaxreeTasks({ showCancelled, showExtHold, showEscalations, assignedById, strictAssignedBy }: LaxreeTasksProps) {
  const { currentUser, taskTab, setTaskTab, setSelectedTaskId, selectedTaskId, addToast, setCreateTaskOpen, currentRole, currentUserId } = useWorkflowStore()
  const queryClient = useQueryClient()

  // ADMIN, EA, and FOUNDER can mark tasks as Done / Revise / Edit / Delete
  // (FOUNDER has full admin-level control over the tasks they assigned)
  const canModifyTask = currentRole === 'ADMIN' || currentRole === 'EA' || currentRole === 'FOUNDER'
  // ADMIN, EA, and FOUNDER can see ALL tasks (and filter by employee). Employees only see their own.
  const canSeeAllTasks = currentRole === 'ADMIN' || currentRole === 'EA' || currentRole === 'FOUNDER'
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<any>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // Filter dropdowns — priority (everyone) + employee (ADMIN/EA only)
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [employeeFilter, setEmployeeFilter] = useState<string>('')
  const menuRef = useRef<HTMLDivElement>(null)

  // Revise modal state
  const [reviseTask, setReviseTask] = useState<any>(null)
  const [reviseReason, setReviseReason] = useState('')
  const [reviseNextDate, setReviseNextDate] = useState('')

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-list', assignedById, strictAssignedBy ? 'strict' : 'legacy'],
    queryFn: async () => {
      const url = assignedById
        ? `/api/tasks?assignedById=${assignedById}${strictAssignedBy ? '&strictAssignedBy=1' : ''}`
        : '/api/tasks'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // ─── Recent Activity feed (persistent audit log of task events) ───────
  // Polls every 15s so newly created/deleted/revised tasks show up quickly.
  const { data: taskActivityData } = useQuery<{ activities: any[]; count: number }>({
    queryKey: ['task-activity-feed-tasks'],
    queryFn: () => fetch('/api/task-activity?limit=15').then(r => r.json()),
    refetchInterval: 15000,
    refetchOnMount: 'always',
  })
  const taskActivities = Array.isArray(taskActivityData?.activities) ? taskActivityData.activities : []

  const { data: users = [] } = useQuery({
    queryKey: ['users-tasks'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task deleted')
      setConfirmAction(null)
      setMenuOpenId(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task cancelled')
      setConfirmAction(null)
      setMenuOpenId(null)
    },
  })

  const completeMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task completed! ✓')
      setMenuOpenId(null)
      setSelectedTaskId(null)
    },
  })

  // Revise mutation - reopens a completed task back to IN_PROGRESS with reason + next date
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
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task reopened for revision')
      setReviseTask(null)
      setReviseReason('')
      setReviseNextDate('')
      setMenuOpenId(null)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task updated')
      setEditTask(null)
    },
  })

  // Step completion mutation - simplified, no director approval routing
  const stepDoneMutation = useMutation({
    mutationFn: ({ taskId, stepId }: { taskId: string; stepId: string }) =>
      fetch(`/api/tasks/${taskId}/steps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, action: 'complete' }),
      }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (data.allDone) {
        addToast('ok', 'All steps done! Task completed ✓')
      } else {
        addToast('ok', 'Step completed! ✓')
      }
    },
  })

  // Filtering
  let filtered = Array.isArray(tasks) ? [...tasks] : []

  // EMPLOYEE/MANAGER/DIRECTOR: Only see tasks assigned to them
  if (!canSeeAllTasks && currentUserId) {
    filtered = filtered.filter((t: any) => t.ownerId === currentUserId || t.taskSteps?.some((s: any) => s.assigneeId === currentUserId))
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.owner?.name?.toLowerCase().includes(q)
    )
  }

  // Priority filter dropdown
  if (priorityFilter) {
    filtered = filtered.filter((t: any) => t.priority === priorityFilter)
  }

  // Employee filter dropdown (ADMIN/EA only) — filter by ownerId OR step assignee
  if (employeeFilter && canSeeAllTasks) {
    filtered = filtered.filter((t: any) =>
      t.ownerId === employeeFilter || t.taskSteps?.some((s: any) => s.assigneeId === employeeFilter)
    )
  }

  if (showCancelled) filtered = filtered.filter((t: any) => t.status === 'CANCELLED')
  if (showExtHold) filtered = filtered.filter((t: any) => t.status === 'EXTERNAL_HOLD')
  if (showEscalations) {
    // Overdue escalations: use start-of-day comparison so today's tasks are NOT flagged as overdue.
    const _now = new Date()
    const _todayStart = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate())
    filtered = filtered.filter((t: any) =>
      t.status === 'ESCALATED' || (t.dueDate && new Date(t.dueDate) < _todayStart && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    )
  }

  // Helper: check if a date is today
  const isToday = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  // Helper: check if a date is in the future (tomorrow and beyond — NOT today)
  const isUpcoming = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return d >= tomorrowStart
  }

  // Helper: check if a date is before today (yesterday or earlier — overdue)
  const isOverdue = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return dueDayStart < todayStart
  }

  if (!showCancelled && !showExtHold && !showEscalations) {
    // 'all' tab = EVERY task regardless of status (includes COMPLETED, CANCELLED, etc.)
    // User explicitly wants to see ALL saved tasks — no filtering at all on the 'All' tab.
    //
    // Today/Upcoming/Overdue tabs:
    //   - exclude COMPLETED / CANCELLED
    //   - "Today" includes tasks WITHOUT a dueDate (they need attention today — better than
    //     being invisible). Tasks WITH a dueDate use the strict date check.
    // 'complete' tab = only COMPLETED tasks (so Admin/EA can review past completed work)
    if (taskTab === 'all') {
      // No status filter — show everything
    } else if (taskTab === 'today') filtered = filtered.filter((t: any) =>
      t.status !== 'COMPLETED' && t.status !== 'CANCELLED' &&
      (!t.dueDate || isToday(t.dueDate))
    )
    else if (taskTab === 'upcoming') filtered = filtered.filter((t: any) =>
      t.dueDate && isUpcoming(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    )
    else if (taskTab === 'overdue') filtered = filtered.filter((t: any) =>
      t.dueDate && isOverdue(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    )
    else if (taskTab === 'complete') filtered = filtered.filter((t: any) =>
      t.status === 'COMPLETED'
    )
    // Fallback: if taskTab is somehow empty/undefined, default to showing everything
    else {
      // No filter — show all
    }
  }

  const allTasks = Array.isArray(tasks) ? tasks : []
  // "All" count = EVERY task regardless of status
  const allCount = allTasks.length
  // Today count: tasks without a dueDate OR with dueDate today (excl. COMPLETED/CANCELLED)
  const todayCount = allTasks.filter((t: any) =>
    t.status !== 'COMPLETED' && t.status !== 'CANCELLED' &&
    (!t.dueDate || isToday(t.dueDate))
  ).length
  const upcomingCount = allTasks.filter((t: any) => t.dueDate && isUpcoming(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
  const overdueCount = allTasks.filter((t: any) => t.dueDate && isOverdue(t.dueDate) && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
  const completeCount = allTasks.filter((t: any) => t.status === 'COMPLETED').length

  const tabs = [
    { id: 'all', label: 'All', count: allCount },
    { id: 'today', label: 'Today', count: todayCount },
    { id: 'complete', label: 'Completed', count: completeCount },
    { id: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { id: 'overdue', label: 'Overdue', count: overdueCount },
  ]

  const getInitials = (name: string) => name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '?'

  const priorityBadge: Record<string, { bg: string; color: string }> = {
    CRITICAL: { bg: '#FFF1F2', color: '#E11D48' },
    HIGH: { bg: '#FEF2F2', color: '#DC2626' },
    MEDIUM: { bg: '#FFFBEB', color: '#D97706' },
    LOW: { bg: '#EFF6FF', color: '#2563EB' },
  }

  const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    IN_PROGRESS: { bg: '#DBEAFE', color: '#1D4ED8', label: 'In Progress' },
    COMPLETED: { bg: '#DCFCE7', color: '#15803D', label: 'Done' },
    CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
    ON_HOLD: { bg: '#EDE9FE', color: '#6D28D9', label: 'On Hold' },
    ESCALATED: { bg: '#FEE2E2', color: '#DC2626', label: 'Escalated' },
    EXTERNAL_HOLD: { bg: '#FFF7ED', color: '#C2410C', label: 'Ext Hold' },
    DRAFT: { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
    IN_REVIEW: { bg: '#FEF3C7', color: '#92400E', label: 'In Review' },
    APPROVED: { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
    REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    RE_OPENED: { bg: '#FEF3C7', color: '#92400E', label: 'Re-Opened' },
  }

  const getSlaStatus = (task: any) => {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return null
    if (!task.dueDate) return { label: 'On Track', bg: '#ECFDF5', color: '#059669' }
    const now = new Date()
    const due = new Date(task.dueDate)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { label: 'Overdue', bg: '#FEF2F2', color: '#DC2626' }
    if (diffDays <= 2) return { label: 'Due Soon', bg: '#FFFBEB', color: '#D97706' }
    return { label: 'On Track', bg: '#ECFDF5', color: '#059669' }
  }

  // Determine the next actionable step for a task
  const getNextActionableStep = (task: any) => {
    if (!task.taskSteps || task.taskSteps.length === 0) return null
    if (task.status === 'IN_PROGRESS' || task.status === 'REJECTED' || task.status === 'RE_OPENED') {
      const nextStep = task.taskSteps.find((s: any) => s.status !== 'COMPLETED')
      return nextStep || null
    }
    return null
  }

  const pageTitle = showCancelled ? 'Cancelled Tasks' : showExtHold ? 'External Hold' : showEscalations ? 'Escalations' : 'All Tasks'
  const pageDesc = showCancelled ? 'Cancelled workflow items' : showExtHold ? 'Tasks waiting on external action' : showEscalations ? 'Overdue and escalated items' : 'Manage and track all tasks'

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>{pageTitle}</h2>
          <p>{pageDesc}</p>
        </div>
        <div className="ph-right">
          {!showCancelled && !showExtHold && !showEscalations && canModifyTask && (
            <button className="btn btn-gold" onClick={() => setCreateTaskOpen(true)}>+ Create Task</button>
          )}
        </div>
      </div>

      <div className="page-accent" />

      {/* Search Bar + Filter Dropdowns */}
      {!showCancelled && !showExtHold && !showEscalations && (
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search" style={{ maxWidth: 400, flex: '1 1 280px', minWidth: 220 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t4)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks by name, department, person..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: 'var(--t1)', width: '100%' }}
            />
          </div>

          {/* Priority filter dropdown — visible to all roles */}
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

          {/* Employee filter dropdown — ADMIN/EA only */}
          {canSeeAllTasks && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Employee</label>
              <select
                value={employeeFilter}
                onChange={e => setEmployeeFilter(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--b1)',
                  background: 'var(--bg)', color: 'var(--t1)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', outline: 'none', minWidth: 180,
                }}
              >
                <option value="">All Employees</option>
                {Array.isArray(users) && users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.department ? `· ${u.department}` : ''} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Clear filters button */}
          {(priorityFilter || employeeFilter) && (
            <button
              onClick={() => { setPriorityFilter(''); setEmployeeFilter('') }}
              style={{
                padding: '6px 10px', borderRadius: 6, border: '1px solid var(--b1)',
                background: 'var(--bg2)', color: 'var(--t2)',
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Clear filters"
            >
              ✕ Clear
            </button>
          )}

          {/* Result count when filtered */}
          {(priorityFilter || employeeFilter) && (
            <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginLeft: 'auto' }}>
              Showing {filtered.length} of {Array.isArray(tasks) ? tasks.length : 0} tasks
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      {!showCancelled && !showExtHold && !showEscalations && (
        <div className="tabs" style={{ marginBottom: 14 }}>
          {tabs.map(tab => (
            <div key={tab.id} className={`tab${taskTab === tab.id ? ' active' : ''}`}
              onClick={() => setTaskTab(tab.id)}>
              {tab.label}
              {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Task Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div className="lcard">
            <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {taskTab === 'all'
                  ? 'No tasks found'
                  : taskTab === 'today'
                  ? 'No tasks due today'
                  : taskTab === 'upcoming'
                  ? 'No upcoming tasks'
                  : taskTab === 'overdue'
                  ? 'No overdue tasks'
                  : taskTab === 'complete'
                  ? 'No completed tasks yet'
                  : 'No tasks found'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {taskTab === 'all'
                  ? 'No tasks exist in the system yet. Create your first task to get started.'
                  : taskTab === 'complete'
                  ? 'Completed tasks will appear here for your records. Switch to "All" to see every task.'
                  : 'Try switching to the "All" tab to see every task including completed and cancelled ones'}
              </div>
              {taskTab !== 'all' && (
                <button
                  className="btn btn-gold"
                  style={{ marginTop: 12, fontSize: 12, padding: '6px 16px' }}
                  onClick={() => setTaskTab('all')}
                >
                  View All Tasks →
                </button>
              )}
            </div>
          </div>
        ) : filtered.map((task: any) => {
          const sla = getSlaStatus(task)
          const pBadge = priorityBadge[task.priority] || priorityBadge.MEDIUM
          const sStyle = statusStyle[task.status] || statusStyle.PENDING
          const stepsTotal = task.taskSteps?.length || 0
          const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
          const owner = task.owner
          const nextStep = getNextActionableStep(task)

          return (
            <div key={task.id} className="lcard" style={{ cursor: 'pointer', transition: 'all .15s' }}
              onClick={() => setSelectedTaskId(task.id)}>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Avatar */}
                  <div className="av" style={{ width: 38, height: 38, fontSize: 13, background: sStyle.color, flexShrink: 0 }}>
                    {getInitials(owner?.name || 'T')}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--t1)' }}>{task.title}</span>
                      <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: pBadge.bg, color: pBadge.color, fontWeight: 700 }}>
                        {task.priority || 'MEDIUM'}
                      </span>
                      <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: sStyle.bg, color: sStyle.color, fontWeight: 700 }}>
                        {sStyle.label}
                      </span>
                      {sla && (
                        <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: sla.bg, color: sla.color, fontWeight: 700 }}>
                          {sla.label}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--t3)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{owner?.name || 'Unassigned'}</span>
                      {task.department && <span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{task.department}</span>}
                      {task.category && <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--amber-l)', color: 'var(--amber)' }}>{task.category}</span>}
                      {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
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

                  {/* ═══ ACTION BUTTONS — Role-based ═══ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {canModifyTask ? (
                      <>
                        {/* ADMIN/EA: Full controls — Done, Revise, Steps */}
                        {task.status === 'PENDING' && (
                          <>
                            {stepsTotal > 0 && stepsDone < stepsTotal ? (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--blue-l)', color: 'var(--blue)', border: '1.5px solid var(--blue)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => setSelectedTaskId(task.id)}
                                title="Complete steps first"
                              >
                                ☰ Steps {stepsDone}/{stepsTotal}
                              </button>
                            ) : (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1.5px solid var(--green)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => completeMutation.mutate({ id: task.id })}
                                disabled={completeMutation.isPending}
                                title="Mark as Done"
                              >
                                ✓ Done
                              </button>
                            )}
                            <button
                              className="btn btn-xs"
                              style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)', fontWeight: 700 }}
                              onClick={() => { setReviseTask(task); setReviseReason(''); setReviseNextDate('') }}
                              title="Revise Task"
                            >
                              ✏ Revise
                            </button>
                          </>
                        )}
                        {task.status === 'IN_PROGRESS' && (
                          <>
                            {stepsTotal > 0 && stepsDone < stepsTotal ? (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--blue-l)', color: 'var(--blue)', border: '1.5px solid var(--blue)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => setSelectedTaskId(task.id)}
                                title="Complete steps first"
                              >
                                ☰ Steps {stepsDone}/{stepsTotal}
                              </button>
                            ) : (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1.5px solid var(--green)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => completeMutation.mutate({ id: task.id })}
                                disabled={completeMutation.isPending}
                                title="Mark as Done"
                              >
                                ✓ Done
                              </button>
                            )}
                            <button
                              className="btn btn-xs"
                              style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)', fontWeight: 700 }}
                              onClick={() => { setReviseTask(task); setReviseReason(''); setReviseNextDate('') }}
                              title="Revise Task"
                            >
                              ✏ Revise
                            </button>
                          </>
                        )}
                        {(task.status === 'IN_REVIEW' || task.status === 'ON_HOLD' || task.status === 'ESCALATED') && (
                          <>
                            {stepsTotal > 0 && stepsDone < stepsTotal ? (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--blue-l)', color: 'var(--blue)', border: '1.5px solid var(--blue)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => setSelectedTaskId(task.id)}
                                title="Complete steps first"
                              >
                                ☰ Steps {stepsDone}/{stepsTotal}
                              </button>
                            ) : (
                              <button
                                className="btn btn-xs"
                                style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1.5px solid var(--green)', fontWeight: 800, padding: '4px 12px' }}
                                onClick={() => completeMutation.mutate({ id: task.id })}
                                disabled={completeMutation.isPending}
                                title="Mark as Done"
                              >
                                ✓ Done
                              </button>
                            )}
                            <button
                              className="btn btn-xs"
                              style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)', fontWeight: 700 }}
                              onClick={() => { setReviseTask(task); setReviseReason(''); setReviseNextDate('') }}
                              title="Revise / Reopen Task"
                            >
                              ✏ Revise
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* EMPLOYEE/MANAGER/DIRECTOR: Read-only status badge */}
                        {task.status !== 'COMPLETED' && stepsTotal > 0 && stepsDone < stepsTotal && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--blue)',
                            background: 'var(--blue-l)', padding: '3px 8px',
                            borderRadius: 5, border: '1px solid var(--blue)',
                          }}>
                            Steps {stepsDone}/{stepsTotal}
                          </span>
                        )}
                      </>
                    )}
                    {/* COMPLETED → Show "Completed task ✅" — everyone sees this */}
                    {task.status === 'COMPLETED' && (
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: 'var(--green)',
                        background: 'var(--green-l)', padding: '3px 10px',
                        borderRadius: 6, border: '1px solid var(--green)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        Completed task ✅
                        {task.score != null && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: task.score >= 70 ? 'var(--green)' : task.score >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                            · {task.score}
                          </span>
                        )}
                      </span>
                    )}

                    {/* 3-dot menu — only ADMIN/EA get Edit/Delete/Cancel */}
                    <div style={{ position: 'relative' }} ref={menuOpenId === task.id ? menuRef : null}>
                      <button
                        className="btn btn-xs"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: 16, color: 'var(--t3)' }}
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === task.id ? null : task.id) }}
                      >
                        ⋮
                      </button>
                      {menuOpenId === task.id && (
                        <div style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 500,
                          background: 'var(--card)', border: '1px solid var(--b2)',
                          borderRadius: 8, boxShadow: 'var(--s3)', minWidth: 150, overflow: 'hidden',
                        }}>
                          <div
                            style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, borderBottom: '1px solid var(--b1)' }}
                            onClick={() => { setSelectedTaskId(task.id); setMenuOpenId(null) }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            👁 View Details
                          </div>
                          {canModifyTask && (
                            <>
                              <div
                                style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, borderBottom: '1px solid var(--b1)' }}
                                onClick={() => { setEditTask(task); setMenuOpenId(null) }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                ✏️ Edit
                              </div>
                              <div
                                style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, color: 'var(--red)', borderBottom: '1px solid var(--b1)' }}
                                onClick={() => { setConfirmAction({ id: task.id, action: 'delete' }); setMenuOpenId(null) }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                🗑 Delete
                              </div>
                              {task.status !== 'CANCELLED' && task.status !== 'COMPLETED' && (
                                <div
                                  style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, color: 'var(--amber)' }}
                                  onClick={() => { setConfirmAction({ id: task.id, action: 'cancel' }); setMenuOpenId(null) }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  🚫 Cancel Task
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Recent Activity section (persistent audit log) ───────────
          Shows the last 15 task events: CREATED, DELETED, REVISED, COMPLETED, CANCELLED.
          This NEVER loses data — even deleted tasks appear here with their title snapshot. */}
      {!showCancelled && !showExtHold && !showEscalations && (
        <div className="lcard" style={{ marginTop: 18, marginBottom: 14 }}>
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
            ) : taskActivities.slice(0, 10).map((a: any) => {
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
                      {a.priority && <span>· {a.priority}</span>}
                      <span>· {a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* Edit Task Modal */}
      {editTask && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setEditTask(null) }}>
          <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="mx" onClick={() => setEditTask(null)}>✕</button>
            <div className="mt">Edit Task</div>
            <div className="ms">{editTask.title}</div>
            <div className="gold-divider" />

            <div className="form-row fr-1">
              <div className="fg">
                <label>Title</label>
                <input className="fi" value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} />
              </div>
            </div>
            <div className="form-row fr-1">
              <div className="fg">
                <label>Description</label>
                <textarea className="fi" value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} rows={3} />
              </div>
            </div>
            <div className="form-row fr-3">
              <div className="fg">
                <label>Priority</label>
                <select className="fi" value={editTask.priority || 'MEDIUM'} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
              <div className="fg">
                <label>Department</label>
                <select className="fi" value={editTask.department || ''} onChange={e => setEditTask({ ...editTask, department: e.target.value })}>
                  <option value="">Select</option>
                  {['Sales', 'Account', 'HR', 'Coordinator', 'Admin', 'Back Office'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Category</label>
                <select className="fi" value={editTask.category || ''} onChange={e => setEditTask({ ...editTask, category: e.target.value })}>
                  {['Routine Work', 'Reconciliation', 'One Time Work', 'Compliance', 'Operations', 'Procurement'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row fr-1">
              <div className="fg">
                <label>Due Date</label>
                <input className="fi" type="date" value={editTask.dueDate ? new Date(editTask.dueDate).toISOString().split('T')[0] : ''} onChange={e => setEditTask({ ...editTask, dueDate: e.target.value || null })} />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditTask(null)}>Cancel</button>
              <button type="button" className="btn btn-gold" onClick={() => editMutation.mutate({ id: editTask.id, data: { title: editTask.title, description: editTask.description, priority: editTask.priority, department: editTask.department, category: editTask.category, dueDate: editTask.dueDate || null } })} disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete/Cancel Dialog */}
      {confirmAction && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setConfirmAction(null) }}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setConfirmAction(null)}>✕</button>
            <div className="mt">Confirm {confirmAction.action === 'delete' ? 'Delete' : 'Cancel'}</div>
            <div className="ms">Are you sure you want to {confirmAction.action === 'delete' ? 'delete' : 'cancel'} this task? This action cannot be undone.</div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmAction(null)}>No, Keep It</button>
              <button className={confirmAction.action === 'delete' ? 'btn btn-red' : 'btn btn-gold'} onClick={() => {
                if (confirmAction.action === 'delete') deleteMutation.mutate(confirmAction.id)
                else cancelMutation.mutate({ id: confirmAction.id })
              }}>
                Yes, {confirmAction.action === 'delete' ? 'Delete' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Task Modal — Ask reason + next date */}
      {reviseTask && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) { setReviseTask(null); setReviseReason(''); setReviseNextDate('') } }}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => { setReviseTask(null); setReviseReason(''); setReviseNextDate('') }}>✕</button>
            <div className="mt">Revise Task</div>
            <div className="ms">{reviseTask.title}</div>
            <div className="gold-divider" />

            <div style={{ padding: '8px 12px', background: 'var(--amber-l)', borderRadius: 8, marginBottom: 14, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
              Please provide a reason for revision and a new target date.
            </div>

            <div className="form-row fr-1">
              <div className="fg">
                <label>Reason for Revision <span style={{ color: 'var(--red)' }}>*</span></label>
                <textarea
                  className="fi"
                  placeholder="e.g. Incomplete work, quality issues, needs correction..."
                  value={reviseReason}
                  onChange={e => setReviseReason(e.target.value)}
                  rows={3}
                  style={{ minHeight: 80 }}
                />
              </div>
            </div>
            <div className="form-row fr-1">
              <div className="fg">
                <label>Next Target Date <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  className="fi"
                  type="date"
                  value={reviseNextDate}
                  onChange={e => setReviseNextDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => { setReviseTask(null); setReviseReason(''); setReviseNextDate('') }}>Cancel</button>
              <button
                className="btn btn-gold"
                onClick={() => reviseMutation.mutate({ id: reviseTask.id, reason: reviseReason, nextDate: reviseNextDate })}
                disabled={reviseMutation.isPending || !reviseReason.trim() || !reviseNextDate}
              >
                {reviseMutation.isPending ? 'Reopening...' : '↩ Revise Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
