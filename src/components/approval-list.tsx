'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'

interface PendingStep {
  id: string
  name: string
  stepType: string
  status: string
  order: number
  workflow: {
    id: string
    title: string
    description?: string
    status: string
    priority: string
    creator: { id: string; name: string; email: string; role: string }
    dueDate: string | null
    createdAt: string
  }
  assignee: { id: string; name: string; email: string; role: string } | null
  approvals: {
    id: string
    action: string
    comments: string | null
    approver: { id: string; name: string; role: string }
  }[]
  slaDeadline: string | null
  startedAt: string | null
}

interface HistoryApproval {
  id: string
  action: string
  comments: string | null
  level: number
  isDelegated: boolean
  createdAt: string
  stepInstance: { id: string; name: string; order: number }
  workflow: { id: string; title: string; status: string; priority: string }
  approver: { id: string; name: string; role: string; department: string | null }
}

interface ApprovalData {
  pending: PendingStep[]
  history: HistoryApproval[]
}

export function ApprovalList() {
  const { currentUserId } = useWorkflowStore()
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [deptFilter, setDeptFilter] = useState('all')
  const [actionDialog, setActionDialog] = useState<{ step: PendingStep; action: 'APPROVED' | 'REJECTED' } | null>(null)
  const [comment, setComment] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<ApprovalData>({
    queryKey: ['approvals', currentUserId],
    queryFn: () => fetch(`/api/approvals?userId=${currentUserId}`).then(r => r.json()),
  })

  const actionMutation = useMutation({
    mutationFn: (data: { stepInstanceId: string; workflowId: string; approverId: string; action: string; comments: string }) =>
      fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setActionDialog(null)
      setComment('')
    },
  })

  const pendingSteps = data?.pending || []
  const historyApprovals = data?.history || []

  // Derive departments from pending steps
  const departments = useMemo(() => {
    const set = new Set<string>()
    pendingSteps.forEach(s => {
      if (s.workflow?.creator?.role) {
        // Try to get department from workflow creator or step assignee
      }
    })
    // For now use the known departments from the schema
    return ['Sales', 'Back Office', 'Accounts']
  }, [pendingSteps])

  // Get department from step - use workflow creator's department or step info
  const getStepDept = (step: PendingStep): string => {
    // Try to determine from the workflow title or step name
    const title = (step.workflow?.title || '').toLowerCase()
    if (title.includes('sales')) return 'Sales'
    if (title.includes('back office') || title.includes('backoffice')) return 'Back Office'
    if (title.includes('account')) return 'Accounts'
    // Default from order
    if (step.order <= 1) return 'Sales'
    if (step.order === 2) return 'Back Office'
    return 'Accounts'
  }

  const filteredPending = useMemo(() => {
    if (deptFilter === 'all') return pendingSteps
    return pendingSteps.filter(s => getStepDept(s) === deptFilter)
  }, [pendingSteps, deptFilter])

  const filteredHistory = useMemo(() => {
    if (deptFilter === 'all') return historyApprovals
    return historyApprovals.filter(a => {
      const title = (a.workflow?.title || '').toLowerCase()
      if (deptFilter === 'Sales') return title.includes('sales')
      if (deptFilter === 'Back Office') return title.includes('back office') || title.includes('backoffice')
      if (deptFilter === 'Accounts') return title.includes('account')
      return true
    })
  }, [historyApprovals, deptFilter])

  const displayList = activeTab === 'pending' ? filteredPending : filteredHistory

  // Stats
  const stats = useMemo(() => {
    const byDept: Record<string, { total: number; approved: number; rejected: number; pending: number }> = {}
    departments.forEach(d => { byDept[d] = { total: 0, approved: 0, rejected: 0, pending: 0 } })
    pendingSteps.forEach(s => {
      const dept = getStepDept(s)
      if (byDept[dept]) {
        byDept[dept].total++
        byDept[dept].pending++
      }
    })
    historyApprovals.forEach(a => {
      const title = (a.workflow?.title || '').toLowerCase()
      let dept = 'Sales'
      if (title.includes('back office') || title.includes('backoffice')) dept = 'Back Office'
      else if (title.includes('account')) dept = 'Accounts'
      if (byDept[dept]) {
        byDept[dept].total++
        if (a.action === 'APPROVED') byDept[dept].approved++
        else if (a.action === 'REJECTED') byDept[dept].rejected++
      }
    })
    return byDept
  }, [pendingSteps, historyApprovals, departments])

  const getBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 's-pending', IN_PROGRESS: 's-inprog', COMPLETED: 's-done',
      APPROVED: 'b-green', REJECTED: 'b-red', ON_HOLD: 's-waiting',
      IN_REVIEW: 's-appr', DRAFT: 's-pending',
    }
    return map[status] || 'b-gray'
  }

  const getPriorityBadge = (p: string) => {
    const map: Record<string, string> = { CRITICAL: 'p-critical', HIGH: 'p-high', MEDIUM: 'p-med', LOW: 'p-low' }
    return map[p] || 'p-med'
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  if (isLoading) {
    return (
      <div>
        <div className="ph"><div className="ph-left"><h2>Approvals</h2></div></div>
        <div className="lcard"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading approvals…</div></div>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>Approval Center</h2>
          <p>Department-wise task completion reviews — intelligent workflow engine</p>
        </div>
        <div className="ph-right">
          <span className="badge b-gold" style={{ fontSize: 12, padding: '5px 14px' }}>
            {pendingSteps.length} Pending
          </span>
        </div>
      </div>
      <div className="page-accent" />

      {/* Workflow Flow Diagram */}
      <div className="lcard" style={{ padding: '14px 18px', marginBottom: 14, background: 'linear-gradient(135deg,var(--g5),var(--card))' }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--g2)', marginBottom: 10 }}>⚙ Workflow Engine</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ background: 'var(--blue-l)', color: 'var(--blue)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '1px solid rgba(29,78,216,.15)' }}>👤 Employee</div>
          <span style={{ color: 'var(--g3)', fontSize: 14, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--amber-l)', color: 'var(--amber)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '1px solid rgba(180,83,9,.15)' }}>📋 EA Review</div>
          <span style={{ color: 'var(--g3)', fontSize: 14, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--purple-l)', color: 'var(--purple)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '1px solid rgba(109,40,217,.15)' }}>👔 Director</div>
          <span style={{ color: 'var(--g3)', fontSize: 14, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--green-l)', color: 'var(--green)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '1px solid rgba(21,128,61,.15)' }}>✅ Complete</div>
        </div>
      </div>

      {/* Department Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'Sales', 'Back Office', 'Accounts'].map(dept => (
          <button
            key={dept}
            className={`btn ${deptFilter === dept ? 'btn-gold' : 'btn-ghost'} btn-sm`}
            onClick={() => setDeptFilter(dept)}
          >
            {dept === 'all' ? 'All Departments' : dept}
            {dept !== 'all' && stats[dept]?.pending > 0 && (
              <span style={{
                marginLeft: 4, background: 'var(--red-l)', color: 'var(--red)',
                padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 800,
              }}>
                {stats[dept].pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Approval Stats Bar */}
      <div className="stat-grid sg-4" style={{ marginBottom: 14 }}>
        <div className="sc">
          <div className="sc-accent" style={{ background: 'var(--amber)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Pending</div><div className="sc-val" style={{ color: 'var(--amber)', fontSize: 24 }}>{pendingSteps.length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--amber-m)' }}>⏳</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Approved</div><div className="sc-val" style={{ color: 'var(--green)', fontSize: 24 }}>{historyApprovals.filter(a => a.action === 'APPROVED').length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--green-m)' }}>✅</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Rejected</div><div className="sc-val" style={{ color: 'var(--red)', fontSize: 24 }}>{historyApprovals.filter(a => a.action === 'REJECTED').length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--red-m)' }}>❌</div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-accent" style={{ background: 'var(--g2)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Total Processed</div><div className="sc-val" style={{ color: 'var(--g2)', fontSize: 24 }}>{historyApprovals.length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--gb)' }}>📊</div>
          </div>
        </div>
      </div>

      {/* Pending/History Toggle */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <div className={`tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          Pending <span className="tab-cnt">{pendingSteps.length}</span>
        </div>
        <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          History <span className="tab-cnt">{historyApprovals.length}</span>
        </div>
      </div>

      {/* Department-wise Approval Cards */}
      {activeTab === 'pending' ? (
        // Group pending by department
        deptFilter === 'all' ? (
          departments.map(dept => {
            const deptSteps = pendingSteps.filter(s => getStepDept(s) === dept)
            if (deptSteps.length === 0) return null
            return (
              <div key={dept} style={{ marginBottom: 16 }}>
                <div className="dept-div">
                  <span className="dept-div-lbl" style={{ color: 'var(--g2)' }}>{dept}</span>
                  <div className="dept-div-line" style={{ background: 'var(--gbr)' }} />
                  <span className="dept-div-cnt" style={{ background: 'var(--gb)', color: 'var(--g2)' }}>{deptSteps.length}</span>
                </div>
                {deptSteps.map(step => (
                  <ApprovalCard
                    key={step.id}
                    step={step}
                    onApprove={() => setActionDialog({ step, action: 'APPROVED' })}
                    onReject={() => setActionDialog({ step, action: 'REJECTED' })}
                    getBadgeClass={getBadgeClass}
                    getPriorityBadge={getPriorityBadge}
                    getInitials={getInitials}
                  />
                ))}
              </div>
            )
          })
        ) : (
          displayList.length > 0 ? (displayList as PendingStep[]).map(step => (
            <ApprovalCard
              key={step.id}
              step={step}
              onApprove={() => setActionDialog({ step, action: 'APPROVED' })}
              onReject={() => setActionDialog({ step, action: 'REJECTED' })}
              getBadgeClass={getBadgeClass}
              getPriorityBadge={getPriorityBadge}
              getInitials={getInitials}
            />
          )) : (
            <div className="lcard">
              <div className="cb empty">
                <h3>No pending approvals</h3>
                <p>All caught up! No approvals pending for {deptFilter}.</p>
              </div>
            </div>
          )
        )
      ) : (
        // History view
        filteredHistory.length > 0 ? filteredHistory.map(a => (
          <div key={a.id} className="appr-card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div className="ua" style={{ width: 32, height: 32, fontSize: 11, background: a.action === 'APPROVED' ? 'linear-gradient(135deg,var(--green),#22c55e)' : 'linear-gradient(135deg,var(--red),#ef4444)' }}>
                {a.action === 'APPROVED' ? '✓' : '✕'}
              </div>
              <div className="appr-info">
                <div className="appr-title">{a.workflow?.title || 'Workflow'}</div>
                <div className="appr-meta" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                  <span className={`badge ${a.action === 'APPROVED' ? 'b-green' : 'b-red'}`}>
                    {a.action}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>
                    Step: {a.stepInstance?.name || '—'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>
                    By: {a.approver?.name || '—'}
                  </span>
                </div>
                {a.comments && (
                  <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, fontStyle: 'italic' }}>
                    &ldquo;{a.comments}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )) : (
          <div className="lcard">
            <div className="cb empty">
              <h3>No approval history</h3>
              <p>Approval actions will appear here once processed.</p>
            </div>
          </div>
        )
      )}

      {/* Action Dialog */}
      {actionDialog && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setActionDialog(null) }}>
          <div className="modal modal-sm">
            <button className="mx" onClick={() => setActionDialog(null)}>✕</button>
            <div className="mt">
              {actionDialog.action === 'APPROVED' ? '✓ Approve' : '✕ Reject'} Step
            </div>
            <div className="ms">
              {actionDialog.step.workflow?.title} — {actionDialog.step.name}
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 14, fontSize: 11, color: 'var(--t2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Step:</span><strong>{actionDialog.step.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Priority:</span><span className={`badge ${getPriorityBadge(actionDialog.step.workflow?.priority || 'MEDIUM')}`}>{actionDialog.step.workflow?.priority}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Assigned to:</span><strong>{actionDialog.step.assignee?.name || '—'}</strong>
              </div>
            </div>

            <div className="fg">
              <label>Comment</label>
              <textarea
                className="fi"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={actionDialog.action === 'APPROVED' ? 'Optional approval comments…' : 'Reason for rejection…'}
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-out" onClick={() => setActionDialog(null)}>Cancel</button>
              <button
                className={`btn ${actionDialog.action === 'APPROVED' ? 'btn-green' : 'btn-red'}`}
                onClick={() => actionMutation.mutate({
                  stepInstanceId: actionDialog.step.id,
                  workflowId: actionDialog.step.workflow.id,
                  approverId: currentUserId,
                  action: actionDialog.action,
                  comments: comment,
                })}
              >
                {actionMutation.isPending ? 'Processing…' : actionDialog.action === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-component for approval cards
function ApprovalCard({
  step,
  onApprove,
  onReject,
  getBadgeClass,
  getPriorityBadge,
  getInitials,
}: {
  step: PendingStep
  onApprove: () => void
  onReject: () => void
  getBadgeClass: (s: string) => string
  getPriorityBadge: (p: string) => string
  getInitials: (n: string) => string
}) {
  const getStepDept = (step: PendingStep): string => {
    const title = (step.workflow?.title || '').toLowerCase()
    if (title.includes('sales')) return 'Sales'
    if (title.includes('back office') || title.includes('backoffice')) return 'Back Office'
    if (title.includes('account')) return 'Accounts'
    if (step.order <= 1) return 'Sales'
    if (step.order === 2) return 'Back Office'
    return 'Accounts'
  }

  const dept = getStepDept(step)
  const deptColors: Record<string, { bg: string; color: string }> = {
    'Sales': { bg: 'var(--blue-l)', color: 'var(--blue)' },
    'Back Office': { bg: 'var(--amber-l)', color: 'var(--amber)' },
    'Accounts': { bg: 'var(--green-l)', color: 'var(--green)' },
  }

  const slaDeadline = step.slaDeadline ? new Date(step.slaDeadline) : null
  const isSlaBreached = slaDeadline && slaDeadline < new Date()

  return (
    <div className="appr-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div className="ua" style={{ width: 34, height: 34, fontSize: 11, background: 'linear-gradient(135deg,var(--g1),var(--g3))' }}>
          {step.assignee?.name ? getInitials(step.assignee.name) : '??'}
        </div>
        <div className="appr-info" style={{ flex: 1 }}>
          <div className="appr-title">{step.workflow?.title || 'Workflow'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
            <span className={`badge ${getBadgeClass(step.status)}`}>
              {(step.status || 'PENDING').replace(/_/g, ' ')}
            </span>
            <span className={`badge ${getPriorityBadge(step.workflow?.priority || 'MEDIUM')}`}>
              {step.workflow?.priority || 'MEDIUM'}
            </span>
            <span className="badge" style={{ background: deptColors[dept]?.bg, color: deptColors[dept]?.color }}>
              {dept}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4, display: 'flex', gap: 12 }}>
            <span>Step: {step.name}</span>
            <span>Assignee: {step.assignee?.name || '—'}</span>
            <span>Creator: {step.workflow?.creator?.name || '—'}</span>
          </div>
          {isSlaBreached && (
            <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginTop: 4 }}>
              ⚠ SLA BREACHED — Deadline was {slaDeadline?.toLocaleString()}
            </div>
          )}
          {step.approvals && step.approvals.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {step.approvals.map(a => (
                <div key={a.id} style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className={`badge ${a.action === 'APPROVED' ? 'b-green' : 'b-red'}`} style={{ fontSize: 9, padding: '1px 5px' }}>{a.action}</span>
                  <span>{a.approver?.name}</span>
                  {a.comments && <span style={{ fontStyle: 'italic' }}>&ldquo;{a.comments}&rdquo;</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="appr-actions">
        <button className="btn btn-green btn-sm" onClick={onApprove}>✓ Approve</button>
        <button className="btn btn-red btn-sm" onClick={onReject}>✕ Reject</button>
      </div>
    </div>
  )
}
