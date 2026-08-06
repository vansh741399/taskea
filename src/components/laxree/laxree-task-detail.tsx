'use client'

// Build: 2026-06-19-v13 — Global Task Detail Modal
//
// This is a SINGLE source of truth for the task detail modal. It is rendered
// globally in HomePage so that ANY page (Admin All Tasks, EA My Tasks,
// Employee My Tasks, Employee Dashboard) can open it by calling
// `setSelectedTaskId(task.id)` in the workflow store.
//
// Why this exists:
//   Previously the detail modal was inline inside `laxree-tasks.tsx`, so it
//   only worked on the Admin/EA "All Tasks" page. When employees clicked
//   "View Details" on their My Tasks page, `selectedTaskId` was set but NO
//   modal rendered — the click did nothing visible. This global component
//   fixes that bug.
//
// It includes:
//   - Task header (avatar, title, status, priority, department, category, SLA)
//   - Description block
//   - Details grid (assignee, due date, created, completed, revise info)
//   - Task steps with role-based "Complete" button (ADMIN/EA only)
//   - Role-based action buttons (Done / Revise / Cancel — ADMIN/EA only;
//     read-only notice for employees)
//   - Completion badge + score
//   - Audit trail

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useRef } from 'react'

const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Attachment helpers ─────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function getFileIconForName(fileName: string, fileType: string) {
  const t = (fileType || '').toLowerCase()
  const n = (fileName || '').toLowerCase()
  if (t.startsWith('image/')) return '🖼️'
  if (t === 'application/pdf' || n.endsWith('.pdf')) return '📄'
  if (t.includes('spreadsheet') || n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv')) return '📊'
  if (t.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return '📝'
  if (t.includes('presentation') || n.endsWith('.pptx') || n.endsWith('.ppt')) return '📽️'
  if (t.startsWith('text/')) return '📃'
  if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return '🗜️'
  return '📎'
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

const priorityBadge: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: '#FFF1F2', color: '#E11D48' },
  HIGH: { bg: '#FEF2F2', color: '#DC2626' },
  MEDIUM: { bg: '#FFFBEB', color: '#D97706' },
  LOW: { bg: '#EFF6FF', color: '#2563EB' },
}

function getSlaStatus(task: any) {
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return null
  if (!task.dueDate) return { label: 'On Track', bg: '#ECFDF5', color: '#059669' }
  const now = new Date()
  const due = new Date(task.dueDate)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'Overdue', bg: '#FEF2F2', color: '#DC2626' }
  if (diffDays <= 2) return { label: 'Due Soon', bg: '#FFFBEB', color: '#D97706' }
  return { label: 'On Track', bg: '#ECFDF5', color: '#059669' }
}

