'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

export function LaxreeLeaveManagement() {
  const { currentRole, currentUserId, addToast } = useWorkflowStore()
  const queryClient = useQueryClient()
  // v25·0806-leave-approval: Founder, Admin, and Director (Samarth Sir) can
  // approve/reject leaves. Previously only ADMIN had this power, which meant
  // the founder and director couldn't action leave requests. Now all three
  // roles see the Approve/Reject buttons and the action API accepts them.
  const canApprove = currentRole === 'ADMIN' || currentRole === 'FOUNDER' || currentRole === 'DIRECTOR'
  const isAdmin = canApprove // keep variable name for minimal diff downstream

  const [filterStatus, setFilterStatus] = useState('PENDING')
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({})

  // Fetch all leaves — auto-refresh every 5 seconds
  const { data: leavesData = { leaves: [] }, refetch: refetchAllLeaves } = useQuery({
    queryKey: ['all-leaves', filterStatus],
    queryFn: async () => {
      const url = filterStatus === 'ALL' ? '/api/leaves' : `/api/leaves?status=${filterStatus}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch leaves')
      return res.json()
    },
    refetchOnMount: 'always',
    staleTime: 0,
    refetchInterval: 5000,
  })

  // Fetch all employees for delegation view
  const { data: employeesData = { employees: [] } } = useQuery({
    queryKey: ['employees-leaves'],
    queryFn: () => fetch('/api/employees?status=active').then(r => r.json()),
  })

  const leaves = Array.isArray(leavesData?.leaves) ? leavesData.leaves : []
  const employees = Array.isArray(employeesData?.employees) ? employeesData.employees : []

  // Get currently-on-leave employees
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentlyOnLeave = leaves.filter((l: any) => {
    if (l.status !== 'APPROVED') return false
    const from = new Date(l.fromDate)
    const to = new Date(l.toDate)
    from.setHours(0, 0, 0, 0)
    to.setHours(0, 0, 0, 0)
    return today >= from && today <= to
  })

  const leaveByEmployee: Record<string, any> = {}
  for (const leave of currentlyOnLeave) {
    leaveByEmployee[leave.userId] = leave
  }

  const pendingByEmployee: Record<string, any> = {}
  for (const leave of leaves.filter((l: any) => l.status === 'PENDING')) {
    if (!pendingByEmployee[leave.userId]) pendingByEmployee[leave.userId] = []
    pendingByEmployee[leave.userId].push(leave)
  }

  // Stats
  const pendingCount = leaves.filter((l: any) => l.status === 'PENDING').length
  const approvedCount = leaves.filter((l: any) => l.status === 'APPROVED').length
  const rejectedCount = leaves.filter((l: any) => l.status === 'REJECTED').length
  const lateCount = leaves.filter((l: any) => l.applicationTag === 'LA').length

  const leaveStatusStyle: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    APPROVED: { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
    REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  }

  const tabs = [
    { id: 'ALL', label: 'All', count: leaves.length },
    { id: 'PENDING', label: 'Pending', count: pendingCount },
    { id: 'APPROVED', label: 'Approved', count: approvedCount },
    { id: 'REJECTED', label: 'Rejected', count: rejectedCount },
  ]

  const [activeTab, setActiveTab] = useState<'applications' | 'delegation'>('applications')

  // ADMIN-only: Approve or reject a leave
  const handleLeaveAction = async (leaveId: string, action: 'approve' | 'reject') => {
    const remark = remarkMap[leaveId] || ''
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, approvedById: currentUserId, eaRemark: remark }),
      })
      if (!res.ok) throw new Error('Failed to update leave')
      addToast('ok', `Leave ${action === 'approve' ? 'approved' : 'rejected'} successfully`)
      refetchAllLeaves()
      queryClient.invalidateQueries({ queryKey: ['ea-leaves-sidebar'] })
      queryClient.invalidateQueries({ queryKey: ['ea-dash-leaves'] })
    } catch (err) {
      addToast('err', `Failed to ${action} leave`)
    }
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Leave Management</h2>
          <p>
            {isAdmin ? 'Approve or reject employee leave applications' : 'View employee leave applications'}
            <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--green)', fontWeight: 700, background: 'var(--green-l)', padding: '2px 8px', borderRadius: 10 }}>
              Auto-refresh ON
            </span>
            {!isAdmin && (
              <span style={{ marginLeft: 6, fontSize: 9, color: '#6D28D9', fontWeight: 700, background: 'rgba(109,40,217,.1)', padding: '2px 8px', borderRadius: 10 }}>
                View Only — Admin Approves
              </span>
            )}
          </p>
        </div>
        <div className="ph-right">
          <span className="badge" style={{ background: '#FEE2E2', color: 'var(--red)', fontWeight: 800, padding: '4px 12px', fontSize: 11 }}>
            LA (Late): {lateCount}
          </span>
          <span className="badge" style={{ background: 'var(--green-l)', color: 'var(--green)', fontWeight: 800, padding: '4px 12px', fontSize: 11 }}>
            AL (On Time): {leaves.filter((l: any) => l.applicationTag === 'AL').length}
          </span>
        </div>
      </div>
      <div className="page-accent" />

      {/* Pending Leave Alert Banner */}
      {pendingCount > 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: 16, borderRadius: 10,
          background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
          border: '1.5px solid #F59E0B',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>{isAdmin ? '🔔' : '👁️'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E' }}>
              {pendingCount} Leave Application{pendingCount > 1 ? 's' : ''} Pending
            </div>
            <div style={{ fontSize: 12, color: '#A16207', marginTop: 2 }}>
              {isAdmin
                ? 'You can approve or reject these applications. Auto-refresh every 5 seconds.'
                : 'New leave applications from employees. Only Admin can approve/reject. Auto-refresh every 5 seconds.'}
            </div>
          </div>
          <button className="btn" style={{
            fontSize: 11, padding: '6px 14px', fontWeight: 800,
            background: '#92400E', color: '#fff', borderRadius: 6,
          }} onClick={() => { setFilterStatus('PENDING'); setActiveTab('applications'); }}>
            View Leaves →
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--amber)' }}>{pendingCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Approved</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{approvedCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Rejected</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--red)' }}>{rejectedCount}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Late Apps (LA)</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#DC2626' }}>{lateCount}</div>
        </div>
      </div>

      {/* Sub-tab: Applications vs Delegation */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <div className={`tab${activeTab === 'applications' ? ' active' : ''}`} onClick={() => setActiveTab('applications')}>
          Leave Applications
          {pendingCount > 0 && <span className="tab-cnt">{pendingCount}</span>}
        </div>
        <div className={`tab${activeTab === 'delegation' ? ' active' : ''}`} onClick={() => setActiveTab('delegation')}>
          Delegation View
          {currentlyOnLeave.length > 0 && <span className="tab-cnt" style={{ background: 'var(--red)', color: '#fff' }}>{currentlyOnLeave.length}</span>}
        </div>
      </div>

      {/* DELEGATION VIEW */}
      {activeTab === 'delegation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lcard">
            <div className="ch">
              <div className="ct">Currently on Leave Today</div>
              <span className="badge" style={{ background: currentlyOnLeave.length > 0 ? '#FEE2E2' : 'var(--green-l)', color: currentlyOnLeave.length > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 800, fontSize: 10 }}>
                {currentlyOnLeave.length} employee{currentlyOnLeave.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              {currentlyOnLeave.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--t3)' }}>
                  <div style={{ fontWeight: 700 }}>No employees on leave today</div>
                </div>
              ) : (
                <div className="tw">
                  <table className="ltable">
                    <thead>
                      <tr><th>Employee</th><th>Department</th><th>Leave Type</th><th>From</th><th>To</th><th>Tag</th><th>Days</th></tr>
                    </thead>
                    <tbody>
                      {currentlyOnLeave.map((leave: any) => {
                        const isLate = leave.applicationTag === 'LA'
                        return (
                          <tr key={leave.id} style={{ background: isLate ? '#FEF2F2' : undefined }}>
                            <td style={{ fontWeight: 700 }}>{leave.user?.name || 'Unknown'}</td>
                            <td><span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{leave.user?.department || '—'}</span></td>
                            <td style={{ fontSize: 11, fontWeight: 600 }}>{leave.leaveType}</td>
                            <td style={{ fontSize: 11 }}>{new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td style={{ fontSize: 11 }}>{new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td>
                              <span className="badge" style={{
                                fontSize: 11, padding: '3px 10px', fontWeight: 900, letterSpacing: 0.5,
                                background: isLate ? '#DC2626' : 'var(--green)',
                                color: '#fff', borderRadius: 4,
                              }}>
                                {isLate ? 'LA' : 'AL'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700 }}>{leave.totalDays}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="lcard">
            <div className="ch">
              <div className="ct">Team Delegation Overview</div>
              <span className="badge b-gold" style={{ fontSize: 10 }}>{employees.length} active</span>
            </div>
            <div className="cb" style={{ padding: 0 }}>
              <div className="tw">
                <table className="ltable">
                  <thead>
                    <tr><th>Employee</th><th>Department</th><th>Leave Status</th><th>Tag</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {employees.map((emp: any) => {
                      const isOnLeave = !!leaveByEmployee[emp.id]
                      const leaveInfo = leaveByEmployee[emp.id]
                      const empPending = pendingByEmployee[emp.id] || []
                      const isLate = leaveInfo?.applicationTag === 'LA'

                      return (
                        <tr key={emp.id} style={isOnLeave ? { background: isLate ? '#FEF2F2' : '#F0FFF4' } : undefined}>
                          <td style={{ fontWeight: 600 }}>{emp.name}</td>
                          <td><span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{emp.department || '—'}</span></td>
                          <td>
                            {isOnLeave ? (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: '#FEE2E2', color: 'var(--red)', fontWeight: 700 }}>On Leave</span>
                            ) : empPending.length > 0 ? (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>Leave Pending</span>
                            ) : (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: 'var(--green-l)', color: 'var(--green)', fontWeight: 700 }}>Available</span>
                            )}
                          </td>
                          <td>
                            {isOnLeave && (
                              <span className="badge" style={{
                                fontSize: 11, padding: '3px 10px', fontWeight: 900, letterSpacing: 0.5,
                                background: isLate ? '#DC2626' : 'var(--green)', color: '#fff', borderRadius: 4,
                              }}>
                                {isLate ? 'LA' : 'AL'}
                              </span>
                            )}
                            {!isOnLeave && empPending.length > 0 && (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 6px', fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>
                                {empPending.length} pending
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--t3)' }}>
                            {isOnLeave ? `${leaveInfo.leaveType} · ${new Date(leaveInfo.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → ${new Date(leaveInfo.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE APPLICATIONS VIEW */}
      {activeTab === 'applications' && (
        <>
          {/* Filter Tabs */}
          <div className="tabs" style={{ marginBottom: 14 }}>
            {tabs.map(tab => (
              <div key={tab.id} className={`tab${filterStatus === tab.id ? ' active' : ''}`}
                onClick={() => setFilterStatus(tab.id)}>
                {tab.label}
                {tab.count > 0 && <span className="tab-cnt">{tab.count}</span>}
              </div>
            ))}
          </div>

          {/* Leave Applications */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaves.length === 0 ? (
              <div className="lcard">
                <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏖️</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>No leave applications found</div>
                </div>
              </div>
            ) : leaves.map((leave: any) => {
              const lsStyle = leaveStatusStyle[leave.status] || leaveStatusStyle.PENDING
              const isPending = leave.status === 'PENDING'
              const isLate = leave.applicationTag === 'LA'
              const userName = leave.user?.name || 'Unknown'
              const userDept = leave.user?.department || ''

              return (
                <div key={leave.id} className="lcard" style={{
                  borderLeft: `4px solid ${isLate ? '#DC2626' : isPending ? 'var(--amber)' : 'var(--green)'}`,
                }}>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Avatar */}
                      <div className="av" style={{
                        width: 40, height: 40, fontSize: 13,
                        background: isLate ? '#DC2626' : 'var(--g2)', flexShrink: 0,
                      }}>
                        {userName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--t1)' }}>{userName}</span>
                          {userDept && <span className="badge b-gray" style={{ fontSize: 9, padding: '1px 6px' }}>{userDept}</span>}
                          <span className="badge" style={{
                            fontSize: 11, padding: '3px 10px', fontWeight: 900, letterSpacing: 0.5,
                            background: isLate ? '#DC2626' : 'var(--green)',
                            color: '#fff', borderRadius: 4,
                          }}>
                            {isLate ? 'LA' : 'AL'}
                          </span>
                          <span className="badge" style={{ fontSize: 9, padding: '2px 8px', background: lsStyle.bg, color: lsStyle.color, fontWeight: 700 }}>
                            {lsStyle.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--t3)', flexWrap: 'wrap' }}>
                          <span><b>{leave.leaveType}</b> Leave</span>
                          <span>{new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → {new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          <span style={{ fontWeight: 700 }}>{leave.totalDays} day{leave.totalDays > 1 ? 's' : ''}</span>
                        </div>

                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
                          <b>Reason:</b> {leave.reason}
                        </div>

                        {leave.eaRemark && (
                          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                            Remark: {leave.eaRemark}
                          </div>
                        )}

                        {leave.approvedBy && (
                          <div style={{ marginTop: 2, fontSize: 10, color: 'var(--t4)' }}>
                            {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {leave.approvedBy.name}
                            {leave.approvedAt && ` on ${new Date(leave.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                          </div>
                        )}

                        {/* ADMIN-ONLY: Approve / Reject buttons for PENDING leaves */}
                        {isAdmin && isPending && (
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              placeholder="Add remark (optional)"
                              value={remarkMap[leave.id] || ''}
                              onChange={e => setRemarkMap(prev => ({ ...prev, [leave.id]: e.target.value }))}
                              style={{
                                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                                border: '1px solid var(--b1)', background: 'var(--bg2)',
                                color: 'var(--t1)', minWidth: 180,
                              }}
                            />
                            <button
                              onClick={() => handleLeaveAction(leave.id, 'approve')}
                              style={{
                                fontSize: 11, padding: '5px 14px', fontWeight: 800,
                                background: 'var(--green)', color: '#fff', border: 'none',
                                borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleLeaveAction(leave.id, 'reject')}
                              style={{
                                fontSize: 11, padding: '5px 14px', fontWeight: 800,
                                background: 'var(--red)', color: '#fff', border: 'none',
                                borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {/* EA sees view-only notice for pending leaves */}
                        {!isAdmin && isPending && (
                          <div style={{ marginTop: 8, fontSize: 10, color: '#6D28D9', fontWeight: 700, background: 'rgba(109,40,217,.06)', padding: '4px 10px', borderRadius: 4, display: 'inline-block' }}>
                            View Only — Only Admin can approve/reject
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
