'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

export function LaxreeEmployeeLeaves() {
  const { currentUserId, currentUserName, addToast } = useWorkflowStore()
  const queryClient = useQueryClient()

  // Avatar
  const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
  function avatarColor(name: string) {
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
  }
  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }
  const userInitials = getInitials(currentUserName || 'E')
  const userAvatarBg = avatarColor(currentUserName || 'Employee')

  // Leave apply form
  const [leaveType, setLeaveType] = useState('CASUAL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('ALL')

  // Fetch employee's own leaves only — with auto-refresh for real-time status updates
  const { data: leavesData, isLoading: leavesLoading, refetch: refetchLeaves } = useQuery({
    queryKey: ['emp-leaves', currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/leaves?userId=${currentUserId}`)
      if (!res.ok) throw new Error('Failed to fetch leaves')
      const data = await res.json()
      return data
    },
    enabled: !!currentUserId,
    refetchOnMount: 'always',
    staleTime: 0,
    refetchInterval: 10000, // Auto-refresh every 10 seconds so employee sees EA approval/rejection
  })

  // Parse leaves from response
  const rawLeaves = leavesData?.leaves || []
  const allLeaves = Array.isArray(rawLeaves) ? rawLeaves : (Array.isArray(leavesData) ? leavesData : [])

  // Filter leaves on client side based on filterStatus
  const leaves = filterStatus === 'ALL' 
    ? allLeaves 
    : allLeaves.filter((l: any) => l.status === filterStatus)

  // Apply leave mutation — with proper HTTP error checking
  const applyLeaveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('Leave API error:', res.status, json)
        throw new Error(json.error || `Failed to apply leave (HTTP ${res.status})`)
      }
      return json
    },
    onSuccess: (data: any) => {
      console.log('Leave created successfully:', data)
      // Invalidate ALL leave-related queries
      queryClient.invalidateQueries({ queryKey: ['emp-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['all-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['emp-leaves-sidebar'] })
      const tag = data.leave?.applicationTag || 'AL'
      addToast('ok', `Leave applied successfully! Tag: ${tag === 'AL' ? 'AL (On Time)' : 'LA (Late)'}`)
      setFromDate('')
      setToDate('')
      setLeaveReason('')
      setShowLeaveForm(false)
      // Force immediate refetch
      setTimeout(() => refetchLeaves(), 300)
    },
    onError: (err: any) => {
      console.error('Leave mutation error:', err)
      addToast('err', err.message || 'Failed to apply leave. Please try again.')
    },
  })

  // Handle apply leave
  const handleApplyLeave = () => {
    if (!currentUserId) {
      addToast('err', 'You must be logged in to apply for leave')
      return
    }
    if (!fromDate || !toDate || !leaveReason.trim()) {
      addToast('err', 'Please fill all fields: From Date, To Date, and Reason')
      return
    }
    applyLeaveMutation.mutate({
      userId: currentUserId,
      leaveType,
      fromDate,
      toDate,
      reason: leaveReason.trim(),
    })
  }

  // Cancel leave mutation (only for PENDING leaves)
  const cancelMutation = useMutation({
    mutationFn: async (leaveId: string) => {
      const res = await fetch(`/api/leaves/${leaveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to cancel leave')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emp-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['all-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['emp-leaves-sidebar'] })
      addToast('ok', 'Leave cancelled')
      setTimeout(() => refetchLeaves(), 300)
    },
    onError: (err: any) => addToast('err', err.message || 'Failed to cancel leave'),
  })

  // Stats (from ALL leaves, not filtered)
  const pendingLeaves = allLeaves.filter((l: any) => l.status === 'PENDING')
  const approvedLeaves = allLeaves.filter((l: any) => l.status === 'APPROVED')
  const rejectedLeaves = allLeaves.filter((l: any) => l.status === 'REJECTED')

  const leaveStatusStyle: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    APPROVED: { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
    REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    CANCELLED: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  }

  // AL/LA preview calculator
  const getTagPreview = () => {
    if (!fromDate) return null
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const fromDayStart = new Date(new Date(fromDate).getFullYear(), new Date(fromDate).getMonth(), new Date(fromDate).getDate())
    const daysBefore = Math.ceil((fromDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
    return { daysBefore, isAL: daysBefore >= 1 }
  }

  const tagPreview = getTagPreview()

  const tabs = [
    { id: 'ALL', label: 'All', count: allLeaves.length },
    { id: 'PENDING', label: 'Pending', count: pendingLeaves.length },
    { id: 'APPROVED', label: 'Approved', count: approvedLeaves.length },
    { id: 'REJECTED', label: 'Rejected', count: rejectedLeaves.length },
  ]

  return (
    <>
      <div className="ph">
        <div className="ph-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="av" style={{ width: 38, height: 38, fontSize: 14, background: userAvatarBg }}>
            {userInitials}
          </div>
          <div>
            <h2>Leave Management</h2>
            <p>Apply for leave and track your leave status
            <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--green)', fontWeight: 700, background: 'var(--green-l)', padding: '2px 8px', borderRadius: 10 }}>
              Auto-refresh ON
            </span>
          </p>
          </div>
        </div>
        <div className="ph-right">
          <button 
            className="btn btn-gold" 
            onClick={() => setShowLeaveForm(true)}
            disabled={applyLeaveMutation.isPending}
          >
            + Apply Leave
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Debug info - remove later */}
      {!currentUserId && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#DC2626', borderRadius: 8, marginBottom: 12, fontWeight: 700 }}>
          ⚠ Not logged in! Please log in first to apply for leave.
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--amber)' }}>{pendingLeaves.length}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Approved</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{approvedLeaves.length}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Rejected</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--red)' }}>{rejectedLeaves.length}</div>
        </div>
        <div className="lcard" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Total Leaves</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--t1)' }}>{allLeaves.length}</div>
        </div>
      </div>

      {/* ===================== APPLY LEAVE FORM ===================== */}
      {showLeaveForm && (
        <div className="lcard" style={{ marginBottom: 16, borderLeft: '4px solid var(--g2)' }}>
          <div className="ch">
            <div className="ct">📝 Apply for Leave</div>
            <button className="btn" style={{ fontSize: 11, padding: '4px 12px', background: 'var(--bg2)', color: 'var(--t2)' }}
              onClick={() => { setShowLeaveForm(false); setFromDate(''); setToDate(''); setLeaveReason(''); }}>
              ✕ Close
            </button>
          </div>
          <div className="cb">
            <div className="form-row fr-3">
              <div className="fg">
                <label>Leave Type</label>
                <select className="sel" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="EARNED">Earned Leave</option>
                  <option value="HALF_DAY">Half Day</option>
                </select>
              </div>
              <div className="fg">
                <label>From Date *</label>
                <input 
                  className="fi" 
                  type="date" 
                  value={fromDate} 
                  onChange={e => setFromDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} 
                />
              </div>
              <div className="fg">
                <label>To Date *</label>
                <input 
                  className="fi" 
                  type="date" 
                  value={toDate} 
                  onChange={e => setToDate(e.target.value)}
                  min={fromDate || new Date().toISOString().split('T')[0]} 
                />
              </div>
            </div>
            <div className="fg" style={{ marginTop: 10 }}>
              <label>Reason *</label>
              <textarea 
                className="fi" 
                rows={3} 
                placeholder="Enter reason for leave..." 
                value={leaveReason}
                onChange={e => setLeaveReason(e.target.value)} 
                style={{ resize: 'vertical' }} 
              />
            </div>

            {/* AL/LA Preview */}
            {tagPreview && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 8,
                background: tagPreview.isAL ? 'var(--green-l)' : '#FEE2E2',
                border: `1px solid ${tagPreview.isAL ? 'rgba(21,128,61,.3)' : 'rgba(220,38,38,.3)'}`,
              }}>
                {tagPreview.isAL ? (
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>
                      ✓ AL — Applied on time
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      {tagPreview.daysBefore} day{tagPreview.daysBefore > 1 ? 's' : ''} before leave — will show as <b style={{ color: 'var(--green)' }}>AL</b> in EA delegation
                    </div>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)' }}>
                      ⚠ LA — Late Application
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      Less than 1 day before leave — will show as <b style={{ color: 'var(--red)' }}>LA</b> (red) in EA delegation
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {applyLeaveMutation.isError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', fontSize: 12, fontWeight: 700 }}>
                Error: {applyLeaveMutation.error?.message || 'Failed to apply leave'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button 
                className="btn" 
                style={{ background: 'var(--bg2)', color: 'var(--t2)' }}
                onClick={() => { setShowLeaveForm(false); setFromDate(''); setToDate(''); setLeaveReason(''); }}
                disabled={applyLeaveMutation.isPending}
              >
                Cancel
              </button>
              <button 
                className="btn btn-gold" 
                disabled={!fromDate || !toDate || !leaveReason.trim() || applyLeaveMutation.isPending}
                onClick={handleApplyLeave}
              >
                {applyLeaveMutation.isPending ? 'Applying...' : 'Submit Leave'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
              <b>AL</b> = Applied on time (1+ day before leave) · <span style={{ color: 'var(--red)', fontWeight: 700 }}>LA</span> = Late Application (same day or less than 1 day before)
              <br />
              Your leave will be reviewed by Admin. You will see the status update here once processed.
            </div>
          </div>
        </div>
      )}

      {/* Show Apply button if form is closed */}
      {!showLeaveForm && (
        <div className="lcard" style={{ marginBottom: 16, textAlign: 'center', padding: '20px 16px', cursor: 'pointer', border: '2px dashed var(--b2)', background: 'var(--card2)' }}
          onClick={() => setShowLeaveForm(true)}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🏖️</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g2)' }}>+ Apply for Leave</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Click here to submit a leave application</div>
        </div>
      )}

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

      {/* Leave History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {leavesLoading && (
          <div className="lcard">
            <div className="cb" style={{ textAlign: 'center', padding: 30, color: 'var(--t3)' }}>
              <div style={{ fontWeight: 700 }}>Loading leaves...</div>
            </div>
          </div>
        )}
        {!leavesLoading && leaves.length === 0 && (
          <div className="lcard">
            <div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏖️</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>No leaves found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "Apply Leave" above to request time off</div>
            </div>
          </div>
        )}
        {leaves.map((leave: any) => {
          const lsStyle = leaveStatusStyle[leave.status] || leaveStatusStyle.PENDING
          const isPending = leave.status === 'PENDING'
          const isApproved = leave.status === 'APPROVED'
          const isRejected = leave.status === 'REJECTED'
          const isLate = leave.applicationTag === 'LA'

          return (
            <div key={leave.id} className="lcard" style={{
              borderLeft: `4px solid ${isRejected ? '#DC2626' : isApproved ? 'var(--green)' : isPending ? 'var(--amber)' : 'var(--b2)'}`,
            }}>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Status Icon */}
                  <div className="av" style={{
                    width: 42, height: 42, fontSize: 16, flexShrink: 0,
                    background: isApproved ? 'var(--green)' : isRejected ? '#DC2626' : isPending ? 'var(--amber)' : 'var(--t3)',
                    color: '#fff',
                  }}>
                    {isApproved ? '✓' : isRejected ? '✕' : isPending ? '⏳' : '—'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>
                        {leave.leaveType} Leave
                      </span>
                      <span className="badge" style={{
                        fontSize: 11, padding: '3px 10px', fontWeight: 900, letterSpacing: 0.5,
                        background: isLate ? '#DC2626' : 'var(--green)',
                        color: '#fff',
                        borderRadius: 4,
                      }}>
                        {isLate ? '⚠ LA' : '✓ AL'}
                      </span>
                      <span className="badge" style={{
                        fontSize: 11, padding: '4px 12px', fontWeight: 800,
                        background: lsStyle.bg, color: lsStyle.color,
                        borderRadius: 6,
                      }}>
                        {lsStyle.label}
                      </span>
                    </div>

                    {/* Date range */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t2)', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span>→</span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="badge b-gray" style={{ fontSize: 10, padding: '2px 8px' }}>
                        {leave.totalDays} day{leave.totalDays > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Reason */}
                    <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5, marginBottom: 4 }}>
                      <b>Reason:</b> {leave.reason}
                    </div>

                    {/* Status-specific messages */}
                    {isApproved && (
                      <div style={{
                        marginTop: 8, padding: '10px 14px', borderRadius: 8,
                        background: '#DCFCE7', border: '1px solid rgba(21,128,61,.2)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#15803D', marginBottom: 4 }}>
                          ✓ Leave Approved
                        </div>
                        {leave.approvedBy && (
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                            Approved by {leave.approvedBy.name}
                            {leave.approvedAt && ` on ${new Date(leave.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                          </div>
                        )}
                        {leave.eaRemark && (
                          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>
                            <b>EA Remark:</b> {leave.eaRemark}
                          </div>
                        )}
                      </div>
                    )}

                    {isRejected && (
                      <div style={{
                        marginTop: 8, padding: '10px 14px', borderRadius: 8,
                        background: '#FEE2E2', border: '1px solid rgba(220,38,38,.2)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', marginBottom: 4 }}>
                          ✕ Leave Rejected
                        </div>
                        {leave.approvedBy && (
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                            Rejected by {leave.approvedBy.name}
                            {leave.approvedAt && ` on ${new Date(leave.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                          </div>
                        )}
                        {leave.eaRemark && (
                          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
                            <b>EA Remark:</b> {leave.eaRemark}
                          </div>
                        )}
                      </div>
                    )}

                    {isPending && (
                      <div style={{
                        marginTop: 8, padding: '10px 14px', borderRadius: 8,
                        background: '#FEF3C7', border: '1px solid rgba(146,64,14,.2)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 4 }}>
                          ⏳ Pending — Awaiting Admin Approval
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                          Your leave application is being reviewed by Admin. You will see the status update here once it is processed.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cancel button for pending leaves */}
                  {isPending && (
                    <div style={{ flexShrink: 0 }}>
                      <button
                        className="btn"
                        style={{
                          fontSize: 11, padding: '6px 14px',
                          background: '#F3F4F6', color: '#6B7280',
                          border: '1px solid #D1D5DB', fontWeight: 700,
                        }}
                        onClick={() => {
                          if (confirm('Are you sure you want to cancel this leave?')) {
                            cancelMutation.mutate(leave.id)
                          }
                        }}
                      >
                        Cancel Leave
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
