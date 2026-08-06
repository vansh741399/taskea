'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════ */

// Get ISO week number from date
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Get Monday of the week containing the date
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

// Get Sunday of the week
function getSunday(date: Date): Date {
  const monday = getMonday(date)
  return new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
}

// Format date as DD/MM/YYYY
function formatDate(date: Date): string {
  const d = new Date(date)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

// Calculate PR (Performance Rating) from scores
function calculatePR(actualGreen: number, actualYellow: number, actualRed: number): number {
  const total = actualGreen + actualYellow + actualRed
  if (total === 0) return 0
  const score = (actualGreen * 10 + actualYellow * 5) / (total * 10 / 100)
  return Math.round(score * 10) / 10
}

// Get score color class
function scoreColor(value: number): string {
  if (value >= 70) return 'var(--green)'
  if (value >= 40) return 'var(--amber)'
  return 'var(--red)'
}

function scoreBg(value: number): string {
  if (value >= 70) return 'var(--green-l)'
  if (value >= 40) return 'var(--amber-l)'
  return 'var(--red-l)'
}

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

interface ScorecardData {
  id: string
  userId: string
  weekStartDate: string
  weekEndDate: string
  weekNumber: number
  year: number
  planRedScore: number
  planYellowScore: number
  planGreenScore: number
  actualRedScore: number
  actualYellowScore: number
  actualGreenScore: number
  nextRedScore: number
  nextYellowScore: number
  nextGreenScore: number
  prScore: number
  commitments: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    department: string | null
    designation: string | null
    phone: string | null
  }
}

interface WeeklyScoreData {
  totalTasks: number
  completedOnTime: number
  completedLate: number
  inProgressOnTrack: number
  overdue: number
  pending: number
  rejected: number
  greenScore: number
  yellowScore: number
  redScore: number
  prScore: number
}

interface PlanFormData {
  planRedScore: number
  planYellowScore: number
  planGreenScore: number
  nextRedScore: number
  nextYellowScore: number
  nextGreenScore: number
  commitments: string
  notes: string
}

const emptyPlanForm: PlanFormData = {
  planRedScore: 0, planYellowScore: 0, planGreenScore: 0,
  nextRedScore: 0, nextYellowScore: 0, nextGreenScore: 0,
  commitments: '',
  notes: '',
}

