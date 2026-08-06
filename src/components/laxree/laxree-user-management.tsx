'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
function avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length] }
function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

const ROLES = ['FOUNDER', 'ADMIN', 'EA', 'DIRECTOR', 'MANAGER', 'EMPLOYEE']
const DEPARTMENTS = ['Sales', 'Back Office', 'Accounts', 'Management']

function getLoginUsername(user: any): string {
  if (user.role === 'FOUNDER') return 'founder'
  if (user.role === 'ADMIN') return 'admin'
  if (user.role === 'EA') return 'ea'
  return (user.name || '').split(' ')[0].toLowerCase()
}

export function LaxreeUserManagement() {
  const { currentUserId, currentRole, addToast } = useWorkflowStore()
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [filterRole, setFilterRole] = useState('ALL')
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  // ─── FOUNDER-only: toggle to reveal login credentials ─────────────
  // Only FOUNDER role can view current ID/password. Other roles
  // (ADMIN/DIRECTOR/EA) can manage users but cannot see passwords.
  // This toggle is LOCAL to this User Management page — it does not
  // affect any other dashboard.
  const [showCredentials, setShowCredentials] = useState(false)
  const canViewCredentials = currentRole === 'FOUNDER'

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState('EMPLOYEE')
  const [formDept, setFormDept] = useState('')
  const [formDesig, setFormDesig] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formPassword, setFormPassword] = useState('')

  // Fetch users — pass includeCredentials=true ONLY when FOUNDER has
  // toggled "Show Credentials" on this User Management page.
  const { data: rawUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['users-managed', showCredentials && canViewCredentials],
    queryFn: () => fetch(`/api/users${showCredentials && canViewCredentials ? '?includeCredentials=true' : ''}`).then(r => r.json()),
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const users = Array.isArray(rawUsers) ? rawUsers : []

  const filteredUsers = filterRole === 'ALL' ? users : users.filter((u: any) => u.role === filterRole)

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create user')
      return json
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['users-managed'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      addToast('ok', `User "${data.user?.name}" created successfully`)
      resetForm()
      refetchUsers()
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to create user'),
  })

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update user')
      return json
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['users-managed'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      addToast('ok', `User "${data.user?.name}" updated successfully`)
      setEditingUser(null)
      resetForm()
      refetchUsers()
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to update user'),
  })

  // Delete (deactivate) user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete user')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-managed'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      addToast('ok', `User deactivated successfully`)
      refetchUsers()
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to delete user'),
  })

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, loginPassword: password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset password')
      return json
    },
    onSuccess: () => {
      addToast('ok', 'Password reset successfully')
      setResetPasswordUserId(null)
      setNewPassword('')
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to reset password'),
  })

  const resetForm = () => {
    setFormName(''); setFormEmail(''); setFormRole('EMPLOYEE')
    setFormDept(''); setFormDesig(''); setFormPhone('')
    setFormLocation(''); setFormPassword('')
    setShowAddForm(false); setEditingUser(null)
  }

  const handleCreate = () => {
    if (!formName.trim() || !formEmail.trim()) {
      addToast('err', 'Name and Email are required')
      return
    }
    if (!formPassword.trim()) {
      addToast('err', 'Login password is required')
      return
    }
    const loginUsername = formName.split(' ')[0].toLowerCase()
    createMutation.mutate({
      name: formName.trim(),
      email: formEmail.trim(),
      role: formRole,
      department: formDept || null,
      designation: formDesig || null,
      phone: formPhone || null,
      location: formLocation || null,
      loginUsername,
      loginPassword: formPassword,
    })
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setFormName(user.name || '')
    setFormEmail(user.email || '')
    setFormRole(user.role || 'EMPLOYEE')
    setFormDept(user.department || '')
    setFormDesig(user.designation || '')
    setFormPhone(user.phone || '')
    setFormLocation(user.location || '')
    setFormPassword('')
  }

  const handleUpdate = () => {
    if (!editingUser) return
    const updateData: any = {
      id: editingUser.id,
      name: formName.trim(),
      email: formEmail.trim(),
      role: formRole,
      department: formDept || null,
      designation: formDesig || null,
      phone: formPhone || null,
      location: formLocation || null,
    }
    // Include password reset if provided
    if (formPassword.trim()) {
      updateData.loginPassword = formPassword.trim()
    }
    // Include loginUsername if it was missing (NULL) or manually changed.
    // The PATCH endpoint enforces uniqueness, so this is safe.
    const desiredUsername = (formName.split(' ')[0] || '').toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (desiredUsername && desiredUsername !== (editingUser.loginUsername || '')) {
      updateData.loginUsername = desiredUsername
    }
    updateMutation.mutate(updateData)
  }

  const roleBadgeStyle: Record<string, { bg: string; color: string }> = {
    FOUNDER: { bg: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#8B6914' },
    ADMIN: { bg: '#FEE2E2', color: '#DC2626' },
    EA: { bg: '#EDE9FE', color: '#6D28D9' },
    DIRECTOR: { bg: '#DBEAFE', color: '#1D4ED8' },
    MANAGER: { bg: '#FEF3C7', color: '#92400E' },
    EMPLOYEE: { bg: '#DCFCE7', color: '#15803D' },
  }

  // Stats
  const founderCount = users.filter((u: any) => u.role === 'FOUNDER').length
  const adminCount = users.filter((u: any) => u.role === 'ADMIN' || u.role === 'EA').length
  const directorCount = users.filter((u: any) => u.role === 'DIRECTOR').length
  const managerCount = users.filter((u: any) => u.role === 'MANAGER').length
  const empCount = users.filter((u: any) => u.role === 'EMPLOYEE').length

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>User Management</h2>
          <p>Create, edit, and manage user accounts securely</p>
        </div>
        <div className="ph-right">
          <button className="btn btn-gold" onClick={() => { resetForm(); setShowAddForm(true) }}>
            + Add User
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Security Notice */}
      <div style={{
        padding: '10px 16px', marginBottom: 12, borderRadius: 10,
        background: 'rgba(109,40,217,.06)', border: '1px solid rgba(109,40,217,.15)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 20 }}>🔐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: '#6D28D9' }}>
            Secure Credential Management
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {canViewCredentials
              ? 'As a FOUNDER, you can reveal login IDs and passwords for verification. Use "Show Credentials" with care.'
              : 'Passwords are never displayed. Use "Reset Password" to set a new password for any user. Only FOUNDER can view credentials.'}
          </div>
        </div>
        {canViewCredentials && (
          <button
            className="btn"
            onClick={() => setShowCredentials(s => !s)}
            style={{
              fontSize: 11, padding: '6px 12px', borderRadius: 6, fontWeight: 800,
              background: showCredentials ? '#FEE2E2' : '#EDE9FE',
              color: showCredentials ? '#DC2626' : '#6D28D9',
              border: `1px solid ${showCredentials ? '#DC2626' : '#6D28D9'}`,
            }}
          >
            {showCredentials ? '🙈 Hide Credentials' : '👁 Show Credentials'}
          </button>
        )}
      </div>

      {/* FOUNDER-only warning banner when credentials are revealed */}
      {canViewCredentials && showCredentials && (
        <div style={{
          padding: '8px 16px', marginBottom: 12, borderRadius: 8,
          background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.25)',
          fontSize: 11, color: '#991B1B', fontWeight: 600, lineHeight: 1.5,
        }}>
          ⚠ <strong>Credentials are now visible.</strong> Anyone looking at your screen can see them.
          Click <em>Hide Credentials</em> when done. This view is logged for audit purposes
          and is restricted to the FOUNDER role only.
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Admin & EA</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#6D28D9' }}>{adminCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Directors</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--blue)' }}>{directorCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Managers</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--amber)' }}>{managerCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Employees</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{empCount}</div>
        </div>
      </div>

      {/* Add/Edit User Form */}
      {(showAddForm || editingUser) && (
        <div className="lcard" style={{ marginBottom: 16, borderLeft: '4px solid var(--g2)' }}>
          <div className="ch">
            <div className="ct">{editingUser ? '✏️ Edit User' : '➕ Add New User'}</div>
            <button className="btn" style={{ fontSize: 11, padding: '4px 12px', background: 'var(--bg2)', color: 'var(--t2)' }}
              onClick={resetForm}>✕ Close</button>
          </div>
          <div className="cb">
            <div className="form-row fr-3">
              <div className="fg">
                <label>Full Name *</label>
                <input className="fi" type="text" placeholder="e.g. John Doe" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="fg">
                <label>Email *</label>
                <input className="fi" type="email" placeholder="e.g. john@laxree.com" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
              </div>
              <div className="fg">
                <label>Role *</label>
                <select className="sel" value={formRole} onChange={e => setFormRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row fr-3" style={{ marginTop: 10 }}>
              <div className="fg">
                <label>Department</label>
                <select className="sel" value={formDept} onChange={e => setFormDept(e.target.value)}>
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Designation</label>
                <input className="fi" type="text" placeholder="e.g. Sales Executive" value={formDesig} onChange={e => setFormDesig(e.target.value)} />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input className="fi" type="text" placeholder="e.g. 9876543210" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="form-row fr-2" style={{ marginTop: 10 }}>
              <div className="fg">
                <label>Location</label>
                <input className="fi" type="text" placeholder="e.g. Ajmer" value={formLocation} onChange={e => setFormLocation(e.target.value)} />
              </div>
              <div className="fg">
                <label>{editingUser ? 'Reset Password (leave blank to keep current)' : 'Login Password *'}</label>
                <input className="fi" type="password" placeholder={editingUser ? 'Enter new password to reset' : 'e.g. John@2025'} value={formPassword} onChange={e => setFormPassword(e.target.value)} />
                {!editingUser && (
                  <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2 }}>
                    Login username will be: <b>{formName ? formName.split(' ')[0].toLowerCase() : 'firstname'}</b>
                  </div>
                )}
                {editingUser && (
                  <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2 }}>
                    Current login: <b>{getLoginUsername(editingUser)}</b>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ background: 'var(--bg2)', color: 'var(--t2)' }} onClick={resetForm}>Cancel</button>
              {editingUser ? (
                <button className="btn btn-gold" disabled={updateMutation.isPending} onClick={handleUpdate}>
                  {updateMutation.isPending ? 'Updating...' : 'Update User'}
                </button>
              ) : (
                <button className="btn btn-gold" disabled={createMutation.isPending} onClick={handleCreate}>
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Dialog */}
      {resetPasswordUserId && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) { setResetPasswordUserId(null); setNewPassword('') } }}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <button className="mx" onClick={() => { setResetPasswordUserId(null); setNewPassword('') }}>✕</button>
            <div className="mt">🔑 Reset Password</div>
            <div className="ms">Set a new login password for this user</div>
            <div className="gold-divider" />
            <div className="fg" style={{ marginTop: 16 }}>
              <label>New Password *</label>
              <input className="fi" type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2 }}>
                The user will need to use this new password on their next login.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" style={{ background: 'var(--bg2)', color: 'var(--t2)' }} onClick={() => { setResetPasswordUserId(null); setNewPassword('') }}>Cancel</button>
              <button className="btn btn-gold" disabled={!newPassword.trim() || resetPasswordMutation.isPending}
                onClick={() => resetPasswordMutation.mutate({ userId: resetPasswordUserId, password: newPassword.trim() })}>
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {['ALL', 'FOUNDER', 'ADMIN', 'EA', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'].map(role => (
          <div key={role} className={`tab${filterRole === role ? ' active' : ''}`}
            onClick={() => setFilterRole(role)}>
            {role === 'ALL' ? 'All Users' : role}
            {role !== 'ALL' && (
              <span className="tab-cnt" style={{ marginLeft: 4 }}>
                {users.filter((u: any) => u.role === role).length}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="lcard">
        <div className="ch">
          <div className="ct">👥 All Users</div>
          <span className="badge b-gold" style={{ fontSize: 10 }}>{filteredUsers.length} users</span>
        </div>
        <div className="cb" style={{ padding: 0 }}>
          <div className="tw">
            <table className="ltable">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Login ID</th>
                  {canViewCredentials && showCredentials && <th>Password</th>}
                  <th>Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user: any) => {
                  const rs = roleBadgeStyle[user.role] || roleBadgeStyle.EMPLOYEE
                  // Use stored loginUsername when available (FOUNDER view with credentials);
                  // otherwise fall back to the helper for display.
                  const loginId = user.loginUsername || getLoginUsername(user)
                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="av" style={{ width: 30, height: 30, fontSize: 10, background: avatarColor(user.name) }}>
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{user.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--t4)' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ fontSize: 9, padding: '3px 8px', background: rs.bg, color: rs.color, fontWeight: 700 }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>{user.department || '—'}</td>
                      <td>
                        <code style={{
                          fontSize: 10, padding: '2px 8px', background: 'var(--bg2)',
                          borderRadius: 4, fontWeight: 700, color: 'var(--t2)',
                          border: '1px solid var(--b1)',
                        }}>
                          {loginId}
                        </code>
                      </td>
                      {canViewCredentials && showCredentials && (
                        <td>
                          <code style={{
                            fontSize: 10, padding: '2px 8px', background: '#FEE2E2',
                            borderRadius: 4, fontWeight: 700, color: '#DC2626',
                            border: '1px solid rgba(220,38,38,.25)',
                            fontFamily: 'monospace',
                          }}>
                            {user.loginPassword || '—'}
                          </code>
                        </td>
                      )}
                      <td style={{ fontSize: 11, color: 'var(--t3)' }}>{user.phone || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn" style={{
                            fontSize: 10, padding: '3px 8px',
                            background: 'var(--blue-l)', color: 'var(--blue)',
                            border: '1px solid var(--blue)', fontWeight: 700, borderRadius: 4,
                          }} onClick={() => handleEdit(user)}>
                            ✏️ Edit
                          </button>
                          <button className="btn" style={{
                            fontSize: 10, padding: '3px 8px',
                            background: '#EDE9FE', color: '#6D28D9',
                            border: '1px solid #6D28D9', fontWeight: 700, borderRadius: 4,
                          }} onClick={() => { setResetPasswordUserId(user.id); setNewPassword('') }}>
                            🔑 Reset Pwd
                          </button>
                          <button className="btn" style={{
                            fontSize: 10, padding: '3px 8px',
                            background: '#FEE2E2', color: '#DC2626',
                            border: '1px solid #DC2626', fontWeight: 700, borderRadius: 4,
                          }} onClick={() => {
                            if (confirm(`Are you sure you want to deactivate ${user.name}?`)) {
                              deleteMutation.mutate(user.id)
                            }
                          }}>
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
