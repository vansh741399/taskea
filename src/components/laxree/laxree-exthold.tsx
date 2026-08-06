'use client'

import { useQuery } from '@tanstack/react-query'

interface TaskData { id: string; title: string; status: string; priority: string; ownerId: string; owner: { id: string; name: string; role: string }; dueDate: string | null; createdAt: string }

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

const AVATAR_COLORS = ['#B45309','#6D28D9','#0F766E','#1D4ED8','#BE123C','#15803D','#C2410C','#7C3AED','#0D9488','#B8860B','#D97706','#4F46E5','#059669','#DC2626','#B8860B','#B8860B']
function avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length] }

export function LaxreeExtHold() {
  const { data: tasks = [], isLoading } = useQuery<TaskData[]>({
    queryKey: ['exthold-tasks'],
    queryFn: () => fetch('/api/tasks?status=EXTERNAL_HOLD').then(r => r.json()),
  })

  return (
    <div>
      <div className="ph">
        <div className="ph-left">
          <h2>External Hold</h2>
          <p>{tasks.length} tasks on external hold</p>
        </div>
      </div>

      {/* Alert Banner */}
      <div className="alert" style={{ background: '#FFF7ED', border: '1.5px solid rgba(194,65,12,.25)', marginBottom: 14 }}>
        <span className="alert-icon">🔒</span>
        <div className="alert-body">
          <div className="alert-title" style={{ color: '#C2410C' }}>External Hold Queue</div>
          <div className="alert-sub">These tasks are held pending external director action or dependency resolution</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="cb" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔓</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No External Holds</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>No tasks are on external hold</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => (
            <div key={t.id} className="dd-card dd-on-hold">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div className="av" style={{ background: avatarColor(t.owner?.name || 'X') }}>{getInitials(t.owner?.name || '?')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{t.owner?.name} · {t.priority} priority</div>
                </div>
                <span className="dd-status-badge dd-status-on-hold">External Hold</span>
              </div>
              {t.dueDate && (
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  Original due: {new Date(t.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