/* ═══════════════════════════════════════════════════════════
   LIVE BADGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

function LiveBadge({ isLive }: { isLive: boolean }) {
  if (!isLive) return null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      marginLeft: 6,
      padding: '1px 6px',
      borderRadius: 4,
      background: '#059669',
      color: '#fff',
      fontSize: 8,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      lineHeight: '14px',
      verticalAlign: 'middle',
      animation: 'livePulse 2s ease-in-out infinite',
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: '#4ADE80',
        display: 'inline-block',
      }} />
      LIVE
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export function LaxreeMonday() {
  const { addToast } = useWorkflowStore()
  const qc = useQueryClient()

  // State
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [saving, setSaving] = useState(false)

  // Plan form data (This Week Plan, Next Week Plan, commitments, notes)
  const [planForm, setPlanForm] = useState<PlanFormData>({ ...emptyPlanForm })

  // Computed week info
  const weekInfo = useMemo(() => {
    const now = new Date()
    const targetDate = new Date(now.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000)
    const monday = getMonday(targetDate)
    const sunday = getSunday(targetDate)
    const weekNum = getWeekNumber(targetDate)
    const year = targetDate.getFullYear()
    return { monday, sunday, weekNum, year, targetDate }
  }, [weekOffset])

  // Fetch users (employees only - no directors)
  const { data: usersData = [] } = useQuery({
    queryKey: ['users-monday'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })
  const users: any[] = Array.isArray(usersData) ? usersData : []

  // Filter users: employees, managers, EA, admin - exclude directors
  const doers = users.filter((u: any) => u.role !== 'DIRECTOR' && u.isActive)

  // Fetch scorecards for selected user
  const { data: scorecardsData = [], isLoading: scorecardsLoading } = useQuery({
    queryKey: ['monday-meeting', selectedUserId],
    queryFn: () => selectedUserId
      ? fetch(`/api/monday-meeting?userId=${selectedUserId}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedUserId,
  })
  const scorecards: ScorecardData[] = Array.isArray(scorecardsData) ? scorecardsData : []

  // Find current week scorecard
  const currentWeekScorecard = useMemo(() => {
    return scorecards.find((s: ScorecardData) =>
      s.weekNumber === weekInfo.weekNum && s.year === weekInfo.year
    )
  }, [scorecards, weekInfo])

  // Find PREVIOUS week scorecard (to auto-populate This Week Score from their Next Week Plan commitments)
  const prevWeekScorecard = useMemo(() => {
    const prevWeekOffset = new Date(weekInfo.monday.getTime() - 7 * 24 * 60 * 60 * 1000)
    const prevWeekNum = getWeekNumber(prevWeekOffset)
    const prevYear = prevWeekOffset.getFullYear()
    return scorecards.find((s: ScorecardData) =>
      s.weekNumber === prevWeekNum && s.year === prevYear
    )
  }, [scorecards, weekInfo])

  // Fetch LIVE weekly score data for the selected user + week
  const { data: weeklyScoreData, isLoading: weeklyScoreLoading } = useQuery({
    queryKey: ['weekly-score', selectedUserId, weekInfo.weekNum, weekInfo.year],
    queryFn: () => fetch(
      `/api/weekly-score?userId=${selectedUserId}&weekStart=${weekInfo.monday.toISOString()}&weekEnd=${weekInfo.sunday.toISOString()}`
    ).then(r => r.json()),
    enabled: !!selectedUserId,
  })
  const weeklyScore: WeeklyScoreData | null = weeklyScoreData && !(weeklyScoreData as any).error ? weeklyScoreData as WeeklyScoreData : null

  // Load plan form when scorecard changes
  // "This Week Score" auto-populates from previous week's "Next Week Plan" commitments
  const currentPlanForm = useMemo(() => {
    const sc = currentWeekScorecard
    if (sc) {
      return {
        planRedScore: sc.planRedScore || 0,
        planYellowScore: sc.planYellowScore || 0,
        planGreenScore: sc.planGreenScore || 0,
        nextRedScore: sc.nextRedScore || 0,
        nextYellowScore: sc.nextYellowScore || 0,
        nextGreenScore: sc.nextGreenScore || 0,
        commitments: sc.commitments || '',
        notes: sc.notes || '',
      }
    }
    // No scorecard for this week yet — auto-populate from previous week's Next Week Plan
    if (prevWeekScorecard) {
      return {
        planRedScore: prevWeekScorecard.nextRedScore || 0,
        planYellowScore: prevWeekScorecard.nextYellowScore || 0,
        planGreenScore: prevWeekScorecard.nextGreenScore || 0,
        nextRedScore: 0,
        nextYellowScore: 0,
        nextGreenScore: 0,
        commitments: prevWeekScorecard.commitments || '',
        notes: '',
      }
    }
    return { ...emptyPlanForm }
  }, [currentWeekScorecard, prevWeekScorecard])

  // Merge: if user hasn't edited planForm yet, use scorecard data
  const activePlanForm = useMemo(() => {
    // Always use currentPlanForm when scorecard exists (fresh load)
    // But once user edits, planForm takes precedence
    // We track this by checking if planForm was ever changed from empty
    return planForm
  }, [planForm])

  // Compute Past Week Score: auto-calculated from live performance data (READ-ONLY)
  const pastWeekScores = useMemo(() => {
    // If we have live weekly score data, use it
    if (weeklyScore && weeklyScore.totalTasks > 0) {
      return {
        red: weeklyScore.redScore || 0,
        yellow: weeklyScore.yellowScore || 0,
        green: weeklyScore.greenScore || 0,
      }
    }
    // Fallback to scorecard saved data
    if (currentWeekScorecard) {
      return {
        red: currentWeekScorecard.actualRedScore || 0,
        yellow: currentWeekScorecard.actualYellowScore || 0,
        green: currentWeekScorecard.actualGreenScore || 0,
      }
    }
    return { red: 0, yellow: 0, green: 0 }
  }, [weeklyScore, currentWeekScorecard])

  // Whether past week scores are showing LIVE (auto-calculated) values
  const isLiveScore = useMemo(() => {
    return !!weeklyScore && weeklyScore.totalTasks > 0
  }, [weeklyScore])

  // Auto-calculate PR from past week scores (read-only)
  const autoPR = useMemo(() => {
    if (weeklyScore && weeklyScore.totalTasks > 0) {
      return weeklyScore.prScore
    }
    return calculatePR(pastWeekScores.green, pastWeekScores.yellow, pastWeekScores.red)
  }, [weeklyScore, pastWeekScores])

  // Live score detail summary for info banner
  const liveScoreDetail = useMemo(() => {
    if (!weeklyScore || weeklyScore.totalTasks === 0) return null
    return {
      total: weeklyScore.totalTasks,
      green: weeklyScore.completedOnTime,
      yellow: weeklyScore.inProgressOnTrack + weeklyScore.completedLate,
      red: weeklyScore.overdue + weeklyScore.rejected,
    }
  }, [weeklyScore])

  // Reset form when user or week changes
  const handleUserChange = useCallback((userId: string) => {
    setSelectedUserId(userId)
    setPlanForm({ ...emptyPlanForm })
  }, [])

  const handleWeekChange = useCallback((newOffset: number) => {
    setWeekOffset(newOffset)
    setPlanForm({ ...emptyPlanForm })
  }, [])

  // Update plan form field
  const updatePlanField = (field: keyof PlanFormData, value: any) => {
    setPlanForm(prev => ({ ...prev, [field]: value }))
  }

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaving(true)
      const prScore = autoPR || calculatePR(pastWeekScores.green, pastWeekScores.yellow, pastWeekScores.red)
      // Use currentPlanForm for data that comes from scorecard, planForm for user edits
      const savePlanForm = { ...currentPlanForm, ...planForm }
      const res = await fetch('/api/monday-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          weekStartDate: weekInfo.monday.toISOString(),
          weekEndDate: weekInfo.sunday.toISOString(),
          weekNumber: weekInfo.weekNum,
          year: weekInfo.year,
          planRedScore: savePlanForm.planRedScore,
          planYellowScore: savePlanForm.planYellowScore,
          planGreenScore: savePlanForm.planGreenScore,
          actualRedScore: pastWeekScores.red,
          actualYellowScore: pastWeekScores.yellow,
          actualGreenScore: pastWeekScores.green,
          nextRedScore: savePlanForm.nextRedScore,
          nextYellowScore: savePlanForm.nextYellowScore,
          nextGreenScore: savePlanForm.nextGreenScore,
          prScore,
          commitments: savePlanForm.commitments,
          notes: savePlanForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monday-meeting', selectedUserId] })
      addToast('ok', `Scorecard saved for ${weekInfo.weekNum} - Week ${weekInfo.year}`)
      setSaving(false)
    },
    onError: (err: any) => {
      addToast('err', `Save failed: ${err.message}`)
      setSaving(false)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/monday-meeting?id=${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monday-meeting', selectedUserId] })
      addToast('info', 'Scorecard deleted')
    },
  })

  // Get past week scorecards for the selected user
  const pastWeeks = scorecards
    .filter((s: ScorecardData) => !(s.weekNumber === weekInfo.weekNum && s.year === weekInfo.year))
    .slice(0, 8)

  const selectedUser = doers.find((u: any) => u.id === selectedUserId)

  // Helper to get the effective plan form value (merges scorecard data with local edits)
  const getPlanValue = (field: keyof PlanFormData) => {
    // If user has made edits (planForm differs from initial), use planForm
    // Otherwise use currentPlanForm (from scorecard)
    return planForm[field] !== emptyPlanForm[field] || currentWeekScorecard
      ? (currentWeekScorecard && planForm[field] === emptyPlanForm[field] ? currentPlanForm[field] : planForm[field])
      : planForm[field]
  }

  // Simpler approach: merge currentPlanForm with user edits
  // If currentWeekScorecard exists and user hasn't changed field, use scorecard value
  // Otherwise use planForm value
  const mergedPlanForm = useMemo(() => {
    if (!currentWeekScorecard) return planForm
    // If planForm is still empty (user hasn't typed anything), use scorecard data
    const hasUserEdits = Object.keys(planForm).some(key => {
      const k = key as keyof PlanFormData
      return planForm[k] !== emptyPlanForm[k]
    })
    if (!hasUserEdits) return currentPlanForm
    // Merge: user edits override scorecard data
    return { ...currentPlanForm, ...planForm }
  }, [currentPlanForm, planForm, currentWeekScorecard])

  return (
    <div>
      {/* Live pulse animation style */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

      {/* Page Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>Monday Meeting</h2>
          <p>Weekly performance scorecard &amp; commitment tracker</p>
        </div>
        <div className="ph-right">
          <span className="badge b-gold">Week {weekInfo.weekNum}</span>
        </div>
      </div>
      <div className="page-accent" />

      {/* Top Controls: User Selection + Week Navigation */}
      <div className="lcard" style={{ marginBottom: 14 }}>
        <div className="cb" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Doer Name Selector */}
            <div style={{ flex: '1 1 260px', minWidth: 200 }}>
              <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t3)', marginBottom: 5, display: 'block' }}>
                Select Doer Name
              </label>
              <select
                className="fi"
                value={selectedUserId}
                onChange={e => handleUserChange(e.target.value)}
                style={{ fontWeight: 700, fontSize: 14 }}
              >
                <option value="">-- Select Team Member --</option>
                {doers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.phone ? `- ${u.phone.slice(-4)}` : ''} ({u.department || 'No Dept'})
                  </option>
                ))}
              </select>
            </div>

            {/* Week Navigation */}
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleWeekChange(weekOffset - 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                Prev
              </button>
              <div style={{ textAlign: 'center', minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t1)' }}>
                  Week {weekInfo.weekNum}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {formatDate(weekInfo.monday)} — {formatDate(weekInfo.sunday)}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => handleWeekChange(Math.min(weekOffset + 1, 0))}>
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              </button>
              {weekOffset !== 0 && (
                <button className="btn btn-xs btn-out" onClick={() => handleWeekChange(0)}>
                  Current Week
                </button>
              )}
            </div>

            {/* PR Score Badge */}
            {selectedUserId && (
              <div style={{
                flex: '0 0 auto',
                padding: '10px 18px',
                borderRadius: 'var(--r)',
                background: autoPR >= 70 ? 'var(--green-l)' : autoPR >= 40 ? 'var(--amber-l)' : autoPR > 0 ? 'var(--red-l)' : 'var(--bg2)',
                border: `1.5px solid ${autoPR >= 70 ? 'var(--green)' : autoPR >= 40 ? 'var(--amber)' : autoPR > 0 ? 'var(--red)' : 'var(--b2)'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)' }}>PR Score</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: autoPR >= 70 ? 'var(--green)' : autoPR >= 40 ? 'var(--amber)' : autoPR > 0 ? 'var(--red)' : 'var(--t3)', lineHeight: 1.1 }}>
                  {autoPR > 0 ? autoPR : '—'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedUserId ? (
        /* Empty State */
        <div className="lcard">
          <div className="cb" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>Select a Team Member</div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>Choose a doer name above to view or create their weekly scorecard</div>
          </div>
        </div>
      ) : (
        <>
          {/* Scorecard Grid — Matching the uploaded image */}
          <div className="lcard" style={{ marginBottom: 14 }}>
            <div className="ch">
              <div className="ct">
                <span style={{ fontSize: 16, marginRight: 6 }}>📝</span>
                Weekly Scorecard — {selectedUser?.name}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="badge b-gold">Week {weekInfo.weekNum}</span>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{formatDate(weekInfo.monday)} — {formatDate(weekInfo.sunday)}</span>
                {weeklyScoreLoading && (
                  <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ animation: 'livePulse 1s ease-in-out infinite' }}>⏳</span> Loading scores...
                  </span>
                )}
              </div>
            </div>
            <div className="cb" style={{ padding: '10px 14px 18px' }}>
              {/* Live Score Summary Banner */}
              {liveScoreDetail && (
                <div style={{
                  marginBottom: 12,
                  padding: '8px 14px',
                  background: isLiveScore ? 'linear-gradient(135deg, #F0FDF4, #ECFDF5)' : 'var(--bg)',
                  border: `1.5px solid ${isLiveScore ? '#86EFAC' : 'var(--b1)'}`,
                  borderRadius: 'var(--r-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LiveBadge isLive={isLiveScore} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                      Auto-calculated from {liveScoreDetail.total} task{liveScoreDetail.total !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 700 }}>
                    <span style={{ color: '#22C55E' }}>✓ On time: {liveScoreDetail.green}</span>
                    <span style={{ color: '#F59E0B' }}>◐ In progress/Late: {liveScoreDetail.yellow}</span>
                    <span style={{ color: '#EF4444' }}>✕ Overdue/Rejected: {liveScoreDetail.red}</span>
                  </div>
                </div>
              )}

              {/* Scorecard Table — Image-matching layout */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: 'var(--t3)',
                        borderBottom: '2px solid var(--b1)',
                        width: 160,
                      }}>
                        Category
                      </th>
                      <th style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: '#DC2626',
                        borderBottom: '2px solid #FEE2E2',
                        background: '#FEF2F2',
                        minWidth: 120,
                      }}>
                        🔴 Red Score
                      </th>
                      <th style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: '#D97706',
                        borderBottom: '2px solid #FEF3C7',
                        background: '#FFFBEB',
                        minWidth: 120,
                      }}>
                        🟡 Yellow Score
                      </th>
                      <th style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: '#15803D',
                        borderBottom: '2px solid #DCFCE7',
                        background: '#F0FDF4',
                        minWidth: 120,
                      }}>
                        🟢 Green Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* This Week Score Row — what employee committed in previous Monday meeting */}
                    <tr>
                      <td style={{
                        padding: '10px 14px',
                        fontWeight: 700,
                        borderBottom: '1px solid var(--b1)',
                        color: 'var(--t1)',
                      }}>
                        🎯 This Week Score
                        {prevWeekScorecard && !currentWeekScorecard && (
                          <span style={{
                            fontSize: 8,
                            fontWeight: 700,
                            color: '#2563EB',
                            background: '#EFF6FF',
                            padding: '1px 5px',
                            borderRadius: 3,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginLeft: 4,
                          }}>
                            From last week
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#FEF2F288' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.planRedScore}
                          onChange={e => updatePlanField('planRedScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #FCA5A5', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#DC2626',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#FFFBEB88' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.planYellowScore}
                          onChange={e => updatePlanField('planYellowScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #FCD34D', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#D97706',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#F0FDF488' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.planGreenScore}
                          onChange={e => updatePlanField('planGreenScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #86EFAC', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#15803D',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                    </tr>

                    {/* Past Week Score Row — READ-ONLY, auto-calculated from live data */}
                    <tr style={{
                      background: isLiveScore ? 'linear-gradient(90deg, rgba(34,197,94,0.04), transparent)' : undefined,
                    }}>
                      <td style={{
                        padding: '10px 14px',
                        fontWeight: 700,
                        borderBottom: '1px solid var(--b1)',
                        color: 'var(--t1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        ✅ Past Week Score
                        <LiveBadge isLive={isLiveScore} />
                        <span style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: '#6B7280',
                          background: '#F3F4F6',
                          padding: '1px 5px',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginLeft: 2,
                        }}>
                          Read-only
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#FEF2F288' }}>
                        <span style={{
                          display: 'inline-block', width: 80, textAlign: 'center', padding: '6px 8px',
                          border: isLiveScore ? '1.5px solid #22C55E' : '1.5px solid #FCA5A5',
                          borderRadius: 6, fontSize: 13, fontWeight: 700, color: '#DC2626',
                          background: isLiveScore ? '#F0FDF4' : '#FAFAFA',
                          fontFamily: "'DM Sans', sans-serif",
                          boxShadow: isLiveScore ? '0 0 0 2px rgba(34,197,94,0.15)' : 'none',
                        }}>
                          {pastWeekScores.red}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#FFFBEB88' }}>
                        <span style={{
                          display: 'inline-block', width: 80, textAlign: 'center', padding: '6px 8px',
                          border: isLiveScore ? '1.5px solid #22C55E' : '1.5px solid #FCD34D',
                          borderRadius: 6, fontSize: 13, fontWeight: 700, color: '#D97706',
                          background: isLiveScore ? '#F0FDF4' : '#FAFAFA',
                          fontFamily: "'DM Sans', sans-serif",
                          boxShadow: isLiveScore ? '0 0 0 2px rgba(34,197,94,0.15)' : 'none',
                        }}>
                          {pastWeekScores.yellow}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)', textAlign: 'center', background: '#F0FDF488' }}>
                        <span style={{
                          display: 'inline-block', width: 80, textAlign: 'center', padding: '6px 8px',
                          border: isLiveScore ? '1.5px solid #22C55E' : '1.5px solid #86EFAC',
                          borderRadius: 6, fontSize: 13, fontWeight: 700, color: '#15803D',
                          background: isLiveScore ? '#F0FDF4' : '#FAFAFA',
                          fontFamily: "'DM Sans', sans-serif",
                          boxShadow: isLiveScore ? '0 0 0 2px rgba(34,197,94,0.15)' : 'none',
                        }}>
                          {pastWeekScores.green}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                    </tr>

                    {/* Next Week Plan Row — editable, employee commits for next week */}
                    <tr>
                      <td style={{
                        padding: '10px 14px',
                        fontWeight: 700,
                        borderBottom: 'none',
                        color: 'var(--t1)',
                      }}>
                        🎯 Next Week Plan
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: 'none', textAlign: 'center', background: '#FEF2F288' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.nextRedScore}
                          onChange={e => updatePlanField('nextRedScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #FCA5A5', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#DC2626',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: 'none', textAlign: 'center', background: '#FFFBEB88' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.nextYellowScore}
                          onChange={e => updatePlanField('nextYellowScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #FCD34D', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#D97706',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                      <td style={{ padding: '8px 14px', borderBottom: 'none', textAlign: 'center', background: '#F0FDF488' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={mergedPlanForm.nextGreenScore}
                          onChange={e => updatePlanField('nextGreenScore', Number(e.target.value))}
                          style={{
                            width: 80, textAlign: 'center', padding: '6px 8px',
                            border: '1.5px solid #86EFAC', borderRadius: 6,
                            fontSize: 13, fontWeight: 700, color: '#15803D',
                            background: '#FFF', fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>%</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Visual Score Bar */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t3)' }}>
                    Actual Performance Distribution
                  </span>
                  {isLiveScore && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', animation: 'livePulse 2s ease-in-out infinite' }} />
                      Live from task data
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: 'var(--b1)' }}>
                  {(() => {
                    const total = pastWeekScores.red + pastWeekScores.yellow + pastWeekScores.green
                    if (total === 0) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--t4)' }}>
                      {weeklyScoreLoading ? 'Loading live scores...' : 'No task data for this week'}
                    </div>
                    const rPct = (pastWeekScores.red / total) * 100
                    const yPct = (pastWeekScores.yellow / total) * 100
                    const gPct = (pastWeekScores.green / total) * 100
                    return (
                      <>
                        {rPct > 0 && <div style={{ width: `${rPct}%`, background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{rPct >= 10 ? `${rPct.toFixed(1)}%` : ''}</div>}
                        {yPct > 0 && <div style={{ width: `${yPct}%`, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{yPct >= 10 ? `${yPct.toFixed(1)}%` : ''}</div>}
                        {gPct > 0 && <div style={{ width: `${gPct}%`, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{gPct >= 10 ? `${gPct.toFixed(1)}%` : ''}</div>}
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Next Week Plan — Monday Meeting Commitments */}
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t3)', marginBottom: 6, display: 'block' }}>
                  🤝 Next Week Plan — Monday Meeting Commitments
                </label>
                <textarea
                  className="fi"
                  value={mergedPlanForm.commitments}
                  onChange={e => updatePlanField('commitments', e.target.value)}
                  placeholder="Enter commitments for next week..."
                  rows={3}
                  style={{ resize: 'vertical', minHeight: 70 }}
                />
              </div>

              {/* Notes */}
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t3)', marginBottom: 6, display: 'block' }}>
                  📝 Notes / Remarks
                </label>
                <textarea
                  className="fi"
                  value={mergedPlanForm.notes}
                  onChange={e => updatePlanField('notes', e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 50 }}
                />
              </div>

              {/* Save Button + Warning */}
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  className="btn btn-gold"
                  style={{ padding: '12px 48px', fontSize: 14, fontWeight: 800 }}
                  onClick={() => saveMutation.mutate()}
                  disabled={saving || !selectedUserId}
                >
                  {saving ? '⏳ Saving...' : '💾 Save Scorecard'}
                </button>
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ⚠ Don&apos;t press the save button twice
                </div>
              </div>
            </div>
          </div>

          {/* Past Week Performance History */}
          <div className="g2">
            <div className="lcard">
              <div className="ch">
                <div className="ct">📊 Past Week Performance</div>
                <span className="badge b-blue">{pastWeeks.length} weeks</span>
              </div>
              <div className="cb">
                {pastWeeks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--t3)', fontSize: 12 }}>
                    No past scorecard data for {selectedUser?.name}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pastWeeks.map((sc: ScorecardData) => {
                      const total = sc.actualRedScore + sc.actualYellowScore + sc.actualGreenScore
                      const rPct = total > 0 ? (sc.actualRedScore / total) * 100 : 0
                      const yPct = total > 0 ? (sc.actualYellowScore / total) * 100 : 0
                      const gPct = total > 0 ? (sc.actualGreenScore / total) * 100 : 0
                      return (
                        <div key={sc.id} style={{
                          padding: '10px 14px',
                          background: 'var(--bg)',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--b1)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Week {sc.weekNumber}</span>
                              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 8 }}>
                                {formatDate(new Date(sc.weekStartDate))} — {formatDate(new Date(sc.weekEndDate))}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span style={{
                                fontSize: 12, fontWeight: 800,
                                color: sc.prScore >= 70 ? 'var(--green)' : sc.prScore >= 40 ? 'var(--amber)' : 'var(--red)',
                              }}>
                                PR: {sc.prScore || '—'}
                              </span>
                              <button
                                className="btn btn-xs btn-ghost"
                                onClick={() => deleteMutation.mutate(sc.id)}
                                style={{ padding: '2px 6px', fontSize: 10, color: 'var(--red)' }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          {/* Mini bar */}
                          {total > 0 && (
                            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }}>
                              {rPct > 0 && <div style={{ width: `${rPct}%`, background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>{rPct >= 15 ? `${rPct.toFixed(0)}%` : ''}</div>}
                              {yPct > 0 && <div style={{ width: `${yPct}%`, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>{yPct >= 15 ? `${yPct.toFixed(0)}%` : ''}</div>}
                              {gPct > 0 && <div style={{ width: `${gPct}%`, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>{gPct >= 15 ? `${gPct.toFixed(0)}%` : ''}</div>}
                            </div>
                          )}
                          {/* Score details */}
                          <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 10, color: 'var(--t3)' }}>
                            <span style={{ color: '#EF4444', fontWeight: 700 }}>🔴 {sc.actualRedScore}%</span>
                            <span style={{ color: '#F59E0B', fontWeight: 700 }}>🟡 {sc.actualYellowScore}%</span>
                            <span style={{ color: '#22C55E', fontWeight: 700 }}>🟢 {sc.actualGreenScore}%</span>
                          </div>
                          {/* Commitments preview */}
                          {sc.commitments && (
                            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--t2)', fontStyle: 'italic' }}>
                              🎯 {sc.commitments.length > 80 ? sc.commitments.slice(0, 80) + '...' : sc.commitments}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* All Team Members Quick View */}
            <div className="lcard">
              <div className="ch">
                <div className="ct">👥 Team Overview</div>
                <span className="badge b-gold">{doers.length} members</span>
              </div>
              <div className="cb" style={{ padding: 0 }}>
                <table className="ltable">
                  <thead>
                    <tr>
                      <th>Doer Name</th>
                      <th>Department</th>
                      <th>PR</th>
                      <th>Weeks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doers.map((u: any) => {
                      const userScorecards = scorecards.filter((s: ScorecardData) => s.userId === u.id)
                      const latestSC = userScorecards.length > 0 ? userScorecards[0] : null
                      const isSelected = u.id === selectedUserId
                      return (
                        <tr
                          key={u.id}
                          onClick={() => handleUserChange(u.id)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(59,130,246,.06)' : undefined,
                          }}
                        >
                          <td style={{ fontWeight: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: isSelected ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'linear-gradient(135deg,var(--g1),var(--g3))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800, color: '#fff',
                              }}>
                                {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div>
                                <div style={{ fontSize: 12.5 }}>{u.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{u.phone || ''}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge b-gray" style={{ fontSize: 9 }}>{u.department || '—'}</span>
                          </td>
                          <td style={{ fontWeight: 800, color: latestSC ? (latestSC.prScore >= 70 ? 'var(--green)' : latestSC.prScore >= 40 ? 'var(--amber)' : 'var(--red)') : 'var(--t4)' }}>
                            {latestSC ? latestSC.prScore : '—'}
                          </td>
                          <td style={{ color: 'var(--t3)', fontSize: 11 }}>
                            {userScorecards.length > 0 ? `${userScorecards.length} saved` : 'No data'}
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
      )}
    </div>
  )
}
