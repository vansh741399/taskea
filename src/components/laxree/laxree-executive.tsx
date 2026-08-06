'use client'

import { useWorkflowStore } from '@/stores/workflow-store'

export function LaxreeExecutive() {
  const { currentUser } = useWorkflowStore()

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Executive View</h2>
          <p>High-level overview for leadership — {currentUser?.name || 'Director'}</p>
        </div>
      </div>
      <div className="page-accent" />

      {/* Director Info Banner */}
      <div className="dd-dir-action-banner" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>👔</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#6D28D9', fontFamily: "'Cormorant Garamond', serif" }}>
              {currentUser?.name || 'Director'} — Executive Dashboard
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              Real-time organizational health and dependency tracking
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stat-grid sg-4" style={{ marginBottom: 14 }}>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--g2)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Your Pending</div><div className="sc-val" style={{ color: 'var(--purple)' }}>0</div></div>
            <div className="sc-icon" style={{ background: 'var(--purple-m)' }}>📋</div>
          </div>
          <div className="sc-sub">Items requiring your action</div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--green)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Approved Today</div><div className="sc-val" style={{ color: 'var(--green)' }}>0</div></div>
            <div className="sc-icon" style={{ background: 'var(--green-m)' }}>✓</div>
          </div>
          <div className="sc-sub">Items you approved</div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--amber)' }} />
          <div className="sc-top">
            <div><div className="sc-label">On Hold</div><div className="sc-val" style={{ color: 'var(--amber)' }}>0</div></div>
            <div className="sc-icon" style={{ background: 'var(--amber-m)' }}>⏸</div>
          </div>
          <div className="sc-sub">Items held for review</div>
        </div>
        <div className="sc lux-border">
          <div className="sc-accent" style={{ background: 'var(--red)' }} />
          <div className="sc-top">
            <div><div className="sc-label">Escalated</div><div className="sc-val" style={{ color: 'var(--red)' }}>0</div></div>
            <div className="sc-icon" style={{ background: 'var(--red-m)' }}>🚨</div>
          </div>
          <div className="sc-sub">Requires immediate attention</div>
        </div>
      </div>

      {/* Organization Health */}
      <div className="ai-widget" style={{ marginBottom: 14 }}>
        <div className="ai-label"><div className="ai-pulse" />Executive Intelligence</div>
        <div>
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: 'var(--green)' }} />
            <div className="ai-text"><strong>System Operational</strong> — All departments are active. Workflow engine processing normally.</div>
          </div>
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: 'var(--g2)' }} />
            <div className="ai-text"><strong>Approval Pipeline</strong> — EA and Director routing is functional. Review queue is accessible.</div>
          </div>
          <div className="ai-item">
            <div className="ai-bullet" style={{ background: 'var(--blue)' }} />
            <div className="ai-text"><strong>Recommendation</strong> — Review Director Dependency Center for any pending actions.</div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="stat-grid sg-3">
        <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 800, color: 'var(--purple)' }}>Director Dependency</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>View all items pending your action</div>
        </div>
        <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
          <div style={{ fontWeight: 800, color: 'var(--amber)' }}>Approvals</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Review and approve workflows</div>
        </div>
        <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 800, color: 'var(--g2)' }}>Analytics</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Performance and reports</div>
        </div>
      </div>
    </>
  )
}
