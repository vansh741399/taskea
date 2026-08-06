'use client'

import { useQuery } from '@tanstack/react-query'

interface TaskData { id: string; title: string; status: string; priority: string; ownerId: string; owner: { id: string; name: string; role: string }; dueDate: string | null; createdAt: string }

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge s-pending', IN_PROGRESS: 'badge s-inprog', COMPLETED: 'badge s-done',
    CANCELLED: 'badge s-cancelled', ON_HOLD: 'badge s-waiting', EXTERNAL_HOLD: 'badge s-exthold',
    APPROVED: 'badge b-green', REJECTED: 'badge b-red', ESCALATED: 'badge b-rose',
  }
  return map[status] || 'badge b-gray'
}

export function LaxreeCancelled() {
  const { data: tasks = [], isLoading } = useQuery<TaskData[]>({
    queryKey: ['cancelled-tasks'],
    queryFn: () => fetch('/api/tasks?status=CANCELLED').then(r => r.json()),
  })

  return (
    <div>
      <div className="ph">
        <div className="ph-left">
          <h2>Cancelled Tasks</h2>
          <p>{tasks.length} cancelled tasks</p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="cb" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>No Cancelled Tasks</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>All tasks are on track!</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => (
            <div key={t.id} className="appr-card" style={{ opacity: 0.7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>❌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, textDecoration: 'line-through', color: 'var(--t3)' }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{t.owner?.name} · Created {new Date(t.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span className={statusBadgeClass(t.status)}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
