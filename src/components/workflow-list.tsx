'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface Workflow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  createdAt: string
  currentStepOrder: number
  template: { name: string }
  creator: { name: string; department: string | null }
  steps: { id: string; name: string; status: string; stepType: string; order: number }[]
}

interface Template {
  id: string
  name: string
  description: string | null
  category: string | null
}

export function WorkflowList() {
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTemplateId, setNewTemplateId] = useState('')
  const [newPriority, setNewPriority] = useState('MEDIUM')
  const queryClient = useQueryClient()

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['workflow-templates'],
    queryFn: () => fetch('/api/workflow-templates').then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string; templateId: string; priority: string }) =>
      fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setShowCreate(false)
      setNewTitle('')
      setNewDesc('')
    },
  })

  const getBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 's-pending', IN_PROGRESS: 's-inprog', COMPLETED: 's-done',
      CANCELLED: 's-cancelled', ESCALATED: 'b-red', APPROVED: 'b-green',
      REJECTED: 'b-red', ON_HOLD: 's-waiting', DRAFT: 's-pending',
      IN_REVIEW: 'b-blue', EXTERNAL_HOLD: 's-exthold', RE_OPENED: 'b-amber',
    }
    return map[status] || 'b-gray'
  }

  const getPriorityBadge = (p: string) => {
    const map: Record<string, string> = { CRITICAL: 'p-critical', HIGH: 'p-high', MEDIUM: 'p-med', LOW: 'p-low' }
    return map[p] || 'p-med'
  }

  const filtered = workflows.filter(w => {
    const matchesSearch = w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (activeTab === 'all') return true
    if (activeTab === 'active') return !['COMPLETED', 'CANCELLED'].includes(w.status)
    if (activeTab === 'completed') return w.status === 'COMPLETED'
    return true
  })

  const counts = {
    all: workflows.length,
    active: workflows.filter(w => !['COMPLETED', 'CANCELLED'].includes(w.status)).length,
    completed: workflows.filter(w => w.status === 'COMPLETED').length,
  }

  if (isLoading) {
    return (
      <div>
        <div className="ph"><div className="ph-left"><h2>Workflows</h2></div></div>
        <div className="lcard"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading workflows…</div></div>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>Workflows</h2>
          <p>Manage and track enterprise workflows</p>
        </div>
        <div className="ph-right">
          <button className="btn btn-gold" onClick={() => setShowCreate(true)}>+ Create Workflow</button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['all', 'active', 'completed'] as const).map(tab => (
          <div
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="tab-cnt">{counts[tab]}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="search" style={{ maxWidth: 320, marginBottom: 14 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search workflows…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Workflow Cards */}
      {filtered.length > 0 ? (
        filtered.map(w => {
          const progress = w.steps.length > 0
            ? Math.round((w.steps.filter(s => s.status === 'COMPLETED').length / w.steps.length) * 100)
            : 0
          return (
            <div key={w.id} className="appr-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="appr-title">{w.title}</div>
                  <div className="appr-meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                    <span className={`badge ${getBadgeClass(w.status)}`}>{w.status.replace(/_/g, ' ')}</span>
                    <span className={`badge ${getPriorityBadge(w.priority)}`}>{w.priority}</span>
                    <span style={{ fontSize: 10, color: 'var(--t4)' }}>Template: {w.template?.name || '—'}</span>
                  </div>
                  {w.description && (
                    <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 6 }}>{w.description}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>
                    Created by {w.creator?.name || '—'} · {new Date(w.createdAt).toLocaleDateString()}
                    {w.dueDate && ` · Due: ${new Date(w.dueDate).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--t3)', marginBottom: 4 }}>
                    Progress {progress}%
                  </div>
                  <div className="prog">
                    <div className="prog-bg" style={{ height: 6 }}>
                      <div className="prog-fill" style={{
                        width: `${progress}%`,
                        background: progress >= 70 ? 'var(--green)' : progress >= 40 ? 'var(--amber)' : 'var(--red)',
                        height: '100%',
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
                    Steps: {w.steps.filter(s => s.status === 'COMPLETED').length}/{w.steps.length}
                  </div>
                </div>
              </div>
            </div>
          )
        })
      ) : (
        <div className="lcard">
          <div className="cb empty">
            <h3>No workflows found</h3>
            <p>Create your first workflow to get started</p>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="modal modal-md">
            <button className="mx" onClick={() => setShowCreate(false)}>✕</button>
            <div className="mt">Create New Workflow</div>
            <div className="ms">Start a new workflow from a template</div>

            <div className="fg">
              <label>Title <span>*</span></label>
              <input className="fi" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Enter workflow title" />
            </div>

            <div className="fg">
              <label>Description</label>
              <textarea className="fi" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" rows={3} />
            </div>

            <div className="form-row fr-2">
              <div className="fg">
                <label>Template</label>
                <select className="sel" value={newTemplateId} onChange={e => setNewTemplateId(e.target.value)}>
                  <option value="">Select template…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Priority</label>
                <select className="sel" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-out" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={!newTitle || !newTemplateId}
                onClick={() => createMutation.mutate({ title: newTitle, description: newDesc, templateId: newTemplateId, priority: newPriority })}
              >
                {createMutation.isPending ? 'Creating…' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
