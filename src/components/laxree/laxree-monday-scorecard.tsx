'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function getSunday(date: Date): Date {
  const monday = getMonday(date)
  return new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
}

export function LaxreeMondayScorecard() {
  const { mmPanelOpen, toggleMmPanel, addToast } = useWorkflowStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedPerson, setSelectedPerson] = useState('')
  const qc = useQueryClient()

  const weekInfo = useMemo(() => {
    const now = new Date()
    const targetDate = new Date(now.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000)
    return {
      monday: getMonday(targetDate),
      sunday: getSunday(targetDate),
      weekNum: getWeekNumber(targetDate),
      year: targetDate.getFullYear(),
    }
  }, [weekOffset])

  const { data: users = [] } = useQuery({
    queryKey: ['users-mm-side'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  // Fetch live weekly score
  const { data: liveScore } = useQuery({
    queryKey: ['weekly-score-side', selectedPerson, weekInfo.weekNum, weekInfo.year],
    queryFn: () => fetch(
      `/api/weekly-score?userId=${selectedPerson}&weekStart=${weekInfo.monday.toISOString()}&weekEnd=${weekInfo.sunday.toISOString()}`
    ).then(r => r.json()),
    enabled: !!selectedPerson,
  })

  // Fetch existing scorecard
  const { data: scorecard } = useQuery({
    queryKey: ['monday-meeting-side', selectedPerson, weekInfo.weekNum, weekInfo.year],
    queryFn: () => fetch(
      `/api/monday-meeting?userId=${selectedPerson}&weekNumber=${weekInfo.weekNum}&year=${weekInfo.year}`
    ).then(r => r.json()),
    enabled: !!selectedPerson,
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const sc = scorecard as any
      const ls = liveScore as any
      const res = await fetch('/api/monday-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedPerson,
          weekStartDate: weekInfo.monday.toISOString(),
          weekEndDate: weekInfo.sunday.toISOString(),
          weekNumber: weekInfo.weekNum,
          year: weekInfo.year,
          planRedScore: sc?.planRedScore || 0,
          planYellowScore: sc?.planYellowScore || 0,
          planGreenScore: sc?.planGreenScore || 0,
          actualRedScore: ls?.redScore || 0,
          actualYellowScore: ls?.yellowScore || 0,
          actualGreenScore: ls?.greenScore || 0,
          nextRedScore: sc?.nextRedScore || 0,
          nextYellowScore: sc?.nextYellowScore || 0,
          nextGreenScore: sc?.nextGreenScore || 0,
          prScore: ls?.prScore || 0,
          commitments: sc?.commitments || '',
          notes: sc?.notes || '',
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monday-meeting-side'] })
      addToast('ok', 'Scorecard saved')
    },
  })

  const ls = liveScore as any
  const scoreCellClass = (score: number) =>
    score >= 70 ? 'green-cell' : score >= 40 ? 'yellow-cell' : 'red-cell'

  const weekLabel = `Week ${weekInfo.weekNum}`

  if (!mmPanelOpen) return (
    <button className="mm-toggle" onClick={toggleMmPanel}>SCORECARD</button>
  )

  return (
    <>
      <button className="mm-toggle" onClick={toggleMmPanel} style={{ display: mmPanelOpen ? 'none' : undefined }}>SCORECARD</button>
      <div className="mm-panel open">
        <div className="mm-header">
          <div className="mm-title">
            <span>🗓</span> Monday Scorecard
          </div>
          <button className="mm-close-btn" onClick={toggleMmPanel}>✕</button>
        </div>
        <div className="mm-body">
          {/* Person selector */}
          <div className="mm-section">
            <div className="mm-section-label">Team Member</div>
            <select className="mm-sel" value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)}>
              <option value="">Select person…</option>
              {users.filter((u: any) => u.role !== 'DIRECTOR').map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Week navigation */}
          <div className="mm-section">
            <div className="mm-section-label">Week</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="mm-week-btn" onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '4px 10px', fontSize: 11 }}>◀</button>
              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, textAlign: 'center' }}>{weekLabel}</span>
              <button className="mm-week-btn" onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} style={{ padding: '4px 10px', fontSize: 11 }}>▶</button>
            </div>
          </div>

          {/* Live Score Card */}
          {selectedPerson && ls && (
            <div className="mm-section">
              <div className="mm-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Live Score
                <span style={{ fontSize: 8, background: '#22C55E', color: '#fff', padding: '1px 6px', borderRadius: 10, fontWeight: 800, animation: 'ap-pulse 2s infinite' }}>LIVE</span>
              </div>
              <div className="mm-scorecard">
                <div className="mm-sc-row">
                  <div className="mm-sc-head" style={{ fontSize: 8 }}>Category</div>
                  <div className="mm-sc-head" style={{ fontSize: 8, color: '#DC2626' }}>Red</div>
                  <div className="mm-sc-head" style={{ fontSize: 8, color: '#D97706' }}>Yellow</div>
                  <div className="mm-sc-head" style={{ fontSize: 8, color: '#15803D' }}>Green</div>
                </div>
                <div className="mm-sc-row">
                  <div className="mm-sc-metric" style={{ fontSize: 9 }}>Actual</div>
                  <div className={`mm-sc-cell ${scoreCellClass(ls.redScore || 0)}`} style={{ fontSize: 10 }}>{ls.redScore || 0}%</div>
                  <div className={`mm-sc-cell ${scoreCellClass(ls.yellowScore || 0)}`} style={{ fontSize: 10 }}>{ls.yellowScore || 0}%</div>
                  <div className={`mm-sc-cell ${scoreCellClass(ls.greenScore || 0)}`} style={{ fontSize: 10 }}>{ls.greenScore || 0}%</div>
                </div>
              </div>

              {/* Task Breakdown */}
              <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: '#22C55E' }}>✓ On time: {ls.completedOnTime || 0}</span>
                <span style={{ color: '#F59E0B' }}>◐ In progress/Late: {(ls.inProgressOnTrack || 0) + (ls.completedLate || 0)}</span>
                <span style={{ color: '#EF4444' }}>✕ Overdue/Rejected: {(ls.overdue || 0) + (ls.rejected || 0)}</span>
                <span style={{ fontWeight: 700 }}>Total: {ls.totalTasks || 0} tasks</span>
              </div>

              {/* PR Score */}
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: ls.prScore >= 70 ? 'var(--green-l)' : ls.prScore >= 40 ? 'var(--amber-l)' : 'var(--red-l)', textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: 'var(--t3)' }}>PR Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: ls.prScore >= 70 ? 'var(--green)' : ls.prScore >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                  {ls.prScore || '—'}
                </div>
              </div>
            </div>
          )}

          {/* No data message */}
          {!selectedPerson && (
            <div className="mm-no-data" style={{ marginTop: 16 }}>
              Select a team member to view live score
            </div>
          )}

          {/* Save button */}
          {selectedPerson && (
            <button
              className="mm-save-btn"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? '⏳ Saving...' : '💾 Save Scorecard'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
