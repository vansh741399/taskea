'use client'

import { useQuery } from '@tanstack/react-query'

export function LaxreePerformance() {
  const { data: users = [] } = useQuery({
    queryKey: ['users-perf'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows-perf'],
    queryFn: () => fetch('/api/workflows').then(r => r.json()),
  })

  const getInitials = (name: string) => name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '?'
  const scoreColor = (s: number) => s >= 70 ? 'var(--green)' : s >= 40 ? 'var(--amber)' : 'var(--red)'

  const members = users.filter((u: any) => u.role !== 'DIRECTOR').map((u: any) => {
    const uWf = workflows.filter((w: any) => w.creatorId === u.id)
    const done = uWf.filter((w: any) => w.status === 'COMPLETED').length
    const total = uWf.length
    const score = total ? Math.round(done / total * 100) : 0
    return { u, done, total, score }
  }).sort((a, b) => b.score - a.score)

  const rankBadge = (idx: number) => {
    if (idx === 0) return <span className="rank-gold">🥇 #1</span>
    if (idx === 1) return <span className="rank-silver">🥈 #2</span>
    if (idx === 2) return <span className="rank-bronze">🥉 #3</span>
    return <span className="rank-n">#{idx + 1}</span>
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Performance Rankings</h2>
          <p>Team member scores based on completion rate and quality</p>
        </div>
      </div>
      <div className="page-accent" />

      <div className="card">
        <div className="ch"><div className="ct">🏆 Performance Leaderboard</div><span className="badge b-gold" style={{ fontSize: 10 }}>Live</span></div>
        <div className="tw">
          <table>
            <thead><tr><th>Rank</th><th>Member</th><th>Department</th><th>Tasks</th><th>Done</th><th>Score</th><th>Progress</th></tr></thead>
            <tbody>
              {members.map(({ u, done, total, score }, idx) => (
                <tr key={u.id}>
                  <td>{rankBadge(idx)}</td>
                  <td>
                    <div className="flex">
                      <div className="av" style={{ background: scoreColor(score) }}>{getInitials(u.name)}</div>
                      <span style={{ fontWeight: 700 }}>{u.name}</span>
                    </div>
                  </td>
                  <td><span className="badge b-gray" style={{ fontSize: 10 }}>{u.department || '—'}</span></td>
                  <td style={{ fontWeight: 700 }}>{total}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>{done}</td>
                  <td><span style={{ fontWeight: 900, fontSize: 16, color: scoreColor(score) }}>{score}</span></td>
                  <td style={{ minWidth: 100 }}>
                    <div className="prog">
                      <div className="prog-bg"><div className="prog-fill" style={{ width: `${score}%`, background: scoreColor(score) }} /></div>
                      <span className="prog-lbl" style={{ color: scoreColor(score) }}>{score}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
