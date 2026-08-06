'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft', PENDING: 'Pending', IN_REVIEW: 'In Review', APPROVED: 'Approved',
  REJECTED: 'Rejected', IN_PROGRESS: 'In Progress', ON_HOLD: 'On Hold',
  ESCALATED: 'Escalated', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXTERNAL_HOLD: 'External Hold',
}

const statusBadgeStyle: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: 'var(--amber-l)', color: 'var(--amber)' },
  IN_REVIEW: { bg: 'var(--blue-l)', color: 'var(--blue)' },
  IN_PROGRESS: { bg: 'var(--amber-l)', color: 'var(--amber)' },
  ON_HOLD: { bg: 'var(--purple-l)', color: 'var(--purple)' },
  APPROVED: { bg: 'var(--green-l)', color: 'var(--green)' },
  COMPLETED: { bg: 'var(--green-l)', color: 'var(--green)' },
  ESCALATED: { bg: 'var(--red-l)', color: 'var(--red)' },
  REJECTED: { bg: 'var(--red-l)', color: 'var(--red)' },
  CANCELLED: { bg: 'var(--bg3)', color: 'var(--t3)' },
  EXTERNAL_HOLD: { bg: '#FFF7ED', color: '#C2410C' },
}

const avatarColors = ['#B45309','#6D28D9','#0F766E','#1D4ED8','#BE123C','#15803D','#C2410C','#7C3AED']
function avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return avatarColors[Math.abs(h) % avatarColors.length] }
function getInitials(name: string) { return name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '?' }

