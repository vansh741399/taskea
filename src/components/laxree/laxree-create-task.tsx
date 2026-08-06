'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'

const DEPTS = ['Sales', 'Account', 'HR', 'Coordinator', 'Admin', 'Back Office']
const CATEGORIES = ['Routine Work', 'Reconciliation', 'One Time Work', 'Compliance', 'Operations', 'Procurement']
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const FREQUENCIES = ['One Time', 'Daily', 'Weekly', 'Monthly']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Hardcoded director options — only these two directors can assign tasks.
// The IDs match the DIRECTOR-role users in the seed file & auth route:
//   - Samarth Sir (DIRECTOR login: samarth / Samarth@2025 → user-dir4)
//   - Ashish Sir  (DIRECTOR login: ashish  / Ashish@2025  → user-dir3)
// Tasks created with one of these IDs will appear on that director's dashboard.
// FOUNDER is NOT in this list because when FOUNDER creates a task, we auto-set
// assignedById to FOUNDER's userId (currentUserId) — FOUNDER is always the assigner
// of their own tasks. They don't pick from this dropdown.
const DIRECTOR_OPTIONS = [
  { id: 'user-dir4', name: 'Samarth Sir' },
  { id: 'user-dir3', name: 'Ashish Sir' },
]

interface TaskStep {
  title: string
}