export function LaxreeTaskDetail() {
  const { selectedTaskId, setSelectedTaskId, currentRole, currentUserId, addToast } = useWorkflowStore()
  const qc = useQueryClient()
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch all tasks (cached). Query is only enabled when a task is selected.
  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['task-detail-tasks', currentUserId],
    queryFn: () => fetch('/api/tasks').then(r => {
      if (!r.ok) throw new Error('Failed to fetch tasks')
      return r.json()
    }),
    enabled: !!selectedTaskId,
    staleTime: 0,
  })

  // ─── Fetch attachments for the currently selected task ────────────────
  // Kept separate from the main tasks query so adding/removing an attachment
  // only invalidates this small query, not the whole tasks list.
  const { data: attachmentsResp, refetch: refetchAttachments } = useQuery<{ attachments: any[] }>({
    queryKey: ['task-attachments', selectedTaskId],
    queryFn: () => fetch(`/api/tasks/${selectedTaskId}/attachments`).then(r => {
      if (!r.ok) throw new Error('Failed to fetch attachments')
      return r.json()
    }),
    enabled: !!selectedTaskId,
    staleTime: 0,
  })
  const attachments = attachmentsResp?.attachments || []

  if (!selectedTaskId) return null
  const task = (Array.isArray(tasks) ? tasks : []).find(t => t.id === selectedTaskId)
  if (!task) return null

  const owner = task.owner
  const stepsTotal = task.taskSteps?.length || 0
  const stepsDone = task.taskSteps?.filter((s: any) => s.status === 'COMPLETED').length || 0
  const sla = getSlaStatus(task)
  const pBadge = priorityBadge[task.priority] || priorityBadge.MEDIUM
  const sStyle = statusStyle[task.status] || statusStyle.PENDING

  // ADMIN and EA can modify tasks (Done/Revise/Cancel/Complete steps)
  const canModifyTask = currentRole === 'ADMIN' || currentRole === 'EA'

  // Step completion handler — ADMIN/EA only
  const completeStep = async (stepId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/steps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, action: 'complete' }),
      })
      const data = await res.json()
      if (data.allDone) {
        addToast('ok', 'All steps done! Task completed ✓')
      } else {
        addToast('ok', 'Step completed! ✓')
      }
      qc.invalidateQueries({ queryKey: ['task-detail-tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks-list'] })
      qc.invalidateQueries({ queryKey: ['emp-my-tasks'] })
      qc.invalidateQueries({ queryKey: ['emp-tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch {
      addToast('err', 'Failed to complete step')
    }
  }

  // Task-level status change handler
  const handleStatusChange = async (newStatus: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        addToast('ok', successMsg)
        qc.invalidateQueries({ queryKey: ['task-detail-tasks'] })
        qc.invalidateQueries({ queryKey: ['tasks-list'] })
        qc.invalidateQueries({ queryKey: ['emp-my-tasks'] })
        qc.invalidateQueries({ queryKey: ['emp-tasks'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
          setSelectedTaskId(null)
        }
      } else {
        addToast('err', 'Failed to update task')
      }
    } catch {
      addToast('err', 'Failed to update task')
    }
  }

  // ─── Attachment handlers ──────────────────────────────────────────────
  const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB per file
  const MAX_TOTAL_FILES = 10

  const handleAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError('')
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Validate before upload
    const accepted: File[] = []
    for (const f of selected) {
      if (f.size > MAX_FILE_SIZE) {
        setAttachmentError(`"${f.name}" is too large. Max 15 MB per file.`)
        continue
      }
      if (f.size === 0) {
        setAttachmentError(`"${f.name}" is empty.`)
        continue
      }
      accepted.push(f)
    }
    if (attachments.length + accepted.length > MAX_TOTAL_FILES) {
      setAttachmentError(`Max ${MAX_TOTAL_FILES} files per task. Task already has ${attachments.length}.`)
      return
    }
    if (accepted.length === 0) return

    setUploadingFiles(true)
    try {
      const fd = new FormData()
      accepted.forEach(f => fd.append('files', f))
      if (currentUserId) fd.append('uploadedById', currentUserId)
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const ok = data?.uploaded?.length || 0
        const bad = data?.errors?.length || 0
        if (ok > 0 && bad === 0) addToast('ok', `${ok} attachment(s) uploaded`)
        else if (ok > 0 && bad > 0) addToast('ok', `${ok} uploaded, ${bad} failed`)
        else if (bad > 0) addToast('err', `Upload failed: ${data.errors[0]?.reason || 'unknown'}`)
        refetchAttachments()
        qc.invalidateQueries({ queryKey: ['task-attachments', task.id] })
      } else {
        addToast('err', 'Attachment upload failed')
      }
    } catch {
      addToast('err', 'Attachment upload failed')
    }
    setUploadingFiles(false)
  }

  const handleDownloadAttachment = (attachmentId: string) => {
    // Browser handles the download via direct URL navigation
    if (typeof window !== 'undefined') {
      window.open(`/api/tasks/${task.id}/attachments/${attachmentId}`, '_blank')
    }
  }

  const handleDeleteAttachment = async (attachmentId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        addToast('ok', 'Attachment deleted')
        refetchAttachments()
        qc.invalidateQueries({ queryKey: ['task-attachments', task.id] })
      } else {
        addToast('err', 'Failed to delete attachment')
      }
    } catch {
      addToast('err', 'Failed to delete attachment')
    }
  }

  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setSelectedTaskId(null) }}>
      <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="mx" onClick={() => setSelectedTaskId(null)}>✕</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div className="av" style={{ width: 44, height: 44, fontSize: 15, background: sStyle.color, flexShrink: 0 }}>
            {getInitials(owner?.name || 'T')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt" style={{ marginBottom: 4, wordBreak: 'break-word' }}>{task.title}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge" style={{ background: sStyle.bg, color: sStyle.color, fontWeight: 700 }}>{sStyle.label}</span>
              <span className="badge" style={{ background: pBadge.bg, color: pBadge.color, fontWeight: 700 }}>{task.priority || 'MEDIUM'}</span>
              {task.department && <span className="badge b-gray">{task.department}</span>}
              {task.category && <span className="badge" style={{ background: 'var(--amber-l)', color: 'var(--amber)' }}>{task.category}</span>}
              {sla && <span className="badge" style={{ background: sla.bg, color: sla.color }}>{sla.label}</span>}
            </div>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div style={{ marginBottom: 14, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {task.description}
          </div>
        )}

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 12 }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
            <span style={{ color: 'var(--t3)', fontWeight: 700 }}>Assignee:</span> {owner?.name || 'Unassigned'}
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
            <span style={{ color: 'var(--t3)', fontWeight: 700 }}>Due:</span> {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'}
          </div>
          {task.createdAt && (
            <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
              <span style={{ color: 'var(--t3)', fontWeight: 700 }}>Created:</span> {new Date(task.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </div>
          )}
          {task.completedAt && (
            <div style={{ padding: '8px 12px', background: 'var(--green-l)', borderRadius: 6, color: 'var(--green)', fontWeight: 600 }}>
              ✓ Completed: {new Date(task.completedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </div>
          )}
          {task.reviseReason && (
            <div style={{ padding: '8px 12px', background: 'var(--amber-l)', borderRadius: 6, color: 'var(--amber)', fontWeight: 600, gridColumn: '1 / -1' }}>
              ↩ Revised{task.reviseCount > 0 ? ` ×${task.reviseCount}` : ''}: {task.reviseReason}
              {task.reviseNextDate && <span style={{ marginLeft: 8 }}>· Next date: {new Date(task.reviseNextDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>}
            </div>
          )}
          {!task.reviseReason && task.reviseCount > 0 && (
            <div style={{
              padding: '6px 12px',
              background: 'var(--blue-l)',
              borderRadius: 6,
              color: 'var(--blue)',
              fontWeight: 700, gridColumn: '1 / -1',
            }}>
              ↩ Revised ×{task.reviseCount}
            </div>
          )}
        </div>

        <div className="gold-divider" />

        {/* Step Progress */}
        {stepsTotal > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 8 }}>
              Task Steps ({stepsDone}/{stepsTotal})
            </div>
            {task.taskSteps.map((step: any, i: number) => {
              const isCompleted = step.status === 'COMPLETED'
              const isCurrentStep = !isCompleted && (i === 0 || task.taskSteps[i - 1]?.status === 'COMPLETED')
              const isMyStep = step.assigneeId === currentUserId
              return (
                <div key={step.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  background: isCompleted ? 'var(--green-l)' : isCurrentStep ? 'var(--blue-l)' : 'var(--bg2)',
                  borderRadius: 8, marginBottom: 6,
                  borderLeft: `3px solid ${isCompleted ? 'var(--green)' : isCurrentStep ? 'var(--blue)' : 'var(--b2)'}`,
                  opacity: !isCompleted && !isCurrentStep ? 0.5 : 1,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: isCompleted ? 'var(--green)' : isCurrentStep ? 'var(--blue)' : 'var(--g2)',
                    color: '#fff',
                  }}>
                    {isCompleted ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: isCompleted ? 600 : 700, color: isCompleted ? 'var(--green)' : 'var(--t1)' }}>
                      {step.title}
                    </span>
                    {step.assignee && (
                      <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 6 }}>
                        · {step.assignee.name}{isMyStep ? ' (you)' : ''}
                      </span>
                    )}
                  </div>
                  {/* Step action button — only ADMIN/EA can complete steps */}
                  {!isCompleted && isCurrentStep && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && canModifyTask && (
                    <button
                      className="btn btn-xs"
                      style={{
                        background: 'var(--green-l)',
                        color: 'var(--green)',
                        border: '1px solid var(--green)',
                        fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                      onClick={() => completeStep(step.id)}
                    >
                      ✓ Complete
                    </button>
                  )}
                  <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: isCompleted ? 'var(--green-l)' : 'var(--amber-l)', color: isCompleted ? 'var(--green)' : 'var(--amber)' }}>
                    {isCompleted ? 'Done' : 'Pending'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ACTION BUTTONS — Role-based */}
        <div className="gold-divider" />

        {/* ═══ ATTACHMENTS SECTION (v25·0627) ═══ */}
        {/* Visible to ALL roles. Upload/delete restricted to ADMIN/EA per the
            existing canModifyTask convention; everyone else can download. */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)' }}>
              Attachments
            </div>
            <span className="badge" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--bg2)', color: 'var(--t3)', fontWeight: 700 }}>
              {attachments.length}
            </span>
          </div>

          {canModifyTask && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleAttachmentSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles || attachments.length >= 10}
                className="btn btn-ghost btn-sm"
                style={{
                  border: '1px dashed var(--b2)',
                  width: '100%', textAlign: 'center', padding: '10px',
                  opacity: uploadingFiles || attachments.length >= 10 ? 0.6 : 1,
                  cursor: uploadingFiles || attachments.length >= 10 ? 'not-allowed' : 'pointer',
                }}
              >
                {uploadingFiles
                  ? '⏳ Uploading...'
                  : attachments.length >= 10
                  ? '📁 Max 10 attachments reached'
                  : '📎 + Add Attachment'}
              </button>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontWeight: 600 }}>
                Max 15 MB per file · Images, PDF, docs, Excel, any file · up to 10 files
              </div>
            </>
          )}

          {attachmentError && (
            <div style={{
              marginTop: 8, padding: '8px 12px', borderRadius: 6,
              background: 'var(--red-l)', color: 'var(--red)',
              fontSize: 11, fontWeight: 600,
            }}>
              ⚠ {attachmentError}
            </div>
          )}

          {attachments.length === 0 ? (
            <div style={{
              marginTop: 8, padding: '12px', textAlign: 'center',
              background: 'var(--bg2)', borderRadius: 6,
              fontSize: 11, color: 'var(--t3)', fontWeight: 600,
            }}>
              📭 No attachments yet
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachments.map((att: any) => (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg2)', border: '1px solid var(--b1)',
                }}>
                  <span style={{ fontSize: 18 }}>{getFileIconForName(att.fileName, att.fileType)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {att.fileName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>{formatBytes(att.fileSize)}</span>
                      <span>·</span>
                      <span>{att.fileType || 'file'}</span>
                      {att.createdAt && (
                        <>
                          <span>·</span>
                          <span>added {new Date(att.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(att.id)}
                    className="btn btn-xs"
                    style={{
                      background: 'var(--blue-l)', color: 'var(--blue)',
                      border: '1px solid var(--blue)', fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                    title="Download file"
                  >
                    ⬇ Download
                  </button>
                  {canModifyTask && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id, att.fileName)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--red)', fontSize: 14, fontWeight: 700,
                        padding: '0 4px', flexShrink: 0,
                      }}
                      title="Delete attachment"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Read-only notice for employees */}
          {!canModifyTask && (
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6, fontWeight: 600, fontStyle: 'italic' }}>
              🔒 Only Admin/EA can add or remove attachments. You can download existing files.
            </div>
          )}
        </div>

        <div className="gold-divider" />
        {canModifyTask ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* ADMIN/EA: Full action buttons */}
            {(task.status === 'PENDING' || task.status === 'IN_PROGRESS' || task.status === 'IN_REVIEW' || task.status === 'ON_HOLD') && (
              <>
                {stepsTotal > 0 && stepsDone < stepsTotal ? (
                  <div style={{
                    padding: '8px 16px',
                    background: 'var(--blue-l)',
                    borderRadius: 8,
                    border: '1.5px solid var(--blue)',
                    fontSize: 13, fontWeight: 700, color: 'var(--blue)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    ☰ Complete all steps first ({stepsDone}/{stepsTotal})
                  </div>
                ) : (
                  <button className="btn btn-green" onClick={() => handleStatusChange('COMPLETED', 'Task completed! ✓')}>
                    ✓ Done
                  </button>
                )}
              </>
            )}
            {task.status !== 'CANCELLED' && task.status !== 'COMPLETED' && (
              <button className="btn btn-red btn-sm" onClick={() => handleStatusChange('CANCELLED', 'Task cancelled')} style={{ marginLeft: 'auto' }}>
                🚫 Cancel Task
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* EMPLOYEE/MANAGER/DIRECTOR: Read-only notice */}
            {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
              <div style={{
                padding: '8px 16px',
                background: 'var(--bg2)',
                borderRadius: 8,
                border: '1px solid var(--b2)',
                fontSize: 12, fontWeight: 600, color: 'var(--t3)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                🔒 Only Admin/EA can mark tasks as Done/Revise
              </div>
            )}
          </div>
        )}
        {/* COMPLETED → Show completion badge — everyone sees this */}
        {task.status === 'COMPLETED' && (
          <div style={{
            padding: '8px 16px',
            background: 'var(--green-l)',
            borderRadius: 8,
            border: '1.5px solid var(--green)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 800, color: 'var(--green)',
          }}>
            Completed task ✅
          </div>
        )}
        {/* CANCELLED → Show cancelled badge */}
        {task.status === 'CANCELLED' && (
          <div style={{
            padding: '8px 16px',
            background: 'var(--bg2)',
            borderRadius: 8,
            border: '1px solid var(--b2)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 800, color: 'var(--t3)',
          }}>
            🚫 Task Cancelled
          </div>
        )}

        {/* Audit Trail */}
        <div style={{ marginTop: 14, padding: 12, background: 'var(--bg2)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t3)', marginBottom: 6 }}>Audit Trail</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--g2)' }} />
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>Created — {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}</span>
          </div>
          {task.updatedAt && task.updatedAt !== task.createdAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>Last updated — {new Date(task.updatedAt).toLocaleString()}</span>
            </div>
          )}
          {task.completedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>Completed — {new Date(task.completedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
