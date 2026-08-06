'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'

interface TaskStep {
  id: string
  title: string
  status: string
  order: number
  assigneeId: string | null
  completedAt: string | null
}

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  department: string | null
  category: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  ownerId: string
  workflowId: string | null
  owner: { id: string; name: string; email: string; role: string; department: string | null; avatar: string | null }
  workflow: { id: string; title: string; status: string; currentStepOrder: number; steps?: WorkflowStep[] } | null
  dependencies?: { id: string; dependsOnTaskId: string; dependencyType: string; dependsOnTask: { id: string; title: string; status: string } }[]
  subTasks: { id: string; title: string; status: string; ownerId: string; owner: { id: string; name: string } }[]
  taskSteps?: TaskStep[]
}

interface WorkflowStep {
  id: string
  name: string
  stepType: string
  order: number
  status: string
  assigneeId: string | null
  assignee: { id: string; name: string; role: string } | null
  startedAt: string | null
  completedAt: string | null
  remarks: string | null
}

interface User {
  id: string
  name: string
  role: string
  department: string | null
}

interface WorkflowTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
}

const DEPT_DEPS = ['Sales', 'Accounts', 'HR', 'Coordinator', 'Admin', 'Back Office', 'Management']
const DIRECTOR_DEPS = ['Ashish Sir', 'Samarth Sir']