export function LaxreeApprovals() {
  const { currentUser, addToast, currentUserId, currentRole } = useWorkflowStore()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [actionTask, setActionTask] = useState<string | null>(null)
  const [approvalTab, setApprovalTab] = useState('ea_review')

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-approvals'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()),
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows-approvals'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })

  // Approval action mutation (uses the proper approval-action API)
  const approvalActionMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/approval-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['workflows-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Action completed')
      setComment('')
      setActionTask(null)
    },
  })

  // Categorize tasks by their workflow state
  const allTasks = Array.isArray(tasks) ? tasks : []

  // Tasks at EA Review stage (IN_REVIEW, EA step is active - but NOT EA Final)
  const eaReviewTasks = allTasks.filter((t: any) =>
    t.status === 'IN_REVIEW' && t.workflowId &&
    !(t.workflow?.steps?.some((s: any) => s.name?.includes('EA Final') && s.status === 'IN_REVIEW'))
  )

  // Tasks at Director stage (ON_HOLD = waiting for director)
  const directorReviewTasks = allTasks.filter((t: any) =>
    t.status === 'ON_HOLD'
  )

  // Tasks at EA Final Review (after director approved, back to EA)
  const eaFinalTasks = allTasks.filter((t: any) =>
    t.status === 'IN_REVIEW' && t.workflow?.status === 'IN_REVIEW' &&
    t.workflow?.steps?.some((s: any) => s.name.includes('EA Final') && s.status === 'IN_REVIEW')
  )

  // Completed tasks
  const completedTasks = allTasks.filter((t: any) => t.status === 'COMPLETED')

  // Rejected tasks
  const rejectedTasks = allTasks.filter((t: any) => t.status === 'REJECTED')

  // Tasks approved by all, waiting for employee final submit
  const approvedTasks = allTasks.filter((t: any) =>
    t.status === 'IN_PROGRESS' && t.workflow?.status === 'APPROVED'
  )

  const tabs = [
    { id: 'ea_review', label: 'EA Review', count: eaReviewTasks.length },
    { id: 'director', label: 'Director Review', count: directorReviewTasks.length },
    { id: 'ea_final', label: 'EA Final', count: eaFinalTasks.length },
    { id: 'approved', label: 'Approved', count: approvedTasks.length },
    { id: 'completed', label: 'Completed', count: completedTasks.length },
  ]

  const handleEAApprove = (task: any) => {
    // EA approves at EA Review stage → send to Director
    const workflow = task.workflow
    if (!workflow) return

    const eaReviewStep = workflow.steps?.find((s: any) => s.name.includes('EA Review') && !s.name.includes('Final'))

    if (eaReviewStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: eaReviewStep.id,
        action: 'APPROVE',
        comments: comment || 'EA verified and sent to Director',
        approverId: currentUserId,
      })
    }
  }

  const handleDirectorApprove = (task: any) => {
    // Director approves → goes to EA Final Review
    const workflow = task.workflow
    if (!workflow) return

    const directorStep = workflow.steps?.find((s: any) => s.name.includes('Director'))

    if (directorStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: directorStep.id,
        action: 'APPROVE',
        comments: comment || 'Director approved',
        approverId: currentUserId,
      })
    }
  }

  const handleDirectorReject = (task: any) => {
    // Director rejects → return to employee
    const workflow = task.workflow
    if (!workflow) return

    const directorStep = workflow.steps?.find((s: any) => s.name.includes('Director'))

    if (directorStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: directorStep.id,
        action: 'REJECT',
        comments: comment || 'Director rejected',
        approverId: currentUserId,
      })
    }
  }

  const handleDirectorSendBack = (task: any) => {
    // Director sends back to EA
    const workflow = task.workflow
    if (!workflow) return

    const directorStep = workflow.steps?.find((s: any) => s.name.includes('Director'))

    if (directorStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: directorStep.id,
        action: 'SEND_BACK',
        comments: comment || 'Director sent back to EA',
        approverId: currentUserId,
      })
    }
  }

  const handleEAFinalApprove = (task: any) => {
    // EA Final approves → send back to employee for final submit
    const workflow = task.workflow
    if (!workflow) return

    const eaFinalStep = workflow.steps?.find((s: any) => s.name.includes('EA Final'))

    if (eaFinalStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: eaFinalStep.id,
        action: 'APPROVE',
        comments: comment || 'EA Final approved - ready for employee submission',
        approverId: currentUserId,
      })
    }
  }

  const handleEAFinalReject = (task: any) => {
    // EA Final rejects → return to employee
    const workflow = task.workflow
    if (!workflow) return

    const eaFinalStep = workflow.steps?.find((s: any) => s.name.includes('EA Final'))

    if (eaFinalStep) {
      approvalActionMutation.mutate({
        workflowId: workflow.id,
        stepInstanceId: eaFinalStep.id,
        action: 'REJECT',
        comments: comment || 'EA Final rejected - needs revision',
        approverId: currentUserId,
      })
    }
  }

  const renderTaskCard = (task: any, mode: 'ea_review' | 'director' | 'ea_final' | 'approved' | 'completed') => {
    const sBadge = statusBadgeStyle[task.status] || statusBadgeStyle.PENDING
    const owner = task.owner
    const stepsTotal = task.taskSteps?.length || 0
    const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
    const workflow = task.workflow
    const isActive = actionTask === task.id

    return (
      <div key={task.id} style={{
        background: 'var(--card)', border: '1.5px solid var(--gbr)', borderRadius: 'var(--r)',
        padding: 16, marginBottom: 10, transition: 'all .15s',
        borderLeft: `3px solid ${sBadge.color}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className="av" style={{ background: avatarColor(owner?.name || 'T'), width: 34, height: 34, fontSize: 12 }}>
            {getInitials(owner?.name || 'T')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{task.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {owner?.name || 'Unassigned'} · {owner?.department || '—'} · {statusLabels[task.status] || task.status}
            </div>
          </div>
          <span className="badge" style={{ background: sBadge.bg, color: sBadge.color, fontWeight: 700, fontSize: 10 }}>
            {statusLabels[task.status] || task.status}
          </span>
        </div>

        {/* Task info */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {task.department && <span className="badge b-gray" style={{ fontSize: 9 }}>{task.department}</span>}
          {task.category && <span className="badge" style={{ fontSize: 9, background: 'var(--amber-l)', color: 'var(--amber)' }}>{task.category}</span>}
          {task.directorDependency && (() => {
            try {
              const dirs = JSON.parse(task.directorDependency)
              return dirs.length > 0 ? (
                <span className="badge" style={{ fontSize: 9, background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid rgba(109,40,217,.2)' }}>👔 {dirs.join(', ')}</span>
              ) : null
            } catch { return null }
          })()}
          <span className="badge" style={{ fontSize: 9, background: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'var(--red-l)' : 'var(--bg2)', color: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'var(--red)' : 'var(--t3)' }}>
            {task.priority}
          </span>
        </div>

        {/* Steps progress */}
        {stepsTotal > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, marginBottom: 4 }}>Steps: {stepsDone}/{stepsTotal}</div>
            <div className="prog-bg" style={{ height: 5 }}>
              <div style={{ width: `${(stepsDone / stepsTotal) * 100}%`, background: stepsDone === stepsTotal ? 'var(--green)' : 'var(--g2)', height: '100%', borderRadius: 3, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {/* Workflow step indicators */}
        {workflow?.steps && (
          <div style={{ marginBottom: 10, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {workflow.steps.map((ws: any, wi: number) => {
              const isDone = ws.status === 'APPROVED' || ws.status === 'COMPLETED'
              const isActive = ws.status === 'IN_REVIEW' || ws.status === 'IN_PROGRESS'
              const isRejected = ws.status === 'REJECTED'
              let bg = 'var(--bg2)', color = 'var(--t3)'
              if (isActive) { bg = 'var(--amber-l)'; color = 'var(--amber)' }
              if (isDone) { bg = 'var(--green-l)'; color = 'var(--green)' }
              if (isRejected) { bg = 'var(--red-l)'; color = 'var(--red)' }
              const shortName = ws.name.replace('Employee Task Completion', 'Employee').replace('EA Review & Verification', 'EA Review').replace('Director Approval', 'Director').replace('EA Final Review & Submit', 'EA Final')
              return (
                <span key={ws.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="badge" style={{ fontSize: 9, padding: '3px 8px', background: bg, color, fontWeight: 700, border: isActive ? '2px solid currentColor' : 'none' }}>
                    {isDone ? '✅' : isActive ? '🔄' : isRejected ? '❌' : '⏳'} {shortName}
                  </span>
                  {wi < workflow.steps.length - 1 && <span style={{ color: 'var(--t3)' }}>→</span>}
                </span>
              )
            })}
          </div>
        )}

        {/* Action buttons based on mode */}
        {mode === 'ea_review' && (
          isActive ? (
            <div style={{ marginTop: 10 }}>
              <textarea className="fi" placeholder="Add comment (optional)..." value={comment}
                onChange={e => setComment(e.target.value)} style={{ minHeight: 60, marginBottom: 8, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-green btn-sm" onClick={() => handleEAApprove(task)} disabled={approvalActionMutation.isPending}>
                  ✓ Verify & Send to Director
                </button>
                <button className="btn btn-red btn-sm" onClick={() => {
                  // EA rejects - send back to employee
                  const eaReviewStep = workflow?.steps?.find((s: any) => s.name.includes('EA Review') && !s.name.includes('Final'))
                  if (eaReviewStep) {
                    approvalActionMutation.mutate({
                      workflowId: workflow.id,
                      stepInstanceId: eaReviewStep.id,
                      action: 'REJECT',
                      comments: comment || 'EA rejected - needs revision',
                      approverId: currentUserId,
                    })
                  }
                }} disabled={approvalActionMutation.isPending}>
                  ↩ Return to Employee
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setActionTask(null); setComment('') }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm" style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 700 }}
              onClick={() => setActionTask(task.id)}>
              ✓ Review & Act
            </button>
          )
        )}

        {mode === 'director' && (
          isActive ? (
            <div style={{ marginTop: 10 }}>
              <textarea className="fi" placeholder="Add comment (optional)..." value={comment}
                onChange={e => setComment(e.target.value)} style={{ minHeight: 60, marginBottom: 8, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-green btn-sm" onClick={() => handleDirectorApprove(task)} disabled={approvalActionMutation.isPending}>
                  ✓ Approve & Send to EA Final
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid var(--purple)', fontWeight: 700 }}
                  onClick={() => handleDirectorSendBack(task)} disabled={approvalActionMutation.isPending}>
                  ↩ Send Back to EA
                </button>
                <button className="btn btn-red btn-sm" onClick={() => handleDirectorReject(task)} disabled={approvalActionMutation.isPending}>
                  ✕ Reject & Return to Employee
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setActionTask(null); setComment('') }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm" style={{ background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid var(--purple)', fontWeight: 700 }}
              onClick={() => setActionTask(task.id)}>
              👔 Review & Act
            </button>
          )
        )}

        {mode === 'ea_final' && (
          isActive ? (
            <div style={{ marginTop: 10 }}>
              <textarea className="fi" placeholder="Add comment (optional)..." value={comment}
                onChange={e => setComment(e.target.value)} style={{ minHeight: 60, marginBottom: 8, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-green btn-sm" onClick={() => handleEAFinalApprove(task)} disabled={approvalActionMutation.isPending}>
                  ✓ Final Approve & Send to Employee
                </button>
                <button className="btn btn-red btn-sm" onClick={() => handleEAFinalReject(task)} disabled={approvalActionMutation.isPending}>
                  ✕ Reject & Return to Employee
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setActionTask(null); setComment('') }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm" style={{ background: 'var(--green-l)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 700 }}
              onClick={() => setActionTask(task.id)}>
              ✅ Final Review & Act
            </button>
          )
        )}

        {mode === 'approved' && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--green-l)', borderRadius: 8, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ✅ All approvals done. Waiting for employee to do final submit.
          </div>
        )}

        {mode === 'completed' && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--green-l)', borderRadius: 8, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ✅ Task fully completed.
          </div>
        )}
      </div>
    )
  }

  const currentList = approvalTab === 'ea_review' ? eaReviewTasks
    : approvalTab === 'director' ? directorReviewTasks
    : approvalTab === 'ea_final' ? eaFinalTasks
    : approvalTab === 'approved' ? approvedTasks
    : completedTasks

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Approval Center</h2>
          <p>Review and manage task approvals · EA → Director → EA Final routing</p>
        </div>
      </div>

      <div className="page-accent" />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab${approvalTab === tab.id ? ' active' : ''}`}
            onClick={() => setApprovalTab(tab.id)}>
            {tab.label}
            {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
          </div>
        ))}
      </div>

      {/* Pending review alert */}
      {eaReviewTasks.length > 0 && approvalTab === 'ea_review' && (
        <div className="alert alert-gold" style={{ marginBottom: 14 }}>
          <div className="alert-icon">🔔</div>
          <div className="alert-body">
            <div className="alert-title" style={{ color: 'var(--g2)' }}>{eaReviewTasks.length} Task(s) Need EA Review</div>
            <div className="alert-sub">Employee steps with director dependency are waiting for your verification</div>
          </div>
          <span className="alert-cnt" style={{ background: 'var(--amber)', animation: 'ap-pulse 2s infinite' }}>{eaReviewTasks.length}</span>
        </div>
      )}

      {directorReviewTasks.length > 0 && approvalTab === 'director' && (
        <div className="alert alert-gold" style={{ marginBottom: 14 }}>
          <div className="alert-icon">👔</div>
          <div className="alert-body">
            <div className="alert-title" style={{ color: 'var(--purple)' }}>{directorReviewTasks.length} Task(s) Need Director Approval</div>
            <div className="alert-sub">EA has verified and sent these tasks for your approval</div>
          </div>
          <span className="alert-cnt" style={{ background: 'var(--purple)', animation: 'ap-pulse 2s infinite' }}>{directorReviewTasks.length}</span>
        </div>
      )}

      {/* Task cards */}
      {currentList.length === 0 ? (
        <div className="empty">
          <h3>No items in this category</h3>
          <p>All caught up! No items pending review.</p>
        </div>
      ) : (
        currentList.map((task: any) => renderTaskCard(task, approvalTab as any))
      )}
    </>
  )
}
