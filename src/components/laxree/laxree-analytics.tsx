'use client'

import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'

export function LaxreeAnalytics() {
  const { currentUserId } = useWorkflowStore()
  const { data: dash } = useQuery({
    queryKey: ['dashboard-analytics', currentUserId],
    queryFn: () => fetch(`/api/dashboard?userId=${currentUserId}`).then(r => r.json()),
    enabled: !!currentUserId,
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows-analytics'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })

  const total = dash?.totalWorkflows || workflows.length || 0
  const completed = dash?.statusCounts?.COMPLETED || workflows.filter((w: any) => w.status === 'COMPLETED').length || 0
  const rate = total ? Math.round(completed / total * 100) : 0
  const overdue = dash?.overdueTasks || 0

  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft', PENDING: 'Pending', IN_REVIEW: 'In Review', APPROVED: 'Approved',
    REJECTED: 'Rejected', IN_PROGRESS: 'In Progress', ON_HOLD: 'On Hold',
    ESCALATED: 'Escalated', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXTERNAL_HOLD: 'External Hold',
  }

  const statusColors: Record<string, string> = {
    COMPLETED: 'var(--green)', PENDING: 'var(--amber)', IN_REVIEW: 'var(--blue)',
    IN_PROGRESS: 'var(--teal)', ON_HOLD: 'var(--purple)', ESCALATED: 'var(--red)',
    CANCELLED: 'var(--t3)', EXTERNAL_HOLD: '#C2410C', APPROVED: 'var(--green)',
    REJECTED: 'var(--red)', DRAFT: 'var(--t4)',
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Analytics & Reports</h2>
          <p>Real-time business intelligence and performance metrics</p>
        </div>
      </div>
      <div className="page-accent" />

      {/* KPI Row */}
      <div className="stat-grid sg-4" style={{ marginBottom: 14 }}>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--g2)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Total Workflows</div><div className="sc-val" style={{ color: 'var(--g2)' }}>{total}</div></div>
            <div className="sc-icon" style={{ background: 'var(--gb)' }}>📊</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Completed</div><div className="sc-val" style={{ color: 'var(--green)' }}>{completed}</div></div>
            <div className="sc-icon" style={{ background: 'var(--green-m)' }}>✓</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--blue)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Completion Rate</div><div className="sc-val" style={{ color: 'var(--blue)' }}>{rate}%</div></div>
            <div className="sc-icon" style={{ background: 'var(--blue-m)' }}>📈</div>
          </div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Overdue</div><div className="sc-val" style={{ color: 'var(--red)' }}>{overdue}</div></div>
            <div className="sc-icon" style={{ background: 'var(--red-m)' }}>⚠</div>
          </div>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">📊 Status Distribution</div><span className="badge b-gold" style={{ fontSize: 10 }}>Live</span></div>
        <div className="cb">
          {Object.entries((dash?.statusCounts || {}) as Record<string, number>).filter(([, v]) => v > 0).map(([status, count]) => {
            const pct = total ? Math.round(count / total * 100) : 0
            return (
              <div key={status} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{statusLabels[status] || status}</span>
                  <span style={{ fontWeight: 800, color: statusColors[status] || 'var(--t2)' }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 8, background: 'var(--b1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: statusColors[status] || 'var(--t2)', borderRadius: 4, transition: 'width .5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Department Comparison */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">🏢 Department Performance</div></div>
        <div className="cb">
          {['Sales', 'Back Office', 'Accounts', 'Management'].map(dept => {
            const deptWf = workflows.filter((w: any) => w.creator?.department === dept || dept === 'Management')
            const done = deptWf.filter((w: any) => w.status === 'COMPLETED').length
            const pct = deptWf.length ? Math.round(done / deptWf.length * 100) : 0
            const col = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
            return (
              <div key={dept} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{dept}</span>
                  <span style={{ fontWeight: 800, color: col, fontSize: 14 }}>{pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>
                  <span>✅ {done} done</span>
                  <span>⏱ {deptWf.length - done} active</span>
                </div>
                <div style={{ height: 6, background: 'var(--b1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, transition: 'width .5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
