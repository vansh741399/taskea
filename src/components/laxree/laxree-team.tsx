'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

export function LaxreeTeam() {
  const { addToast } = useWorkflowStore()
  const qc = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' })
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [teamTab, setTeamTab] = useState('active')

  const { data: rawUsers } = useQuery({
    queryKey: ['users-team'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })
  const users = Array.isArray(rawUsers) ? rawUsers : []

  const { data: allUsersData } = useQuery({
    queryKey: ['all-users-team'],
    queryFn: () => fetch('/api/employees').then(r => r.json()),
  })
  const { data: rawWorkflows } = useQuery({
    queryKey: ['workflows-team'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })
  const workflows = Array.isArray(rawWorkflows) ? rawWorkflows : []

  const allUsers = Array.isArray((allUsersData as any)?.employees) ? (allUsersData as any).employees : []
  const activeUsers = allUsers.filter((u: any) => u.isActive)
  const inactiveUsers = allUsers.filter((u: any) => !u.isActive)
  const displayUsers = teamTab === 'active' ? activeUsers : teamTab === 'inactive' ? inactiveUsers : allUsers

  const getInitials = (name: string) => name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '?'
  const colors = ['#B8860B', '#D97706', '#F0C040', '#7C3AED', '#2563EB', '#0891B2', '#16A34A', '#DC2626', '#65A30D', '#9333EA', '#0369A1', '#BE123C', '#0F766E', '#1D4ED8']
  const roleBadge: Record<string, string> = { ADMIN: 'b-gold', DIRECTOR: 'b-purple', EA: 'b-green', MANAGER: 'b-blue', EMPLOYEE: 'b-gray' }

  const addMutation = useMutation({
    mutationFn: (formData: typeof addForm) => fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
    }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to add employee')
      return res
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-team'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
      addToast('ok', 'Employee added successfully')
      setShowAddDialog(false)
      setAddForm({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', phone: '', location: '' })
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to add employee'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => fetch(`/api/employees?userId=${userId}`, { method: 'DELETE' }).then(async r => {
      const res = await r.json()
      if (!r.ok) throw new Error(res.error || 'Failed to remove')
      return res
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['users-team'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
      addToast('ok', data.message || 'Employee removed')
      setRemoveConfirm(null)
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to remove employee'),
  })

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => fetch('/api/employees', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isActive: true }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-team'] })
      qc.invalidateQueries({ queryKey: ['all-users-team'] })
      addToast('ok', 'Employee reactivated')
    },
  })

  const tabs = [
    { id: 'active', label: 'Active', count: activeUsers.length },
    { id: 'inactive', label: 'Left / Inactive', count: inactiveUsers.length },
    { id: 'all', label: 'All', count: allUsers.length },
  ]

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Team Members</h2>
          <p>Team management — add new members or remove those who left</p>
        </div>
        <div className="ph-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge b-gold">{activeUsers.length} Active</span>
          <button className="btn btn-gold" onClick={() => setShowAddDialog(true)}>+ Add Employee</button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab${teamTab === tab.id ? ' active' : ''}`}
            onClick={() => setTeamTab(tab.id)}>
            {tab.label}
            {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
          </div>
        ))}
      </div>

      <div className="mc-grid">
        {displayUsers.length === 0 ? (
          <div className="lcard" style={{ gridColumn: '1 / -1' }}>
            <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>No team members found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Employee" to add a new team member</div>
            </div>
          </div>
        ) : displayUsers.map((u: any, idx: number) => {
          const uWorkflows = workflows.filter((w: any) => w.creatorId === u.id)
          const done = uWorkflows.filter((w: any) => w.status === 'COMPLETED').length
          const active = uWorkflows.filter((w: any) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED').length
          const isRemoving = removeConfirm === u.id

          return (
            <div className="mc" key={u.id} style={u.isActive ? {} : { opacity: 0.6, borderLeft: '3px solid var(--red)' }}>
              <div className="mc-top">
                <div className="av" style={{ background: u.isActive ? colors[idx % colors.length] : 'var(--red)', width: 36, height: 36, fontSize: 13 }}>
                  {getInitials(u.name)}
                </div>
                <div className="mc-info">
                  <div className="mc-name">{u.name}</div>
                  <div className="mc-role">
                    {u.department || '—'} · <span className={`badge ${roleBadge[u.role] || 'b-gray'}`} style={{ fontSize: 9 }}>{u.role}</span>
                  </div>
                </div>
              </div>
              {u.designation && <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{u.designation}</div>}
              {u.phone && <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>📞 {u.phone}</div>}
              {u.isActive && (
                <>
                  <div className="mc-stat"><span>Active</span><span>{active}</span></div>
                  <div className="mc-stat"><span>Completed</span><span>{done}</span></div>
                  <div className="mc-stat"><span>Total</span><span>{uWorkflows.length}</span></div>
                  <div className="mc-score">
                    <div style={{ height: 6, flex: 1, background: 'var(--b1)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uWorkflows.length ? Math.round(done / uWorkflows.length * 100) : 0}%`, background: 'var(--g2)', borderRadius: 3 }} />
                    </div>
                    <span style={{ color: 'var(--g2)' }}>{uWorkflows.length ? Math.round(done / uWorkflows.length * 100) : 0}%</span>
                  </div>
                </>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${u.isActive ? 'b-green' : 'b-red'}`} style={{ fontSize: 10 }}>
                  {u.isActive ? '● Active' : '● Left'}
                </span>
                {u.isActive && u.role !== 'ADMIN' && (
                  isRemoving ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-red btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => removeMutation.mutate(u.id)} disabled={removeMutation.isPending}>
                        {removeMutation.isPending ? 'Removing...' : '✓ Confirm Remove'}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => setRemoveConfirm(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={{ fontSize: 9, padding: '1px 6px', background: 'var(--red-l)', color: 'var(--red)',
                      border: '1px solid rgba(220,38,38,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => setRemoveConfirm(u.id)}>
                      ✕ Remove
                    </button>
                  )
                )}
                {!u.isActive && (
                  <button style={{ fontSize: 9, padding: '1px 6px', background: 'var(--green-l)', color: 'var(--green)',
                    border: '1px solid rgba(21,128,61,.3)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                    onClick={() => reactivateMutation.mutate(u.id)} disabled={reactivateMutation.isPending}>
                    ↩ Reactivate
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Employee Dialog */}
      {showAddDialog && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setShowAddDialog(false) }}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => setShowAddDialog(false)}>✕</button>
            <div className="mt">Add New Employee</div>
            <div className="ms">Add a new team member to LAXREE</div>
            <div className="gold-divider" />
            <div className="form-row fr-2">
              <div className="fg">
                <label>Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" placeholder="Enter full name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
              <div className="fg">
                <label>Email <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" type="email" placeholder="Enter email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="fg">
                <label>Role</label>
                <select className="fi" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                  <option value="FOUNDER">Founder</option>
                  <option value="ADMIN">Admin</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EA">EA (Executive Assistant)</option>
                  <option value="DIRECTOR">Director</option>
                </select>
              </div>
              <div className="fg">
                <label>Department</label>
                <select className="fi" value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })}>
                  <option value="">Select Department</option>
                  <option value="Sales">Sales</option>
                  <option value="Account">Account</option>
                  <option value="HR">HR</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Back Office">Back Office</option>
                  <option value="Admin">Admin</option>
                  <option value="Management">Management</option>
                </select>
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="fg">
                <label>Designation</label>
                <input className="fi" placeholder="e.g. Sales Executive" value={addForm.designation} onChange={e => setAddForm({ ...addForm, designation: e.target.value })} />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input className="fi" placeholder="Enter phone number" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row fr-1">
              <div className="fg">
                <label>Location</label>
                <input className="fi" placeholder="e.g. Ajmer Office" value={addForm.location} onChange={e => setAddForm({ ...addForm, location: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={() => addMutation.mutate(addForm)} disabled={addMutation.isPending || !addForm.name || !addForm.email}>
                {addMutation.isPending ? 'Adding...' : '✓ Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
