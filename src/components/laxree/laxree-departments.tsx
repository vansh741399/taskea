'use client'

import { useQuery } from '@tanstack/react-query'

export function LaxreeDepartments() {
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows-depts'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })

  const departments = [
    { name: 'Sales', icon: '🏷️', color: 'var(--amber)', wf: workflows.filter((w: any) => w.creator?.department === 'Sales') },
    { name: 'Back Office', icon: '🏢', color: 'var(--purple)', wf: workflows.filter((w: any) => w.creator?.department === 'Back Office') },
    { name: 'Accounts', icon: '💰', color: 'var(--green)', wf: workflows.filter((w: any) => w.creator?.department === 'Accounts') },
    { name: 'Management', icon: '👔', color: 'var(--blue)', wf: workflows.filter((w: any) => w.creator?.department === 'Management') },
  ]

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Departments</h2>
          <p>Department-level performance and task distribution</p>
        </div>
      </div>
      <div className="page-accent" />

      <div className="stat-grid sg-2">
        {departments.map(dept => {
          const total = dept.wf.length
          const done = dept.wf.filter((w: any) => w.status === 'COMPLETED').length
          const active = dept.wf.filter((w: any) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED').length
          const rate = total ? Math.round(done / total * 100) : 0

          return (
            <div className="dept-card" key={dept.name}>
              <div className="dept-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 24 }}>{dept.icon}</span>
                  <div className="dept-name" style={{ color: dept.color }}>{dept.name}</div>
                </div>
                <span className="badge b-gold" style={{ fontSize: 10 }}>{rate}%</span>
              </div>
              <div className="dept-stats">
                <div className="dept-stat"><div className="dept-stat-v" style={{ color: 'var(--g2)' }}>{total}</div><div className="dept-stat-l">Total</div></div>
                <div className="dept-stat"><div className="dept-stat-v" style={{ color: 'var(--green)' }}>{done}</div><div className="dept-stat-l">Done</div></div>
                <div className="dept-stat"><div className="dept-stat-v" style={{ color: 'var(--amber)' }}>{active}</div><div className="dept-stat-l">Active</div></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 6, background: 'var(--b1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${rate}%`, background: dept.color, borderRadius: 3, transition: 'width .5s' }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
