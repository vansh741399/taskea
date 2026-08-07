'use client'

import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'

// ════════════════════════════════════════════════════════════════════════
// v25·0801 — Health Score Widget for Director/EA Dashboards
// ════════════════════════════════════════════════════════════════════════
// Displays the user's own weekly PR score (health score) on Director/EA dashboards.
// Previously only EMPLOYEE/MANAGER could see their score.
// Now Director and EA can also see their own performance health.
// ════════════════════════════════════════════════════════════════════════

export function LaxreeHealthScoreWidget() {
  const { currentUserId, currentUserName, currentRole } = useWorkflowStore()

  // Get current week range (Monday to Sunday)
  const getWeekInfo = () => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
    return { monday, sunday }
  }

  const weekInfo = getWeekInfo()

  const { data: scoreData, isLoading } = useQuery({
    queryKey: ['director-health-score', currentUserId],
    queryFn: () => fetch(
      `/api/weekly-score?userId=${currentUserId}&weekStart=${weekInfo.monday.toISOString()}&weekEnd=${weekInfo.sunday.toISOString()}`
    ).then(r => r.json()),
    enabled: !!currentUserId,
    refetchInterval: 60000, // Refresh every minute
  })

  if (isLoading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: '1px solid var(--b1)',
        color: 'var(--t3)',
        fontSize: 12,
      }}>
        Loading health score...
      </div>
    )
  }

  const score = scoreData as any
  const prScore = score?.prScore ?? 0
  const totalTasks = score?.totalTasks ?? 0
  const completedOnTime = score?.completedOnTime ?? 0
  const completedLate = score?.completedLate ?? 0
  const overdue = score?.overdue ?? 0
  const greenCount = score?.greenCount ?? 0
  const yellowCount = score?.yellowCount ?? 0
  const redCount = score?.redCount ?? 0

  // Score color
  const scoreColor = prScore >= 70 ? '#10B981' : prScore >= 40 ? '#F59E0B' : '#EF4444'
  const scoreLabel = prScore >= 70 ? 'Excellent' : prScore >= 40 ? 'Needs Focus' : 'Critical'
  const scoreEmoji = prScore >= 70 ? '🟢' : prScore >= 40 ? '🟡' : '🔴'

  // Circle progress
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (prScore / 100) * circumference

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      border: `1.5px solid ${scoreColor}40`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
        flexWrap: 'wrap',
        gap: 6,
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>
            🎯 My Health Score
          </div>
          <div style={{ color: '#9CA3AF', fontSize: 11 }}>
            Weekly PR Score · {currentRole} · {currentUserName}
          </div>
        </div>
        <div style={{
          padding: '4px 10px',
          background: `${scoreColor}20`,
          border: `1px solid ${scoreColor}60`,
          borderRadius: 20,
          color: scoreColor,
          fontSize: 11,
          fontWeight: 700,
        }}>
          {scoreEmoji} {scoreLabel}
        </div>
      </div>

      {/* Main content - score ring + breakdown */}
      <div style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Score ring */}
        <div style={{
          position: 'relative',
          width: 90,
          height: 90,
          flexShrink: 0,
        }}>
          <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="45" cy="45" r="36"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="45" cy="45" r="36"
              stroke={scoreColor}
              strokeWidth="6"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
            }}>
              {Math.round(prScore)}
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 9, marginTop: 2 }}>
              / 100
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          flex: 1,
          minWidth: 200,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: 8,
        }}>
          <StatTile label="Total Tasks" value={totalTasks} color="#fff" />
          <StatTile label="On Time" value={completedOnTime} color="#10B981" />
          <StatTile label="Late" value={completedLate} color="#F59E0B" />
          <StatTile label="Overdue" value={overdue} color="#EF4444" />
        </div>
      </div>

      {/* R/Y/G breakdown */}
      <div style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 11,
      }}>
        <span style={{ color: '#10B981' }}>🟢 Green: <strong>{greenCount}</strong></span>
        <span style={{ color: '#F59E0B' }}>🟡 Yellow: <strong>{yellowCount}</strong></span>
        <span style={{ color: '#EF4444' }}>🔴 Red: <strong>{redCount}</strong></span>
        <span style={{ color: '#9CA3AF', marginLeft: 'auto' }}>
          Week: {weekInfo.monday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {weekInfo.sunday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </span>
      </div>
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 8,
      padding: '8px 10px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ color: '#9CA3AF', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 18, fontWeight: 700, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
