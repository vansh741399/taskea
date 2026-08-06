'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'

// ════════════════════════════════════════════════════════════════════════
// v25·0806 — HR Report View (redesigned per user's uploaded format)
// ════════════════════════════════════════════════════════════════════════
// Columns (exact match to uploaded image):
//   S.No | Name | Designation | Full Day | Half Days | Uninformed |
//   Late/Early | Total Presents | Overall Score | Status
// Marking: Total Presents × 2 (HR Score) - Deductions = Overall Score
// Red highlight if score < 7
// ════════════════════════════════════════════════════════════════════════

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

const LOCATIONS = [
  { value: 'all', label: 'All Locations' },
  { value: 'Ajmer', label: 'Ajmer' },
  { value: 'Jaipur', label: 'Jaipur' },
  { value: 'Gurugram', label: 'Gurugram' },
]

export function LaxreeHrReport() {
  const { addToast } = useWorkflowStore()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [location, setLocation] = useState('all')
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr-report-v2', month, year, location],
    queryFn: () => {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        location,
        format: 'json',
      })
      return fetch(`/api/hr-report?${params.toString()}`).then(r => r.json())
    },
  })

  const downloadExcel = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        location,
        format: 'xlsx',
      })
      const res = await fetch(`/api/hr-report?${params.toString()}`)
      if (!res.ok) throw new Error('Download failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `HR_Report_${year}_${String(month).padStart(2, '0')}_${location}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      addToast('ok', 'Excel downloaded successfully')
    } catch (e: any) {
      addToast('err', e.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const summary = data?.summary
  const employees = data?.employees || []
  const scoringConfig = data?.scoringConfig || {}
  const dataStatus = data?.dataStatus || 'ok'
  const punchCount = data?.punchCount ?? 0
  const hrmsLeavesMergedCount = data?.hrmsLeavesMergedCount ?? 0

  return (
    <>
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>📊 HR Report</h2>
          <p>Monthly attendance scoring · marking scheme · Excel export</p>
        </div>
        <div className="ph-right">
          <button
            className="btn btn-gold"
            onClick={downloadExcel}
            disabled={downloading || isLoading}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: 800 }}
          >
            {downloading ? '⏳ Generating...' : '📥 Download Excel'}
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Filters Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: '1px solid #3a3a3a',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📅 Month
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            style={selectStyle}
          >
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📆 Year
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={selectStyle}
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📍 Location
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={selectStyle}
          >
            {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <button
          onClick={() => refetch()}
          style={{
            padding: '9px 16px', fontSize: 12, fontWeight: 700,
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer',
          }}
        >
          🔄 Refresh
        </button>

        <div style={{ marginLeft: 'auto', color: '#9CA3AF', fontSize: 11, alignSelf: 'center' }}>
          {MONTHS.find(m => m.value === month)?.label} {year} · {location === 'all' ? 'All Locations' : location}
        </div>
      </div>

      {/* v25·0806-fix: data status banner — explains why reports for months
          before Aug 2026 show all zeros (ERP punch feature launched 1 Aug 2026) */}
      {dataStatus === 'hrms-db-attendance' && (
        <div style={{
          background: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
          borderRadius: 10, padding: 14, marginBottom: 16,
          border: '2px solid #10B981',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 22 }}>✓</div>
          <div style={{ fontSize: 12, color: '#065F46', lineHeight: 1.6, flex: 1 }}>
            <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 13 }}>
              Showing HRMS attendance for {MONTHS.find(m => m.value === month)?.label} {year}
            </div>
            <div>
              The ERP punch-in feature launched on 1 Aug 2026, so earlier months have no ERP punch data.
              For {MONTHS.find(m => m.value === month)?.label} {year}, attendance is being read directly
              from the HRMS database (read-only). All check-in/out times, late/early-out flags, and
              overtime hours come from HRMS.
            </div>
          </div>
        </div>
      )}

      {(dataStatus === 'no-erp-punches' || dataStatus === 'no-erp-punches-leaves-only') && (
        <div style={{
          background: dataStatus === 'no-erp-punches-leaves-only'
            ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
            : 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
          borderRadius: 10, padding: 14, marginBottom: 16,
          border: `2px solid ${dataStatus === 'no-erp-punches-leaves-only' ? '#F59E0B' : '#EF4444'}`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 22 }}>
            {dataStatus === 'no-erp-punches-leaves-only' ? 'ℹ️' : '⚠️'}
          </div>
          <div style={{ fontSize: 12, color: '#1f2937', lineHeight: 1.6, flex: 1 }}>
            <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 13 }}>
              No ERP punch records for {MONTHS.find(m => m.value === month)?.label} {year}
            </div>
            {dataStatus === 'no-erp-punches-leaves-only' ? (
              <div>
                No ERP punch records exist for {MONTHS.find(m => m.value === month)?.label} {year}.
                This report has merged <strong>{hrmsLeavesMergedCount}</strong> approved leave record(s)
                from HRMS, but punch counts will be 0 for everyone.
                {month >= 8 && year >= 2026 && (
                  <> Most likely cause: employees' accounts had <strong>no office assigned</strong>,
                  so all punch attempts failed. The system now auto-resolves offices from HRMS
                  location — ask employees to punch in again.</>
                )}
              </div>
            ) : (
              <div>
                No ERP punch records exist for {MONTHS.find(m => m.value === month)?.label} {year}.
                {month >= 8 && year >= 2026 ? (
                  <> Most likely cause: employees' accounts had <strong>no office assigned</strong>,
                  which caused every punch attempt to fail with "No office assigned". The system now
                  auto-resolves offices from HRMS location — ask employees to punch in again from
                  the dashboard, and attendance will appear within ~30 seconds.</>
                ) : (
                  <> The ERP punch-in feature was launched on 1 Aug 2026, so earlier months have no
                  punch data. Switch to Aug 2026 or later to see punch data.</>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}>
          <SummaryCard label="Employees" value={summary.totalEmployees} icon="👥" color="#6D28D9" />
          <SummaryCard label="Total Presents" value={summary.totalPresents} icon="✅" color="#10B981" />
          <SummaryCard label="Avg Score" value={summary.avgScore} icon="🎯" color="#F59E0B" />
          <SummaryCard label="Low Score (<7)" value={summary.lowScoreCount} icon="🔴" color="#EF4444" />
          <SummaryCard label="Full Day Leaves" value={summary.totalFullDayLeaves} icon="🏖️" color="#0EA5E9" />
          <SummaryCard label="Half Days" value={summary.totalHalfDayLeaves} icon="🌗" color="#8B5CF6" />
          <SummaryCard label="Uninformed" value={summary.totalUninformedLeaves} icon="⚠️" color="#F97316" />
          <SummaryCard label="Late/Early" value={summary.totalLateEarly} icon="⏰" color="#06B6D4" />
        </div>
      )}

      {/* Main Report Table — per uploaded image format */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '2px solid #1a1a1a',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        marginBottom: 16,
      }}>
        {/* Table Header — two-tier like uploaded image */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            {/* Tier 1: Group headers */}
            <tr style={{ background: '#1a1a1a' }}>
              <th colSpan={3} style={headerGroupStyle}>
                📍 Location
              </th>
              <th colSpan={5} style={headerGroupStyle}>
                📋 Informed Leaves
              </th>
              <th colSpan={3} style={{ ...headerGroupStyle, background: '#6D28D9' }}>
                🎯 Scoring
              </th>
            </tr>
            {/* Tier 2: Column headers */}
            <tr style={{ background: '#2d2d2d' }}>
              <th style={headerCellStyle}>S.No</th>
              <th style={headerCellStyle}>Name of Employee</th>
              <th style={headerCellStyle}>Designation</th>
              <th style={headerCellStyle}>Full Day</th>
              <th style={headerCellStyle}>Half Days</th>
              <th style={headerCellStyle}>Uninformed Leaves</th>
              <th style={headerCellStyle}>Late Comings /<br/>Early Goings</th>
              <th style={headerCellStyle}>Overall Score</th>
              <th style={headerCellStyle}>Total Presents</th>
              <th style={headerCellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                  Loading report...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
                  No employees found for selected filters
                </td>
              </tr>
            ) : (
              employees.map((emp: any, i: number) => {
                const isLow = emp.isLowScore
                const isAltRow = i % 2 === 1

                return (
                  <tr
                    key={emp.id}
                    style={{
                      background: isLow
                        ? 'rgba(239,68,68,0.08)'
                        : isAltRow ? '#f9fafb' : '#fff',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td style={cellStyle(isLow)}>{emp.sno}</td>
                    <td style={{ ...cellStyle(isLow), fontWeight: 700 }}>
                      {emp.name}
                      <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 400 }}>
                        {emp.department} · {emp.location}
                      </div>
                    </td>
                    <td style={cellStyle(isLow)}>{emp.designation || '-'}</td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center' }}>
                      <CountBadge value={emp.fullDayLeaves} color="#0EA5E9" />
                    </td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center' }}>
                      <CountBadge value={emp.halfDayLeaves} color="#8B5CF6" />
                    </td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center' }}>
                      <CountBadge value={emp.uninformedLeaves} color="#F97316" warn={emp.uninformedLeaves > 1} />
                    </td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center' }}>
                      <CountBadge value={emp.lateComingsEarlyGoings} color="#06B6D4" warn={emp.lateComingsEarlyGoings > 1} />
                    </td>
                    <td style={{
                      ...cellStyle(isLow),
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                      color: isLow ? '#DC2626' : emp.overallScore >= 40 ? '#059669' : '#D97706',
                      background: isLow ? 'rgba(239,68,68,0.15)' : 'transparent',
                    }}>
                      {emp.overallScore}
                      {emp.deductions > 0 && (
                        <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 400 }}>
                          (base {emp.baseScore} -{emp.deductions})
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center', fontWeight: 700, color: '#10B981' }}>
                      {emp.totalPresents}
                    </td>
                    <td style={{ ...cellStyle(isLow), textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 700,
                        background: isLow ? '#EF4444' : emp.overallScore >= 40 ? '#10B981' : '#F59E0B',
                        color: '#fff',
                      }}>
                        {isLow ? '🔴 LOW' : emp.overallScore >= 40 ? '✓ GOOD' : '⚠ AVG'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Scoring Rules Panel — per uploaded image */}
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: '2px solid #F59E0B',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          📐 Marking Scheme & Deduction Rules
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#92400E', marginBottom: 8 }}>
              ✅ Score Calculation
            </div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
              <div><strong>HR Score Multiplier:</strong> {scoringConfig.hrScoreMultiplier || 2}</div>
              <div><strong>Base Score</strong> = Total Presents × {scoringConfig.hrScoreMultiplier || 2}</div>
              <div><strong>Overall Score</strong> = Base Score − Deductions</div>
              <div style={{ marginTop: 6, fontSize: 10, color: '#DC2626' }}>
                🔴 Score &lt; 7 → marked RED
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#92400E', marginBottom: 8 }}>
              ➖ −1 Deductions
            </div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.7 }}>
              <div>• Leaves &gt; 2 in a month</div>
              <div>• Late comings/Early goings &gt; 1</div>
              <div>• Uninformed leaves &gt; 1</div>
              <div>• Half Days &gt; 2 in a month</div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#92400E', marginBottom: 8 }}>
              ⚠️ −2 Deductions (severe)
            </div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.7 }}>
              <div>• Leaves exceed 5 days</div>
              <div>• Late comings exceed 4 in a month</div>
              <div>• Uninformed leaves &gt; 3</div>
              <div>• Half Days &gt; 4 in a month</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: '#92400E', textAlign: 'center' }}>
          📊 Shift: {scoringConfig.shiftStart || '10:00 AM'} – {scoringConfig.shiftEnd || '7:00 PM'} ·
          Grace: {scoringConfig.lateGracePeriod || '15 min'} ·
          Sundays excluded from uninformed count
        </div>
      </div>

      <div style={{
        padding: 12,
        background: '#f3f4f6',
        borderRadius: 8,
        fontSize: 11,
        color: '#6B7280',
        textAlign: 'center',
      }}>
        📥 Excel export includes 4 sheets: HR Report (main), Scoring Rules, Location Summary, Report Info ·
        Marking scheme auto-applied per the uploaded format
      </div>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #4a4a4a',
  background: '#1a1a1a',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  minWidth: 130,
}

const headerGroupStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 800,
  color: '#fff',
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderRight: '1px solid #4a4a4a',
}

const headerCellStyle: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 700,
  color: '#fff',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderRight: '1px solid #4a4a4a',
  whiteSpace: 'nowrap',
}

function cellStyle(isLow: boolean): React.CSSProperties {
  return {
    padding: '8px 10px',
    fontSize: 12,
    color: isLow ? '#7F1D1D' : '#1f2937',
    borderRight: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  }
}

function CountBadge({ value, color, warn }: { value: number; color: string; warn?: boolean }) {
  if (value === 0) {
    return <span style={{ color: '#D1D5DB', fontSize: 14 }}>—</span>
  }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 28,
      height: 24,
      padding: '0 8px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      background: warn ? `${color}25` : `${color}15`,
      color: warn ? '#DC2626' : color,
      border: `1px solid ${warn ? '#DC2626' : color}40`,
    }}>
      {value}
    </span>
  )
}

function SummaryCard({ label, value, icon, color }: { label: string; value: any; icon: string; color: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      padding: 12,
      border: '1px solid #e5e7eb',
      borderLeft: `3px solid ${color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1f2937' }}>
        {value}
      </div>
    </div>
  )
}
