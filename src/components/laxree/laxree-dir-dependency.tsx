'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

export function LaxreeDirDependency() {
  const { currentUser, currentUserId, currentRole, addToast } = useWorkflowStore()
  const [actionComments, setActionComments] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data: dashData } = useQuery({
    queryKey: ['dashboard', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
  })

  // Get workflow steps assigned to current user (EA/Director)
  const { data: approvalsData } = useQuery({
    queryKey: ['pending-approval-steps', currentUserId],
    queryFn: () => fetch(`/api/approvals?userId=${currentUserId}`).then(r => r.json()),
  })

  // Also get all tasks to find ON_HOLD tasks (sent to director)
  const { data: allTasks = [] } = useQuery({
    queryKey: ['dir-dep-tasks'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()),
  })

  const pendingSteps = (approvalsData as any)?.pending || []
  const d = dashData as any
  const userPerf = d?.userPerformance || []

  // Workflow steps pending
  const eaReviewSteps = pendingSteps.filter((s: any) => s.name?.includes('EA Review') && !s.name?.includes('Final'))
  const directorSteps = pendingSteps.filter((s: any) => s.name?.includes('Director'))
  const eaFinalSteps = pendingSteps.filter((s: any) => s.name?.includes('EA Final'))

  // ALSO find tasks that are ON_HOLD (sent to director via Approval Center)
  // and tasks that are IN_REVIEW (waiting for director approval via workflow)
  const directorPendingTasks = Array.isArray(allTasks) ? allTasks.filter((t: any) =>
    (t.status === 'ON_HOLD' || t.status === 'IN_REVIEW') &&
    t.directorDependency &&
    t.workflowId
  ) : []

  // EA review tasks - IN_REVIEW tasks with workflow (at EA Review stage, not EA Final)
  const eaReviewTasks = Array.isArray(allTasks) ? allTasks.filter((t: any) =>
    t.status === 'IN_REVIEW' && t.workflowId &&
    !(t.workflow?.steps?.some((s: any) => s.name?.includes('EA Final') && s.status === 'IN_REVIEW'))
  ) : []

  // EA Final review tasks - tasks where director has already approved (workflow step at EA Final)
  const eaFinalTasks = Array.isArray(allTasks) ? allTasks.filter((t: any) => {
    if (!t.workflow?.steps) return false
    const currentStep = t.workflow.steps.find((s: any) => s.order === t.workflow.currentStepOrder)
    return currentStep?.name?.includes('EA Final') && t.status === 'IN_REVIEW'
  }) : []

  const directorUsers = userPerf.filter((u: any) => u.role === 'DIRECTOR' || u.role === 'EA')
  const bottleneckUsers = userPerf.filter((u: any) => u.overdue > 2)

  const approvalMutation = useMutation({
    mutationFn: (data: { workflowId: string; stepInstanceId: string; action: string; comments: string; approverId: string }) =>
      fetch('/api/approval-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approval-steps'] })
      qc.invalidateQueries({ queryKey: ['dir-dep-tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      addToast('ok', 'Action completed')
      setActionComments({})
    },
  })

  const taskActionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dir-dep-tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-approval-steps'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('ok', 'Task updated')
      setActionComments({})
    },
  })

  const handleApproval = (step: any, action: string) => {
    approvalMutation.mutate({
      workflowId: step.workflowId || step.workflow?.id,
      stepInstanceId: step.id,
      action,
      comments: actionComments[step.id] || `${action} by ${currentUserId}`,
      approverId: currentUserId,
    })
  }

  // Handle director action on a task (approve/reject/send-back)
  const handleDirectorTaskAction = (task: any, action: string) => {
    if (task.workflow?.steps) {
      const directorStep = task.workflow.steps.find((s: any) => s.name?.includes('Director'))
      if (directorStep) {
        approvalMutation.mutate({
          workflowId: task.workflowId,
          stepInstanceId: directorStep.id,
          action,
          comments: actionComments[task.id] || `${action} by ${currentUserId}`,
          approverId: currentUserId,
        })
        return
      }
    }
    // Fallback: just update task status
    let newStatus = 'IN_REVIEW'
    if (action === 'APPROVE') newStatus = 'IN_REVIEW' // send to EA Final
    else if (action === 'REJECT') newStatus = 'PENDING' // send back to employee
    else if (action === 'SEND_BACK') newStatus = 'IN_REVIEW' // send back to EA
    taskActionMutation.mutate({ id: task.id, status: newStatus })
  }

  const stageColors: Record<string, { bg: string; color: string; border: string }> = {
    'EA Review': { bg: 'var(--amber-l)', color: 'var(--amber)', border: 'var(--amber)' },
    'Director': { bg: 'var(--purple-l)', color: 'var(--purple)', border: 'var(--purple)' },
    'EA Final': { bg: 'var(--green-l)', color: 'var(--green)', border: 'var(--green)' },
  }

  const renderApprovalCard = (step: any, stage: string) => {
    const colors = stageColors[stage] || stageColors['EA Review']
    return (
      <div key={step.id} style={{ border: `1px solid ${colors.border}30`, borderRadius: 8, padding: 14, marginBottom: 10, background: colors.bg, borderLeft: `3px solid ${colors.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{step.workflow?.title || 'Workflow'}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Step: {step.name} · Order: {step.order}</div>
            {step.assignee && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>Assignee: {step.assignee.name} ({step.assignee.role})</div>}
          </div>
          <span className="badge" style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.border}40` }}>
            {stage}
          </span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            className="fi"
            placeholder="Add comments…"
            value={actionComments[step.id] || ''}
            onChange={e => setActionComments(prev => ({ ...prev, [step.id]: e.target.value }))}
            style={{ fontSize: 11, padding: '6px 10px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {stage === 'EA Review' && (
            <>
              <button className="btn btn-green btn-xs" onClick={() => handleApproval(step, 'APPROVE')} disabled={approvalMutation.isPending}>
                ✓ Verify & Send to Director
              </button>
              <button className="btn btn-red btn-xs" onClick={() => handleApproval(step, 'REJECT')} disabled={approvalMutation.isPending}>
                ↩ Reject & Return to Employee
              </button>
            </>
          )}
          {stage === 'Director' && (
            <>
              <button className="btn btn-green btn-xs" onClick={() => handleApproval(step, 'APPROVE')} disabled={approvalMutation.isPending}>
                ✓ Approve & Send to EA
              </button>
              <button className="btn btn-xs" style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)' }} onClick={() => handleApproval(step, 'SEND_BACK')} disabled={approvalMutation.isPending}>
                ↩ Send Back to EA
              </button>
              <button className="btn btn-red btn-xs" onClick={() => handleApproval(step, 'REJECT')} disabled={approvalMutation.isPending}>
                ✕ Reject & Return to Employee
              </button>
            </>
          )}
          {stage === 'EA Final' && (
            <>
              <button className="btn btn-green btn-xs" onClick={() => handleApproval(step, 'APPROVE')} disabled={approvalMutation.isPending}>
                ✓ Submit to Employee
              </button>
              <button className="btn btn-red btn-xs" onClick={() => handleApproval(step, 'REJECT')} disabled={approvalMutation.isPending}>
                ↩ Return to Employee
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Render a task card for director approval (from ON_HOLD tasks)
  const renderDirectorTaskCard = (task: any) => {
    const owner = task.owner
    const dirs = task.directorDependency ? JSON.parse(task.directorDependency) : []
    return (
      <div key={task.id} style={{ border: '1px solid rgba(109,40,217,.2)', borderRadius: 8, padding: 14, marginBottom: 10, background: 'var(--purple-l)', borderLeft: '3px solid var(--purple)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{task.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {owner?.name || 'Unassigned'} · {owner?.department || '—'}
            </div>
            {dirs.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 2, fontWeight: 600 }}>
                👔 Director: {dirs.join(', ')}
              </div>
            )}
          </div>
          <span className="badge" style={{ background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid rgba(109,40,217,.3)', fontWeight: 700 }}>
            {task.status === 'ON_HOLD' ? 'Awaiting Director' : 'Director Review'}
          </span>
        </div>

        {task.category && <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--amber-l)', color: 'var(--amber)', marginRight: 4 }}>{task.category}</span>}
        {task.priority && <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'var(--red-l)' : 'var(--bg2)', color: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'var(--red)' : 'var(--t3)' }}>{task.priority}</span>}

        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <input
            className="fi"
            placeholder="Add comments…"
            value={actionComments[task.id] || ''}
            onChange={e => setActionComments(prev => ({ ...prev, [task.id]: e.target.value }))}
            style={{ fontSize: 11, padding: '6px 10px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-green btn-xs" onClick={() => handleDirectorTaskAction(task, 'APPROVE')} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
            ✓ Approve & Send to EA
          </button>
          <button className="btn btn-xs" style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid var(--amber)' }} onClick={() => handleDirectorTaskAction(task, 'SEND_BACK')} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
            ↩ Send Back to EA
          </button>
          <button className="btn btn-red btn-xs" onClick={() => handleDirectorTaskAction(task, 'REJECT')} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
            ✕ Reject & Return to Employee
          </button>
        </div>
      </div>
    )
  }

  // Render EA review task card
  const renderEAReviewTaskCard = (task: any) => {
    const owner = task.owner
    return (
      <div key={task.id} style={{ border: '1px solid rgba(217,119,6,.2)', borderRadius: 8, padding: 14, marginBottom: 10, background: 'var(--amber-l)', borderLeft: '3px solid var(--amber)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{task.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {owner?.name || 'Unassigned'} · {owner?.department || '—'} · EA Review
            </div>
          </div>
          <span className="badge" style={{ background: 'var(--amber-l)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,.3)', fontWeight: 700 }}>
            EA Review
          </span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            className="fi"
            placeholder="Add comments…"
            value={actionComments[task.id] || ''}
            onChange={e => setActionComments(prev => ({ ...prev, [task.id]: e.target.value }))}
            style={{ fontSize: 11, padding: '6px 10px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-green btn-xs" onClick={() => {
            // Use the proper approval-action API
            if (task.workflow?.steps) {
              const eaReviewStep = task.workflow.steps.find((s: any) => s.name?.includes('EA Review') && !s.name?.includes('Final'))
              if (eaReviewStep) {
                approvalMutation.mutate({
                  workflowId: task.workflowId,
                  stepInstanceId: eaReviewStep.id,
                  action: 'APPROVE',
                  comments: actionComments[task.id] || 'EA verified and sent to Director',
                  approverId: currentUserId,
                })
                return
              }
            }
            // Fallback
            taskActionMutation.mutate({ id: task.id, status: 'ON_HOLD' })
          }} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
            ✓ Verify & Send to Director
          </button>
          <button className="btn btn-red btn-xs" onClick={() => {
            // Use the proper approval-action API
            if (task.workflow?.steps) {
              const eaReviewStep = task.workflow.steps.find((s: any) => s.name?.includes('EA Review') && !s.name?.includes('Final'))
              if (eaReviewStep) {
                approvalMutation.mutate({
                  workflowId: task.workflowId,
                  stepInstanceId: eaReviewStep.id,
                  action: 'REJECT',
                  comments: actionComments[task.id] || 'EA rejected - needs revision',
                  approverId: currentUserId,
                })
                return
              }
            }
            // Fallback
            taskActionMutation.mutate({ id: task.id, status: 'PENDING' })
          }} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
            ↩ Return to Employee
          </button>
        </div>
      </div>
    )
  }

  // Total counts combining workflow steps and direct tasks
  const totalEAReview = eaReviewSteps.length + eaReviewTasks.length
  const totalDirector = directorSteps.length + directorPendingTasks.length
  const totalEAFinal = eaFinalSteps.length + eaFinalTasks.length

  return (
    <div>
      <div className="ph">
        <div className="ph-left">
          <h2>Director Dependency Center</h2>
          <p>Approval routing, dependency management &amp; task flow control</p>
        </div>
        <div className="ph-right">
          <span className="badge" style={{ background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid rgba(109,40,217,.2)' }}>
            👔 Director View
          </span>
        </div>
      </div>
      <div className="page-accent" style={{ background: 'linear-gradient(90deg,var(--purple),var(--g4),transparent)' }} />

      {/* Flow Diagram */}
      <div className="lcard" style={{ padding: '14px 18px', marginBottom: 14, background: 'linear-gradient(135deg,rgba(109,40,217,.06),var(--card))', borderLeft: '3px solid var(--purple)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--purple)', marginBottom: 10 }}>
          ⚙ Approval Flow
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--blue-l)', color: 'var(--blue)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800 }}>👤 Employee</div>
          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--amber-l)', color: 'var(--amber)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800 }}>📋 EA Review</div>
          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--purple-l)', color: 'var(--purple)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800, border: '1.5px solid var(--purple)' }}>👔 Director Approval</div>
          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--green-l)', color: 'var(--green)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800 }}>✅ EA Final Review</div>
          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--blue-l)', color: 'var(--blue)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800 }}>👤 Employee Continue</div>
          <span style={{ color: 'var(--purple)', fontSize: 12, fontWeight: 900 }}>→</span>
          <div style={{ background: 'var(--green-l)', color: 'var(--green)', padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 800 }}>✅ Complete</div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="stat-grid sg-4" style={{ marginBottom: 14 }}>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--amber)' }} />
          <div className="sc-top">
            <div><div className="sc-label">EA Review Pending</div><div className="sc-val" style={{ color: 'var(--amber)' }}>{totalEAReview}</div></div>
            <div className="sc-icon" style={{ background: 'var(--amber-m)' }}>📋</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--purple)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Director Approval</div><div className="sc-val" style={{ color: 'var(--purple)' }}>{totalDirector}</div></div>
            <div className="sc-icon" style={{ background: 'var(--purple-m)' }}>👔</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top">
            <div><div className="sc-label">EA Final Review</div><div className="sc-val" style={{ color: 'var(--green)' }}>{totalEAFinal}</div></div>
            <div className="sc-icon" style={{ background: 'var(--green-m)' }}>✅</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Bottleneck Risk</div><div className="sc-val" style={{ color: 'var(--red)' }}>{bottleneckUsers.length}</div></div>
            <div className="sc-icon" style={{ background: 'var(--red-m)' }}>⚠</div>
          </div>
        </div>
      </div>

      {/* Stage 1: EA Review */}
      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="lcard">
          <div className="ch">
            <div className="ct" style={{ color: 'var(--amber)' }}>📋 Stage 1: EA Review</div>
            <span className="badge" style={{ background: 'var(--amber-l)', color: 'var(--amber)' }}>{totalEAReview} pending</span>
          </div>
          <div className="cb">
            {totalEAReview === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--t3)', fontSize: 12 }}>No tasks pending EA review</div>
            ) : (
              <>
                {eaReviewSteps.map((s: any) => renderApprovalCard(s, 'EA Review'))}
                {eaReviewTasks.map((t: any) => renderEAReviewTaskCard(t))}
              </>
            )}
          </div>
        </div>

        {/* Stage 2: Director Approval */}
        <div className="lcard" style={{ borderLeft: '3px solid var(--purple)' }}>
          <div className="ch">
            <div className="ct" style={{ color: 'var(--purple)' }}>👔 Stage 2: Director Approval</div>
            <span className="badge" style={{ background: 'var(--purple-l)', color: 'var(--purple)' }}>{totalDirector} pending</span>
          </div>
          <div className="cb">
            {totalDirector === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--t3)', fontSize: 12 }}>No tasks pending director approval</div>
            ) : (
              <>
                {directorSteps.map((s: any) => renderApprovalCard(s, 'Director'))}
                {directorPendingTasks.map((t: any) => renderDirectorTaskCard(t))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stage 3: EA Final Review */}
      <div className="lcard" style={{ marginBottom: 14, borderLeft: '3px solid var(--green)' }}>
        <div className="ch">
          <div className="ct" style={{ color: 'var(--green)' }}>✅ Stage 3: EA Final Review & Submit</div>
          <span className="badge" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>{totalEAFinal} pending</span>
        </div>
        <div className="cb">
          {totalEAFinal === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--t3)', fontSize: 12 }}>No tasks pending EA final review</div>
          ) : (
            <>
              {eaFinalSteps.map((s: any) => renderApprovalCard(s, 'EA Final'))}
              {eaFinalTasks.map((t: any) => (
                <div key={t.id} style={{ border: '1px solid rgba(21,128,61,.2)', borderRadius: 8, padding: 14, marginBottom: 10, background: 'var(--green-l)', borderLeft: '3px solid var(--green)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{t.owner?.name} · Director approved</div>
                  <div style={{ marginTop: 8 }}>
                    <input className="fi" placeholder="Final comments…" value={actionComments[t.id] || ''} onChange={e => setActionComments(prev => ({ ...prev, [t.id]: e.target.value }))} style={{ fontSize: 11, padding: '6px 10px', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-green btn-xs" onClick={() => {
                        if (t.workflow?.steps) {
                          const eaFinalStep = t.workflow.steps.find((s: any) => s.name?.includes('EA Final'))
                          if (eaFinalStep) {
                            approvalMutation.mutate({ workflowId: t.workflowId, stepInstanceId: eaFinalStep.id, action: 'APPROVE', comments: actionComments[t.id] || 'Final approved', approverId: currentUserId })
                            return
                          }
                        }
                        taskActionMutation.mutate({ id: t.id, status: 'IN_PROGRESS' })
                      }} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
                        ✓ Submit to Employee
                      </button>
                      <button className="btn btn-red btn-xs" onClick={() => {
                        if (t.workflow?.steps) {
                          const eaFinalStep = t.workflow.steps.find((s: any) => s.name?.includes('EA Final'))
                          if (eaFinalStep) {
                            approvalMutation.mutate({ workflowId: t.workflowId, stepInstanceId: eaFinalStep.id, action: 'REJECT', comments: actionComments[t.id] || 'Returned', approverId: currentUserId })
                            return
                          }
                        }
                        taskActionMutation.mutate({ id: t.id, status: 'PENDING' })
                      }} disabled={approvalMutation.isPending || taskActionMutation.isPending}>
                        ↩ Return to Employee
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Director & EA Approvers */}
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">👔 Director &amp; EA Approvers</div><span className="badge" style={{ background: 'var(--purple-l)', color: 'var(--purple)' }}>Key Personnel</span></div>
        <div className="cb">
          <div className="mc-grid">
            {directorUsers.map((u: any) => (
              <div key={u.id} className="mc" style={{ borderLeft: '3px solid var(--purple)' }}>
                <div className="mc-top">
                  <div className="av" style={{ width: 36, height: 36, fontSize: 13, background: 'linear-gradient(135deg,var(--purple),#8b5cf6)' }}>
                    {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="mc-info">
                    <div className="mc-name">{u.name}</div>
                    <div className="mc-role"><span className="badge b-purple" style={{ fontSize: 9, padding: '1px 6px' }}>{u.role}</span> {u.department || '—'}</div>
                  </div>
                </div>
                <div className="mc-stat"><span>Pending Approvals</span><span>{u.total}</span></div>
                <div className="mc-stat"><span>Overdue</span><span style={{ color: u.overdue > 0 ? 'var(--red)' : 'var(--t2)' }}>{u.overdue}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottleneck Analysis */}
      {bottleneckUsers.length > 0 && (
        <div className="lcard" style={{ borderLeft: '3px solid var(--red)' }}>
          <div className="ch"><div className="ct">⚠ Bottleneck Risk</div><span className="badge b-red f10">Alert</span></div>
          <div className="cb">
            {bottleneckUsers.map((u: any) => (
              <div key={u.id} className="esc-item">
                <span className="esc-badge">{u.overdue} OVERDUE</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{u.role} · {u.department || '—'} · Score: {u.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