export function LaxreeCreateTask() {
  const { createTaskOpen, setCreateTaskOpen, addToast, currentUserId, currentUserName, currentRole } = useWorkflowStore()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  // Default "Assigned By" —
  // • If FOUNDER is creating the task: always themselves (currentUserId). FOUNDER is the
  //   assigner of every task they create. The dropdown is hidden when FOUNDER is logged in.
  // • If a known director is creating: pre-select themselves.
  // • Otherwise (ADMIN/EA): default to Samarth Sir.
  const isFounder = currentRole === 'FOUNDER'
  const defaultAssignedById = (() => {
    if (isFounder) return currentUserId
    const match = DIRECTOR_OPTIONS.find(d => d.id === currentUserId || d.name === currentUserName)
    return match?.id || DIRECTOR_OPTIONS[0].id
  })()

  const [form, setForm] = useState({
    title: '', description: '', assignTo: '', department: '',
    category: CATEGORIES[0], priority: 'MEDIUM', dueDate: '',
    frequency: 'One Time',
    assignedById: defaultAssignedById,
  })

  const [selectedWeekDays, setSelectedWeekDays] = useState<string[]>([])
  const [selectedMonthDates, setSelectedMonthDates] = useState<number[]>([])
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Attachment helpers ────────────────────────────────────────────────
  // Files selected here are stored in component state and uploaded AFTER the
  // task is created (attachments need a taskId to link to). The upload is a
  // multipart POST to /api/tasks/[id]/attachments.
  const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB per file
  const MAX_TOTAL_FILES = 10

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('')
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return

    const accepted: File[] = []
    for (const f of selected) {
      if (f.size > MAX_FILE_SIZE) {
        setFileError(`"${f.name}" is too large. Max 15 MB per file.`)
        continue
      }
      if (f.size === 0) {
        setFileError(`"${f.name}" is empty.`)
        continue
      }
      accepted.push(f)
    }

    if (pendingFiles.length + accepted.length > MAX_TOTAL_FILES) {
      setFileError(`Max ${MAX_TOTAL_FILES} files per task. You already have ${pendingFiles.length}.`)
      return
    }

    setPendingFiles(prev => [...prev, ...accepted])
    // Reset the input so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (file: File) => {
    const t = file.type.toLowerCase()
    const n = file.name.toLowerCase()
    if (t.startsWith('image/')) return '🖼️'
    if (t === 'application/pdf' || n.endsWith('.pdf')) return '📄'
    if (t.includes('spreadsheet') || n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv')) return '📊'
    if (t.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return '📝'
    if (t.includes('presentation') || n.endsWith('.pptx') || n.endsWith('.ppt')) return '📽️'
    if (t.startsWith('text/')) return '📃'
    if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return '🗜️'
    return '📎'
  }

  const { data: fetchedUsers = [] } = useQuery({
    queryKey: ['users-create-task'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
    enabled: createTaskOpen,
  })

  const addStep = () => {
    setSteps([...steps, { title: '' }])
  }

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, value: string) => {
    const newSteps = [...steps]
    newSteps[index] = { title: value }
    setSteps(newSteps)
  }

  const toggleWeekDay = (day: string) => {
    setSelectedWeekDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const toggleMonthDate = (date: number) => {
    setSelectedMonthDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    )
  }

  // Auto-select department when user is selected
  const handleAssignToChange = (userName: string) => {
    const user = fetchedUsers.find((u: any) => u.name === userName)
    setForm(prev => ({
      ...prev,
      assignTo: userName,
      department: user?.department || prev.department,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      addToast('err', 'Title is required')
      return
    }

    setSaving(true)
    try {
      const user = fetchedUsers.find((u: any) => u.name === form.assignTo)

      const taskSteps = steps
        .filter(s => s.title.trim())
        .map((s, i) => ({
          title: s.title.trim(),
          order: i + 1,
          assigneeId: user?.id || currentUserId,  // Assign steps to the selected employee
        }))

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          ownerId: user?.id || currentUserId,
          // FOUNDER is ALWAYS the assigner of their own tasks — override any
          // UI state to guarantee this. (For ADMIN/EA/DIRECTOR, use the dropdown.)
          assignedById: isFounder ? currentUserId : (form.assignedById || undefined),
          dueDate: form.dueDate || undefined,
          department: form.department || undefined,
          category: form.category,
          taskSteps,
          frequency: form.frequency,
          weekDays: form.frequency === 'Weekly' ? JSON.stringify(selectedWeekDays) : null,
          monthDates: form.frequency === 'Monthly' ? JSON.stringify(selectedMonthDates) : null,
        }),
      })

      if (res.ok) {
        const createdTask = await res.json()
        addToast('ok', `Task "${form.title}" created successfully`)

        // ─── Upload attachments (if any) ────────────────────────────────
        // Files are sent as multipart/form-data to the per-task attachments
        // endpoint. Errors here are non-fatal — the task is already created.
        if (pendingFiles.length > 0 && createdTask?.id) {
          try {
            const fd = new FormData()
            pendingFiles.forEach(f => fd.append('files', f))
            if (currentUserId) fd.append('uploadedById', currentUserId)
            const attRes = await fetch(`/api/tasks/${createdTask.id}/attachments`, {
              method: 'POST',
              body: fd,
            })
            if (attRes.ok) {
              const attData = await attRes.json().catch(() => ({}))
              const ok = attData?.uploaded?.length || 0
              const bad = attData?.errors?.length || 0
              if (ok > 0 && bad === 0) {
                addToast('ok', `${ok} attachment(s) uploaded`)
              } else if (ok > 0 && bad > 0) {
                addToast('ok', `${ok} uploaded, ${bad} failed`)
              } else if (bad > 0) {
                addToast('err', `Attachment upload failed: ${attData.errors[0]?.reason || 'unknown'}`)
              }
            } else {
              addToast('err', 'Attachment upload failed (task was still created)')
            }
          } catch (attErr) {
            console.error('Attachment upload error (non-fatal):', attErr)
            addToast('err', 'Attachment upload failed (task was still created)')
          }
        }

        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['tasks-list'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['emp-tasks'] })
        qc.invalidateQueries({ queryKey: ['emp-leaves-sidebar'] })
        qc.invalidateQueries({ queryKey: ['director-dashboard'] })
        setCreateTaskOpen(false)
        setForm({ title: '', description: '', assignTo: '', department: '', category: CATEGORIES[0], priority: 'MEDIUM', dueDate: '', frequency: 'One Time', assignedById: defaultAssignedById })
        setSteps([])
        setSelectedWeekDays([])
        setSelectedMonthDates([])
        setPendingFiles([])
        setFileError('')
      } else {
        const err = await res.json().catch(() => ({}))
        addToast('err', err.error || 'Failed to create task')
      }
    } catch {
      addToast('err', 'Failed to create task')
    }
    setSaving(false)
  }

  if (!createTaskOpen) return null

  const updateField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const assignableUsers = fetchedUsers.filter((u: any) => u.role !== 'DIRECTOR')

  return (
    <div className="overlay show" onClick={() => setCreateTaskOpen(false)}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="mx" onClick={() => setCreateTaskOpen(false)}>✕</button>
        <div className="mt">Create New Task</div>
        <div className="ms">Add a new task to the workflow system</div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-row fr-1">
            <div className="fg">
              <label>Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="fi" placeholder="Enter task title" value={form.title} onChange={e => updateField('title', e.target.value)} required />
            </div>
          </div>

          {/* Description */}
          <div className="form-row fr-1">
            <div className="fg">
              <label>Description</label>
              <textarea className="fi" placeholder="Enter task description" value={form.description} onChange={e => updateField('description', e.target.value)} rows={3} />
            </div>
          </div>

          {/* Assign To + Department (Auto) */}
          <div className="form-row fr-2">
            <div className="fg">
              <label>Assign To</label>
              <select className="fi" value={form.assignTo} onChange={e => handleAssignToChange(e.target.value)}>
                <option value="">Select team member</option>
                {assignableUsers.map((u: any) => <option key={u.id} value={u.name}>{u.name} — {u.department || 'No Dept'}</option>)}
              </select>
              {form.assignTo && (
                <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4, fontWeight: 600 }}>
                  ✓ Department auto-selected based on team member
                </div>
              )}
            </div>
            <div className="fg">
              <label>Department <span style={{ fontSize: 9, color: 'var(--blue)' }}>(auto-filled)</span></label>
              <select className="fi" value={form.department} onChange={e => updateField('department', e.target.value)}>
                <option value="">Select department</option>
                {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Assigned By (Director) — only 2 directors. FOUNDER sees a locked badge instead. */}
          <div className="form-row fr-2">
            <div className="fg">
              <label>Assigned By {isFounder ? null : <span style={{ color: 'var(--red)' }}>*</span>}</label>
              {isFounder ? (
                <>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'linear-gradient(135deg, rgba(139,105,20,.12), rgba(212,170,80,.18))',
                    border: '1px solid rgba(139,105,20,.35)',
                    fontSize: 12, color: '#8B6914', fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 14 }}>👑</span>
                    <span>{currentUserName || 'Founder'} (FOUNDER)</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>auto-assigned</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontWeight: 600 }}>
                    Every task you create is auto-assigned to you. It will appear on your Founder Dashboard with live progress.
                  </div>
                </>
              ) : (
                <>
                  <select className="fi" value={form.assignedById} onChange={e => updateField('assignedById', e.target.value)}>
                    {DIRECTOR_OPTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontWeight: 600 }}>
                    Director who is assigning this task — each director sees only their own tasks.
                  </div>
                </>
              )}
            </div>
            <div className="fg">
              <label>&nbsp;</label>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(109,40,217,.06)', border: '1px solid rgba(109,40,217,.15)',
                fontSize: 11, color: '#6D28D9', fontWeight: 700,
              }}>
                {isFounder
                  ? `${currentUserName || 'Founder'} will see this task on their Founder Dashboard.`
                  : `${DIRECTOR_OPTIONS.find(d => d.id === form.assignedById)?.name} will see this task on their Director Dashboard.`}
              </div>
            </div>
          </div>

          {/* Category + Priority + Due Date */}
          <div className="form-row fr-3">
            <div className="fg">
              <label>Category</label>
              <select className="fi" value={form.category} onChange={e => updateField('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Priority</label>
              <select className="fi" value={form.priority} onChange={e => updateField('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Due Date</label>
              <input className="fi" type="date" value={form.dueDate} onChange={e => updateField('dueDate', e.target.value)} />
            </div>
          </div>

          {/* Frequency */}
          <div className="form-row fr-2">
            <div className="fg">
              <label>Frequency</label>
              <select className="fi" value={form.frequency} onChange={e => { updateField('frequency', e.target.value); setSelectedWeekDays([]); setSelectedMonthDates([]) }}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Weekly - Weekday Selection */}
          {form.frequency === 'Weekly' && (
            <div className="form-row fr-1">
              <div className="fg">
                <label>Select Weekdays</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {WEEKDAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekDay(day)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: selectedWeekDays.includes(day) ? '2px solid var(--blue)' : '1.5px solid var(--b2)',
                        background: selectedWeekDays.includes(day) ? 'var(--blue-l)' : 'var(--bg)',
                        color: selectedWeekDays.includes(day) ? 'var(--blue)' : 'var(--t2)',
                        fontWeight: selectedWeekDays.includes(day) ? 800 : 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                {selectedWeekDays.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4, fontWeight: 600 }}>
                    Selected: {selectedWeekDays.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Monthly - Date Selection */}
          {form.frequency === 'Monthly' && (
            <div className="form-row fr-1">
              <div className="fg">
                <label>Select Dates of Month</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 4 }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(date => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => toggleMonthDate(date)}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        border: selectedMonthDates.includes(date) ? '2px solid var(--blue)' : '1.5px solid var(--b2)',
                        background: selectedMonthDates.includes(date) ? 'var(--blue-l)' : 'var(--bg)',
                        color: selectedMonthDates.includes(date) ? 'var(--blue)' : 'var(--t2)',
                        fontWeight: selectedMonthDates.includes(date) ? 800 : 600,
                        fontSize: 12, cursor: 'pointer', transition: 'all .15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {date}
                    </button>
                  ))}
                </div>
                {selectedMonthDates.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4, fontWeight: 600 }}>
                    Selected dates: {selectedMonthDates.sort((a, b) => a - b).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TASK STEPS SECTION (Simplified - no director dependency) ═══ */}
          <div className="gold-divider" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--g2)', marginBottom: 4 }}>
              TASK STEPS (OPTIONAL)
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 12 }}>
              Break this task into ordered steps to track progress.
            </div>

            {steps.map((step, index) => (
              <div key={index} style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--g2)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>
                    {index + 1}
                  </div>
                  <input
                    className="fi"
                    placeholder={`Step ${index + 1} — what needs to be done?`}
                    value={step.title}
                    onChange={e => updateStep(index, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--red)', fontSize: 16, fontWeight: 700, padding: '0 4px', flexShrink: 0,
                    }}
                    title="Delete step"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addStep}
              className="btn btn-ghost btn-sm"
              style={{ border: '1px dashed var(--b2)', width: '100%', textAlign: 'center', padding: '10px' }}
            >
              + Add Step
            </button>
          </div>

          {/* ═══ ATTACHMENTS SECTION (v25·0627) ═══ */}
          <div className="gold-divider" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--g2)', marginBottom: 4 }}>
              ATTACHMENTS (OPTIONAL)
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 12 }}>
              Upload files (images, PDFs, documents, Excel, any file). Max 15 MB per file, up to 10 files per task.
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              // Accept any file type — per spec: "File types: image, pdf, document, excel, any file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-ghost btn-sm"
              style={{ border: '1px dashed var(--b2)', width: '100%', textAlign: 'center', padding: '12px' }}
            >
              📎 + Attach Files
            </button>

            {fileError && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 6,
                background: 'var(--red-l)', color: 'var(--red)',
                fontSize: 11, fontWeight: 600,
              }}>
                ⚠ {fileError}
              </div>
            )}

            {pendingFiles.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendingFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 6,
                    background: 'var(--bg2)', border: '1px solid var(--b1)',
                  }}>
                    <span style={{ fontSize: 16 }}>{getFileIcon(file)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                        {formatBytes(file.size)} · {file.type || 'unknown type'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--red)', fontSize: 14, fontWeight: 700, padding: '0 4px', flexShrink: 0,
                      }}
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontWeight: 600 }}>
                  {pendingFiles.length} file(s) ready · will be uploaded after task creation
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateTaskOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={saving || !form.title.trim()}>
              {saving ? 'Creating...' : '✓ Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