export function TaskList() {
  const { activeView, currentUserId, currentRole } = useWorkflowStore()
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('MEDIUM')
  const [newOwnerId, setNewOwnerId] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDeptDeps, setNewDeptDeps] = useState<string[]>([])
  const [newDirectorDeps, setNewDirectorDeps] = useState<string[]>([])
  const [newWorkflowId, setNewWorkflowId] = useState('')
  // Edit state
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editCategory, setEditCategory] = useState('')
  // Task detail view
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [approvalComment, setApprovalComment] = useState('')

  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()),
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  const { data: workflowTemplates = [] } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflow-templates'],
    queryFn: () => fetch('/api/workflow-templates').then(r => r.json()),
  })

  // Fetch full task detail when selected
  const { data: taskDetail } = useQuery<Task>({
    queryKey: ['task-detail', detailTask?.id],
    queryFn: () => fetch(`/api/tasks/${detailTask!.id}`).then(r => r.json()),
    enabled: !!detailTask?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setShowCreate(false)
      resetCreateForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setDetailTask(null)
    },
  })

  const approvalMutation = useMutation({
    mutationFn: (data: { workflowId: string; stepInstanceId: string; action: string; comments: string; approverId: string }) =>
      fetch('/api/approval-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setApprovalComment('')
      setDetailTask(null)
    },
  })

  const resetCreateForm = () => {
    setNewTitle('')
    setNewDesc('')
    setNewPriority('MEDIUM')
    setNewOwnerId('')
    setNewDueDate('')
    setNewDepartment('')
    setNewCategory('')
    setNewDeptDeps([])
    setNewDirectorDeps([])
    setNewWorkflowId('')
  }

  const getBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 's-pending', ASSIGNED: 's-assigned', IN_PROGRESS: 's-inprog',
      COMPLETED: 's-done', CANCELLED: 's-cancelled', ESCALATED: 'b-red',
      ON_HOLD: 's-waiting', DRAFT: 's-pending', IN_REVIEW: 's-appr',
      EXTERNAL_HOLD: 's-exthold', RE_OPENED: 'b-amber',
      APPROVED: 'b-green', REJECTED: 'b-red', AWAITING_APPROVAL: 's-appr',
    }
    return map[status] || 'b-gray'
  }

  const getPriorityBadge = (p: string) => {
    const map: Record<string, string> = { CRITICAL: 'p-critical', HIGH: 'p-high', MEDIUM: 'p-med', LOW: 'p-low' }
    return map[p] || 'p-med'
  }

  const isCancelledView = activeView === 'cancelled'

  const categories = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => { if (t.category) set.add(t.category) })
    return Array.from(set).sort()
  }, [tasks])

  const departments = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => { if (t.department) set.add(t.department); else if (t.owner?.department) set.add(t.owner.department) })
    return Array.from(set).sort()
  }, [tasks])

  const getSLAStatus = (dueDate: string | null, status: string) => {
    if (!dueDate || ['COMPLETED', 'CANCELLED'].includes(status)) return null
    const now = new Date()
    const due = new Date(dueDate)
    const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursLeft < 0) return { label: 'BREACHED', color: 'var(--red)', bg: 'var(--red-l)' }
    if (hoursLeft < 4) return { label: 'CRITICAL', color: '#C2410C', bg: '#FFF7ED' }
    if (hoursLeft < 24) return { label: 'AT RISK', color: 'var(--amber)', bg: 'var(--amber-l)' }
    return { label: 'ON TRACK', color: 'var(--green)', bg: 'var(--green-l)' }
  }

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      if (priorityFilter && t.priority !== priorityFilter) return false
      if (employeeFilter && t.ownerId !== employeeFilter) return false
      if (categoryFilter && t.category !== categoryFilter) return false
      if (deptFilter) {
        const taskDept = t.department || t.owner?.department || ''
        if (taskDept !== deptFilter) return false
      }
      if (isCancelledView) return t.status === 'CANCELLED'
      switch (activeTab) {
        case 'all': return true
        case 'assigned': return t.status === 'PENDING' || t.status === 'ASSIGNED'
        case 'pending': return t.status === 'PENDING'
        case 'in_progress': return t.status === 'IN_PROGRESS'
        case 'awaiting_approval': return t.status === 'IN_REVIEW' || t.status === 'AWAITING_APPROVAL'
        case 'completed': return t.status === 'COMPLETED'
        case 'overdue': return t.dueDate ? new Date(t.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status) : false
        default: return true
      }
    })
  }, [tasks, searchQuery, priorityFilter, employeeFilter, categoryFilter, deptFilter, activeTab, isCancelledView])

  const counts = useMemo(() => ({
    all: tasks.length,
    assigned: tasks.filter(t => t.status === 'PENDING' || t.status === 'ASSIGNED').length,
    pending: tasks.filter(t => t.status === 'PENDING').length,
    in_progress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
    awaiting_approval: tasks.filter(t => t.status === 'IN_REVIEW' || t.status === 'AWAITING_APPROVAL').length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
    overdue: tasks.filter(t => t.dueDate ? new Date(t.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status) : false).length,
  }), [tasks])

  const tabs = isCancelledView ? [] : [
    { id: 'all', label: 'All' },
    { id: 'assigned', label: 'Assigned' },
    { id: 'pending', label: 'Pending' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'awaiting_approval', label: 'Awaiting Approval' },
    { id: 'completed', label: 'Completed' },
    { id: 'overdue', label: 'Overdue' },
  ]

  const clearFilters = () => {
    setSearchQuery('')
    setPriorityFilter('')
    setEmployeeFilter('')
    setCategoryFilter('')
    setDeptFilter('')
  }

  const hasFilters = searchQuery || priorityFilter || employeeFilter || categoryFilter || deptFilter

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const getShortId = (id: string) => id.slice(-6).toUpperCase()

  const toggleDeptDep = (dept: string) => {
    setNewDeptDeps(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept])
  }

  const toggleDirectorDep = (dir: string) => {
    setNewDirectorDeps(prev => prev.includes(dir) ? prev.filter(d => d !== dir) : [...prev, dir])
  }

  const hasDeps = newDeptDeps.length > 0 || newDirectorDeps.length > 0

  // Determine what actions are available for a task based on role and workflow state
  const isAdmin = currentRole === 'ADMIN'
  const isEA = currentRole === 'EA'
  const isDirector = currentRole === 'DIRECTOR'

  const canEditTask = (task: Task) => {
    return isAdmin || isEA || task.ownerId === currentUserId
  }

  const canDeleteTask = (task: Task) => {
    return isAdmin || isEA
  }

  const canCancelTask = (task: Task) => {
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) return false
    return isAdmin || isEA || task.ownerId === currentUserId
  }

  // Check if current user can take approval action on a task's workflow
  const getApprovalAction = (task: Task): { canAct: boolean; stepId: string; stepName: string; actionLabel: string; workflowId: string } | null => {
    if (!task.workflow || !task.workflow.steps) return null
    const steps = task.workflow.steps

    // Find the current active step
    const activeStep = steps.find((s: WorkflowStep) =>
      s.status === 'IN_REVIEW' || s.status === 'IN_PROGRESS' || (s.status === 'PENDING' && s.order === task.workflow!.currentStepOrder)
    )

    if (!activeStep) return null

    // EA can approve EA Review steps
    if ((isEA || isAdmin) && activeStep.name?.includes('EA Review') && !activeStep.name?.includes('Final')) {
      return { canAct: true, stepId: activeStep.id, stepName: 'EA Review', actionLabel: 'Approve & Send to Director', workflowId: task.workflow.id }
    }

    // Director can approve Director steps
    if (isDirector && activeStep.name?.includes('Director')) {
      return { canAct: true, stepId: activeStep.id, stepName: 'Director Approval', actionLabel: 'Approve & Send to EA', workflowId: task.workflow.id }
    }

    // EA can do Final Review
    if ((isEA || isAdmin) && activeStep.name?.includes('EA Final')) {
      return { canAct: true, stepId: activeStep.id, stepName: 'EA Final Review', actionLabel: 'Submit to Employee', workflowId: task.workflow.id }
    }

    // Admin can act on any step
    if (isAdmin && activeStep.assigneeId) {
      return { canAct: true, stepId: activeStep.id, stepName: activeStep.name, actionLabel: `Approve (${activeStep.name})`, workflowId: task.workflow.id }
    }

    return null
  }

  const handleOpenEdit = (task: Task) => {
    setEditTask(task)
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
    setEditDepartment(task.department || '')
    setEditCategory(task.category || '')
  }

  const handleSaveEdit = () => {
    if (!editTask || !editTitle.trim()) return
    updateMutation.mutate({
      id: editTask.id,
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      dueDate: editDueDate || undefined,
      department: editDepartment || undefined,
      category: editCategory || undefined,
    })
    setEditTask(null)
  }

  const handleApprovalAction = (task: Task, action: string) => {
    const approvalInfo = getApprovalAction(task)
    if (!approvalInfo) return
    approvalMutation.mutate({
      workflowId: approvalInfo.workflowId,
      stepInstanceId: approvalInfo.stepId,
      action,
      comments: approvalComment || `${action} by ${currentUserId}`,
      approverId: currentUserId,
    })
  }

  if (isLoading) {
    return (
      <div>
        <div className="ph"><div className="ph-left"><h2>Tasks</h2></div></div>
        <div className="lcard"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading tasks...</div></div>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>{isCancelledView ? 'Cancelled Tasks' : 'Task Management'}</h2>
          <p>{isCancelledView ? 'Archived and cancelled task registry' : 'Complete operational task registry with SLA tracking'}</p>
        </div>
        {!isCancelledView && (
          <div className="ph-right">
            <button className="btn btn-gold" onClick={() => setShowCreate(true)}>+ Create Task</button>
          </div>
        )}
      </div>
      <div className="page-accent" />

      {/* Filters Bar */}
      {!isCancelledView && (
        <div className="lcard" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search" style={{ flex: 1, minWidth: 180, maxWidth: 260 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <select className="sel" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">Priority</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select className="sel" value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">Employee</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <select className="sel" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">Category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select className="sel" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">Department</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            {hasFilters && (
              <button className="btn btn-ghost btn-xs" onClick={clearFilters}>Clear</button>
            )}
          </div>

          {/* Tab Bar */}
          {tabs.length > 0 && (
            <div className="tabs" style={{ marginTop: 10, marginBottom: 0 }}>
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  <span className="tab-cnt" style={
                    tab.id === 'overdue' && counts[tab.id as keyof typeof counts] > 0
                      ? { background: 'var(--red-l)', color: 'var(--red)' }
                      : undefined
                  }>
                    {counts[tab.id as keyof typeof counts] || 0}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task Table */}
      <div className="lcard">
        <div className="ch">
          <div className="ct">{isCancelledView ? 'Cancelled Tasks' : 'All Tasks'}</div>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{filtered.length} entries</span>
        </div>
        <div className="tw" style={{ overflowX: 'auto' }}>
          <table className="ltable">
            <thead>
              <tr>
                <th>#</th>
                <th>Task ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>SLA</th>
                <th>Assigned To</th>
                <th>Dept</th>
                <th>Workflow</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map((t, i) => {
                const sla = getSLAStatus(t.dueDate, t.status)
                const approvalAction = getApprovalAction(t)
                const hasTaskDeps = t.dependencies && t.dependencies.length > 0

                return (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--t3)', fontSize: 11 }}>{i + 1}</td>
                    <td><span className="td-code">{getShortId(t.id)}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setDetailTask(t)}>
                        {t.title}
                      </div>
                      {t.description && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description.slice(0, 50)}{t.description.length > 50 ? '...' : ''}</div>}
                      {hasTaskDeps && <div style={{ fontSize: 9, color: 'var(--purple)', marginTop: 2, fontWeight: 700 }}>Dependency</div>}
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(t.status)}`} style={{ fontSize: 10 }}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td><span className={`badge ${getPriorityBadge(t.priority)}`}>{t.priority}</span></td>
                    <td style={{ fontSize: 11 }}>
                      {t.dueDate ? (
                        <span style={{
                          color: new Date(t.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status) ? 'var(--red)' : 'var(--t2)',
                          fontWeight: new Date(t.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(t.status) ? 700 : 400,
                        }}>
                          {new Date(t.dueDate).toLocaleDateString()}
                        </span>
                      ) : '--'}
                    </td>
                    <td>
                      {sla ? (
                        <span className="badge" style={{ background: sla.bg, color: sla.color, fontSize: 9 }}>
                          {sla.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--t4)' }}>--</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="av" style={{ width: 22, height: 22, fontSize: 8, background: 'linear-gradient(135deg,var(--g1),var(--g3))' }}>
                          {t.owner?.name ? getInitials(t.owner.name) : '??'}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{t.owner?.name || '--'}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11 }}>{t.department || t.owner?.department || '--'}</td>
                    <td>
                      {t.workflow ? (
                        <span className="badge" style={{ background: 'var(--purple-l)', color: 'var(--purple)', fontSize: 9 }}>
                          {t.workflow.status?.replace(/_/g, ' ')} (Step {t.workflow.currentStepOrder})
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--t4)' }}>--</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* View Detail */}
                        <button className="btn btn-xs" style={{ background: 'var(--blue-l)', color: 'var(--blue)', fontSize: 9, padding: '3px 8px' }} onClick={() => setDetailTask(t)}>
                          View
                        </button>

                        {/* Start button for PENDING tasks */}
                        {t.status === 'PENDING' && (
                          <button className="btn btn-green btn-xs" style={{ fontSize: 9 }} onClick={() => updateMutation.mutate({ id: t.id, status: 'IN_PROGRESS' })}>
                            Start
                          </button>
                        )}

                        {/* Complete button for IN_PROGRESS tasks WITHOUT workflow */}
                        {t.status === 'IN_PROGRESS' && !t.workflowId && (
                          <button className="btn btn-green btn-xs" style={{ fontSize: 9 }} onClick={() => updateMutation.mutate({ id: t.id, status: 'COMPLETED' })}>
                            Done
                          </button>
                        )}

                        {/* Submit for Review button for IN_PROGRESS tasks WITH workflow (not yet approved) */}
                        {t.status === 'IN_PROGRESS' && t.workflowId && t.workflow?.status !== 'APPROVED' && (
                          <button className="btn btn-green btn-xs" style={{ fontSize: 9 }} onClick={() => updateMutation.mutate({ id: t.id, status: 'COMPLETED' })}>
                            Submit for Review
                          </button>
                        )}

                        {/* Final Submit button for IN_PROGRESS tasks with APPROVED workflow */}
                        {t.status === 'IN_PROGRESS' && t.workflowId && t.workflow?.status === 'APPROVED' && (
                          <button className="btn btn-green btn-xs" style={{ fontSize: 9, background: 'var(--green)', color: '#fff' }} onClick={() => updateMutation.mutate({ id: t.id, status: 'COMPLETED' })}>
                            Final Submit
                          </button>
                        )}

                        {/* Approval workflow action button */}
                        {approvalAction?.canAct && (
                          <button className="btn btn-xs" style={{ fontSize: 9, background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid var(--purple)', fontWeight: 700 }} onClick={() => handleApprovalAction(t, 'APPROVE')}>
                            {approvalAction.actionLabel}
                          </button>
                        )}

                        {/* Edit button */}
                        {canEditTask(t) && !['COMPLETED', 'CANCELLED'].includes(t.status) && (
                          <button className="btn btn-xs" style={{ fontSize: 9, background: 'var(--amber-l)', color: 'var(--amber)', padding: '3px 8px' }} onClick={() => handleOpenEdit(t)}>
                            Edit
                          </button>
                        )}

                        {/* Cancel button */}
                        {canCancelTask(t) && (
                          <button className="btn btn-red btn-xs" style={{ fontSize: 9 }} onClick={() => { if (confirm('Cancel this task?')) updateMutation.mutate({ id: t.id, status: 'CANCELLED' }) }}>
                            Cancel
                          </button>
                        )}

                        {/* Delete button - only for admin/EA */}
                        {canDeleteTask(t) && (
                          <button className="btn btn-xs" style={{ fontSize: 9, background: '#FEE2E2', color: '#DC2626', padding: '3px 8px' }} onClick={() => { if (confirm('Delete this task permanently?')) deleteMutation.mutate(t.id) }}>
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 30, color: 'var(--t3)' }}>
                    No tasks found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════ TASK DETAIL MODAL ═══════════════ */}
      {detailTask && taskDetail && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setDetailTask(null) }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setDetailTask(null)}>x</button>
            <div className="mt">{taskDetail.title}</div>
            <div className="ms">{taskDetail.description || 'No description'}</div>
            <div className="gold-divider" />

            {/* Status & Priority Badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className={`badge ${getBadgeClass(taskDetail.status)}`}>
                {taskDetail.status.replace(/_/g, ' ')}
              </span>
              <span className={`badge ${getPriorityBadge(taskDetail.priority)}`}>
                {taskDetail.priority}
              </span>
              {taskDetail.dueDate && (
                <span className="badge b-gray">
                  Due: {new Date(taskDetail.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className="badge b-gray">
                Owner: {taskDetail.owner?.name || '--'}
              </span>
              {taskDetail.department && (
                <span className="badge b-gray">{taskDetail.department}</span>
              )}
            </div>

            {/* Workflow Flow Visualization */}
            {taskDetail.workflow && taskDetail.workflow.steps && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 8 }}>Approval Flow</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {taskDetail.workflow.steps.map((step: WorkflowStep, idx: number) => {
                    const isCompleted = step.status === 'APPROVED' || step.status === 'COMPLETED'
                    const isActive = step.status === 'IN_REVIEW' || step.status === 'IN_PROGRESS' || (step.status === 'PENDING' && step.order === taskDetail.workflow!.currentStepOrder)
                    const bgColor = isCompleted ? 'var(--green-l)' : isActive ? 'var(--amber-l)' : 'var(--bg2)'
                    const textColor = isCompleted ? 'var(--green)' : isActive ? 'var(--amber)' : 'var(--t3)'
                    const borderColor = isCompleted ? 'var(--green)' : isActive ? 'var(--amber)' : 'var(--b2)'

                    return (
                      <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          background: bgColor, color: textColor, padding: '5px 10px', borderRadius: 7,
                          fontSize: 10, fontWeight: 700, border: `1.5px solid ${borderColor}`,
                          ...(isActive ? { boxShadow: '0 0 8px rgba(245,158,11,.3)' } : {}),
                        }}>
                          {isCompleted ? '✓ ' : isActive ? '► ' : ''}{step.name}
                          {step.assignee && <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 4 }}>({step.assignee.name})</span>}
                        </div>
                        {idx < (taskDetail.workflow?.steps?.length || 0) - 1 && (
                          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Task Steps Progress */}
            {taskDetail.taskSteps && taskDetail.taskSteps.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 8 }}>Task Steps</div>
                {taskDetail.taskSteps.map((step: TaskStep) => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--b1)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: step.status === 'COMPLETED' ? 'var(--green)' : 'var(--b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                      {step.status === 'COMPLETED' ? '✓' : step.order}
                    </div>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: step.status === 'COMPLETED' ? 600 : 400, color: step.status === 'COMPLETED' ? 'var(--green)' : 'var(--t2)', textDecoration: step.status === 'COMPLETED' ? 'line-through' : 'none' }}>
                      {step.title}
                    </span>
                    <span className="badge" style={{ fontSize: 9, background: step.status === 'COMPLETED' ? 'var(--green-l)' : 'var(--b1)', color: step.status === 'COMPLETED' ? 'var(--green)' : 'var(--t3)' }}>
                      {step.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Approval Actions for current user */}
            {(() => {
              const action = getApprovalAction(taskDetail as Task)
              if (!action?.canAct) return null
              return (
                <div style={{ marginBottom: 14, padding: 12, background: 'linear-gradient(135deg,rgba(109,40,217,.06),var(--card))', border: '1px solid rgba(109,40,217,.15)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--purple)', marginBottom: 8 }}>
                    Your Action Required: {action.stepName}
                  </div>
                  <input
                    className="fi"
                    placeholder="Add comments..."
                    value={approvalComment}
                    onChange={e => setApprovalComment(e.target.value)}
                    style={{ marginBottom: 8, fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-green btn-sm"
                      onClick={() => handleApprovalAction(taskDetail as Task, 'APPROVE')}
                      disabled={approvalMutation.isPending}
                    >
                      ✓ {action.actionLabel}
                    </button>
                    {action.stepName.includes('Director') && (
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)' }}
                        onClick={() => handleApprovalAction(taskDetail as Task, 'SEND_BACK')}
                        disabled={approvalMutation.isPending}
                      >
                        Send Back to EA
                      </button>
                    )}
                    <button
                      className="btn btn-red btn-sm"
                      onClick={() => handleApprovalAction(taskDetail as Task, 'REJECT')}
                      disabled={approvalMutation.isPending}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
              {taskDetail.status === 'PENDING' && (
                <button className="btn btn-green btn-sm" onClick={() => { updateMutation.mutate({ id: taskDetail.id, status: 'IN_PROGRESS' }); setDetailTask(null) }}>
                  Start Task
                </button>
              )}
              {taskDetail.status === 'IN_PROGRESS' && !taskDetail.workflowId && (
                <button className="btn btn-green btn-sm" onClick={() => { updateMutation.mutate({ id: taskDetail.id, status: 'COMPLETED' }); setDetailTask(null) }}>
                  Mark Complete
                </button>
              )}
              {taskDetail.status === 'IN_PROGRESS' && taskDetail.workflowId && taskDetail.workflow?.status !== 'APPROVED' && (
                <button className="btn btn-green btn-sm" onClick={() => { updateMutation.mutate({ id: taskDetail.id, status: 'COMPLETED' }); setDetailTask(null) }}>
                  Submit for Review
                </button>
              )}
              {taskDetail.status === 'IN_PROGRESS' && taskDetail.workflowId && taskDetail.workflow?.status === 'APPROVED' && (
                <button className="btn btn-green btn-sm" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => { updateMutation.mutate({ id: taskDetail.id, status: 'COMPLETED' }); setDetailTask(null) }}>
                  Final Submit
                </button>
              )}
              {canEditTask(taskDetail as Task) && !['COMPLETED', 'CANCELLED'].includes(taskDetail.status) && (
                <button className="btn btn-sm" style={{ background: 'var(--amber-l)', color: 'var(--amber)' }} onClick={() => { handleOpenEdit(taskDetail as Task); setDetailTask(null) }}>
                  Edit
                </button>
              )}
              {canCancelTask(taskDetail as Task) && (
                <button className="btn btn-red btn-sm" onClick={() => { updateMutation.mutate({ id: taskDetail.id, status: 'CANCELLED' }); setDetailTask(null) }}>
                  Cancel Task
                </button>
              )}
              {canDeleteTask(taskDetail as Task) && (
                <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626' }} onClick={() => { deleteMutation.mutate(taskDetail.id); setDetailTask(null) }}>
                  Delete Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ EDIT TASK MODAL ═══════════════ */}
      {editTask && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setEditTask(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setEditTask(null)}>x</button>
            <div className="mt">Edit Task</div>
            <div className="ms">Update task details</div>
            <div className="gold-divider" />

            <div className="fg">
              <label>Title <span>*</span></label>
              <input className="fi" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Enter task title" />
            </div>

            <div className="fg">
              <label>Description</label>
              <textarea className="fi" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Optional description" rows={3} />
            </div>

            <div className="form-row fr-3">
              <div className="fg">
                <label>Priority</label>
                <select className="sel" value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="fg">
                <label>Due Date</label>
                <input className="fi" type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
              <div className="fg">
                <label>Department</label>
                <select className="sel" value={editDepartment} onChange={e => setEditDepartment(e.target.value)}>
                  <option value="">Select...</option>
                  {DEPT_DEPS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="fg">
              <label>Category</label>
              <input className="fi" value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. Operations, Finance, HR" />
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-out" onClick={() => setEditTask(null)}>Cancel</button>
              <button className="btn btn-gold" disabled={!editTitle.trim()} onClick={handleSaveEdit}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ CREATE TASK MODAL ═══════════════ */}
      {showCreate && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="mx" onClick={() => setShowCreate(false)}>x</button>
            <div className="mt">Create New Task</div>
            <div className="ms">Add a new task with optional department/director dependencies and workflow</div>

            {/* Approval Flow Preview */}
            {hasDeps && (
              <div style={{ background: 'linear-gradient(135deg,rgba(109,40,217,.06),var(--card))', border: '1px solid rgba(109,40,217,.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--purple)', marginBottom: 8 }}>Approval Flow Preview</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--blue-l)', color: 'var(--blue)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Employee</div>
                  <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
                  <div style={{ background: 'var(--amber-l)', color: 'var(--amber)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>EA Review</div>
                  <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
                  <div style={{ background: 'var(--purple-l)', color: 'var(--purple)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, border: '1.5px solid var(--purple)' }}>Director Approval</div>
                  <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
                  <div style={{ background: 'var(--amber-l)', color: 'var(--amber)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>EA Final Review</div>
                  <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
                  <div style={{ background: 'var(--green-l)', color: 'var(--green)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Complete</div>
                </div>
              </div>
            )}

            <div className="fg">
              <label>Title <span>*</span></label>
              <input className="fi" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Enter task title" />
            </div>

            <div className="fg">
              <label>Description</label>
              <textarea className="fi" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" rows={3} />
            </div>

            <div className="form-row fr-3">
              <div className="fg">
                <label>Priority</label>
                <select className="sel" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="fg">
                <label>Assign To <span>*</span></label>
                <select className="sel" value={newOwnerId} onChange={e => setNewOwnerId(e.target.value)}>
                  <option value="">Select user...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Due Date</label>
                <input className="fi" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
              </div>
            </div>

            <div className="form-row fr-2">
              <div className="fg">
                <label>Department</label>
                <select className="sel" value={newDepartment} onChange={e => setNewDepartment(e.target.value)}>
                  <option value="">Select department...</option>
                  {DEPT_DEPS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Category</label>
                <input className="fi" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. Operations, Finance, HR" />
              </div>
            </div>

            {/* Department Dependencies */}
            <div style={{ marginTop: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--blue)' }}>🏢</span> Department Dependencies
                <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 400 }}>(triggers EA → Director approval flow)</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DEPT_DEPS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDeptDep(dept)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      border: newDeptDeps.includes(dept) ? '1.5px solid var(--blue)' : '1.5px solid var(--b2)',
                      background: newDeptDeps.includes(dept) ? 'var(--blue-l)' : 'var(--card)',
                      color: newDeptDeps.includes(dept) ? 'var(--blue)' : 'var(--t2)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >
                    {newDeptDeps.includes(dept) ? '✓ ' : ''}{dept}
                  </button>
                ))}
              </div>
            </div>

            {/* Director Dependencies */}
            <div style={{ marginTop: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--purple)' }}>👔</span> Director Dependencies
                <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 400 }}>(requires director approval before completion)</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIRECTOR_DEPS.map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => toggleDirectorDep(dir)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      border: newDirectorDeps.includes(dir) ? '1.5px solid var(--purple)' : '1.5px solid var(--b2)',
                      background: newDirectorDeps.includes(dir) ? 'var(--purple-l)' : 'var(--card)',
                      color: newDirectorDeps.includes(dir) ? 'var(--purple)' : 'var(--t2)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >
                    {newDirectorDeps.includes(dir) ? '✓ ' : ''}{dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Workflow Selection (Optional) */}
            <div style={{ marginTop: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--amber)' }}>📋</span> Workflow Template
                <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 400 }}>(optional - auto-created if dependencies selected)</span>
              </div>
              <select className="sel" value={newWorkflowId} onChange={e => setNewWorkflowId(e.target.value)} style={{ width: '100%' }}>
                <option value="">No workflow (standalone task)</option>
                {workflowTemplates.map(wt => (
                  <option key={wt.id} value={wt.id}>{wt.name} {wt.category ? `(${wt.category})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-out" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={!newTitle || !newOwnerId}
                onClick={() => createMutation.mutate({
                  title: newTitle,
                  description: newDesc,
                  priority: newPriority,
                  ownerId: newOwnerId,
                  dueDate: newDueDate,
                  department: newDepartment,
                  category: newCategory,
                  departmentDependencies: newDeptDeps,
                  directorDependencies: newDirectorDeps,
                  workflowTemplateId: newWorkflowId || undefined,
                })}
              >
                {createMutation.isPending ? 'Creating...' : `Create Task${hasDeps ? ' with Approval Flow' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
