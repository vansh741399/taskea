'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'

// ════════════════════════════════════════════════════════════════════════
// v25·0806 — Employee Personal HR Report
// ════════════════════════════════════════════════════════════════════════
// Shows ONLY the logged-in employee's own HR data:
//   - Attendance stats (presents, leaves, late/early, uninformed)
//   - Overall score with deduction breakdown
//   - HRMS master data (salary, joining date, bank, etc.)
//   - Detailed late/early punch list
//   - Detailed uninformed dates list
//
// Calls /api/hr-report?self=1&userId=xxx — server enforces self-filter.
// Excel download opens cleanly in MS Excel / WPS Office / LibreOffice.
// ════════════════════════════════════════════════════════════════════════

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

export function LaxreeEmpHrReport() {
  const { addToast, currentUserId, currentUserName } = useWorkflowStore()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emp-hr-report', currentUserId, month, year],
    queryFn: () => {
      const params = new URLSearchParams({
        self: '1',
        userId: currentUserId,
        month: String(month),
        year: String(year),
        format: 'json',
      })
      return fetch(`/api/hr-report?${params.toString()}`).then(r => r.json())
    },
    enabled: !!currentUserId,
  })

  const downloadExcel = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        self: '1',
        userId: currentUserId,
        month: String(month),
        year: String(year),
        format: 'xlsx',
      })
      const res = await fetch(`/api/hr-report?${params.toString()}`)
      if (!res.ok) throw new Error('Download failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `My_HR_Report_${year}_${String(month).padStart(2, '0')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      addToast('ok', 'Excel downloaded — opens in WPS Office / Excel')
    } catch (e: any) {
      addToast('err', e.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const emp = data?.employee
  const scoringConfig = data?.scoringConfig || {}
  const hrms = emp?.hrms || null

  // Loading state
  if (isLoading) {
    return (
      <>
        <div className="ph">
          <div className="ph-left">
            <h2>📊 My HR Report</h2>
            <p>Loading your personal HR data…</p>
          </div>
        </div>
        <div className="page-accent" />
        <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          Fetching your attendance, leaves, and HRMS master data…
        </div>
      </>
    )
  }

  // Error / no data
  if (!emp) {
    return (
      <>
        <div className="ph">
          <div className="ph-left">
            <h2>📊 My HR Report</h2>
            <p>Unable to load your HR data</p>
          </div>
        </div>
        <div className="page-accent" />
        <div style={{ padding: 60, textAlign: 'center', color: '#DC2626' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          Could not load your HR report. Please try refreshing.
        </div>
      </>
    )
  }

  const isLow = emp.isLowScore
  const scoreColor = isLow ? '#DC2626' : emp.overallScore >= 40 ? '#059669' : '#D97706'

  return (
    <>
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <h2>📊 My HR Report</h2>
          <p>Personal attendance & HR summary · HRMS-synced · {currentUserName}</p>
        </div>
        <div className="ph-right">
          <button
            className="btn btn-gold"
            onClick={downloadExcel}
            disabled={downloading}
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
        borderRadius: 12, padding: 16, marginBottom: 16,
        border: '1px solid #3a3a3a', display: 'flex', gap: 12,
        flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div>
          <label style={filterLabelStyle}>📅 Month</label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={selectStyle}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabelStyle}>📆 Year</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={selectStyle}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button
          onClick={() => refetch()}
          style={{ padding: '9px 16px', fontSize: 12, fontWeight: 700,
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer' }}
        >
          🔄 Refresh
        </button>
        <div style={{ marginLeft: 'auto', color: '#9CA3AF', fontSize: 11, alignSelf: 'center' }}>
          {MONTHS.find(m => m.value === month)?.label} {year}
          {data?.hrmsSyncedAt && (
            <span style={{ marginLeft: 8, color: '#10B981' }}>· HRMS synced ✓</span>
          )}
        </div>
      </div>

      {/* Personal Identity Card */}
      <div style={{
        background: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)',
        borderRadius: 14, padding: 20, marginBottom: 16, color: '#fff',
        boxShadow: '0 4px 20px rgba(109,40,217,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, marginBottom: 6 }}>
              👤 Employee
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{emp.name}</div>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
              {emp.designation || '—'}
              <br />
              <span style={{ opacity: 0.7 }}>{emp.department || '—'}</span>
              <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
              <span style={{ opacity: 0.7 }}>{emp.location || '—'}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, marginBottom: 6 }}>
              🎯 Overall Score
            </div>
            <div style={{
              fontSize: 48, fontWeight: 900, lineHeight: 1,
              color: isLow ? '#FCA5A5' : emp.overallScore >= 40 ? '#86EFAC' : '#FDE68A',
            }}>
              {emp.overallScore}
            </div>
            <div style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 12,
              fontSize: 11, fontWeight: 800, marginTop: 8,
              background: isLow ? 'rgba(239,68,68,0.3)' : emp.overallScore >= 40 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
              border: `1px solid ${isLow ? '#FCA5A5' : emp.overallScore >= 40 ? '#86EFAC' : '#FDE68A'}`,
            }}>
              {isLow ? '🔴 LOW' : emp.overallScore >= 40 ? '✓ GOOD' : '⚠ AVERAGE'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 11, opacity: 0.85 }}>
          {hrms?.hrmsEmployeeId && <span style={{ marginRight: 16 }}>🆔 {hrms.hrmsEmployeeId}</span>}
          {hrms?.firm && <span style={{ marginRight: 16 }}>🏢 {hrms.firm}</span>}
          {hrms?.employmentType && <span style={{ marginRight: 16 }}>📋 {hrms.employmentType}</span>}
          {hrms?.joiningDate && <span>📅 Joined {new Date(hrms.joiningDate).toLocaleDateString('en-IN')}</span>}
        </div>
      </div>

      {/* Attendance Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <StatCard label="Total Presents" value={emp.totalPresents} icon="✅" color="#10B981" />
        <StatCard label="Full Day Leaves" value={emp.fullDayLeaves} icon="🏖️" color="#0EA5E9" />
        <StatCard label="Half Days" value={emp.halfDayLeaves} icon="🌗" color="#8B5CF6" warn={emp.halfDayLeaves > 2} />
        <StatCard label="Uninformed" value={emp.uninformedLeaves} icon="⚠️" color="#F97316" warn={emp.uninformedLeaves > 1} />
        <StatCard label="Late Comings" value={emp.lateComings} icon="🕘" color="#EF4444" warn={emp.lateComings > 1} />
        <StatCard label="Early Goings" value={emp.earlyGoings} icon="🏃" color="#06B6D4" warn={emp.earlyGoings > 1} />
      </div>

      {/* Score Breakdown */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
        border: `2px solid ${isLow ? '#EF4444' : '#10B981'}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2937', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          🧮 Score Breakdown
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <ScoreRow label="Total Presents" value={`${emp.totalPresents} days`} color="#10B981" />
          <ScoreRow label="HR Score Multiplier" value={`× ${emp.hrScore}`} color="#6D28D9" />
          <ScoreRow label="Base Score" value={`= ${emp.baseScore}`} color="#0EA5E9" />
          <ScoreRow label="Deductions" value={`− ${emp.deductions}`} color={emp.deductions > 0 ? '#EF4444' : '#9CA3AF'} />
          <ScoreRow label="Overall Score" value={`= ${emp.overallScore}`} color={scoreColor} bold />
        </div>
        {emp.deductionDetails.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>⚠️ Deductions Applied:</div>
            <div style={{ fontSize: 11, color: '#7F1D1D' }}>
              {emp.deductionDetails.join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* Late / Early Details */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
        border: '1px solid #e5e7eb',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2937', marginBottom: 12 }}>
          🕒 Late Comings & Early Goings
        </div>
        {(emp.latePunchDetails?.length || 0) + (emp.earlyPunchDetails?.length || 0) === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#10B981', fontSize: 13, fontWeight: 600 }}>
            ✓ No late comings or early goings this month — perfect attendance!
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {(emp.latePunchDetails || []).map((d: any, i: number) => (
                <tr key={`late-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>{d.date}</td>
                  <td style={{ ...tdStyle, color: '#DC2626', fontWeight: 700 }}>LATE COMING</td>
                  <td style={tdStyle}>{d.punchIn}</td>
                  <td style={{ ...tdStyle, color: '#DC2626', fontWeight: 700 }}>+{d.minutesLate} min</td>
                </tr>
              ))}
              {(emp.earlyPunchDetails || []).map((d: any, i: number) => (
                <tr key={`early-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>{d.date}</td>
                  <td style={{ ...tdStyle, color: '#06B6D4', fontWeight: 700 }}>EARLY GOING</td>
                  <td style={tdStyle}>{d.punchOut}</td>
                  <td style={{ ...tdStyle, color: '#06B6D4', fontWeight: 700 }}>−{d.minutesEarly} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Uninformed Dates */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
        border: '1px solid #e5e7eb',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2937', marginBottom: 12 }}>
          ⚠️ Uninformed Leave Dates
        </div>
        {emp.uninformedDates?.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#10B981', fontSize: 13, fontWeight: 600 }}>
            ✓ No uninformed leaves this month
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(emp.uninformedDates || []).map((d: string, i: number) => (
              <span key={i} style={{
                padding: '6px 12px', background: '#FEF3C7', color: '#92400E',
                borderRadius: 8, fontSize: 11, fontWeight: 600, border: '1px solid #FCD34D',
              }}>
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* HRMS Master Data — Salary & Bank */}
      {hrms && (
        <div style={{
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          borderRadius: 12, padding: 16, marginBottom: 16,
          border: '2px solid #0EA5E9',
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0C4A6E', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            💰 HRMS Master Data — Salary & Bank Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <HrmsRow label="Salary Type" value={hrms.salaryType} />
            <HrmsRow label="Monthly Salary" value={hrms.monthlySalary ? `₹ ${hrms.monthlySalary.toLocaleString('en-IN')}` : null} />
            <HrmsRow label="Daily Rate" value={hrms.dailyRate ? `₹ ${hrms.dailyRate.toLocaleString('en-IN')}` : null} />
            <HrmsRow label="Hourly Rate" value={hrms.hourlyRate ? `₹ ${hrms.hourlyRate.toFixed(2)}` : null} />
            <HrmsRow label="Overtime Rate" value={hrms.overtimeRate ? `₹ ${hrms.overtimeRate.toFixed(2)}/hr` : null} />
            <HrmsRow label="Shift" value={hrms.shiftStart && hrms.shiftEnd ? `${hrms.shiftStart} – ${hrms.shiftEnd} (${hrms.shiftHours}h)` : null} />
            <HrmsRow label="Bank Name" value={hrms.bankName} />
            <HrmsRow label="Bank Account" value={hrms.bankAccount} />
            <HrmsRow label="IFSC" value={hrms.bankIfsc} />
            <HrmsRow label="PAN" value={hrms.panNumber} />
            <HrmsRow label="Aadhaar" value={hrms.aadhaarNumber} />
            <HrmsRow label="PF Number" value={hrms.pfNumber} />
            <HrmsRow label="ESI Number" value={hrms.esiNumber} />
            <HrmsRow label="Emergency Contact" value={hrms.emergencyContact} />
            <HrmsRow label="Reporting Manager" value={hrms.reportingManager} />
          </div>
        </div>
      )}

      {/* Scoring Rules Reference */}
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        borderRadius: 12, padding: 16, marginBottom: 16,
        border: '2px solid #F59E0B',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#92400E', marginBottom: 12 }}>
          📐 Marking Scheme
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#92400E', marginBottom: 6 }}>✅ Score Calculation</div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
              Base = Presents × {scoringConfig.hrScoreMultiplier || 2}
              <br />Overall = Base − Deductions
              <br />🔴 Score &lt; {scoringConfig.lowScoreThreshold || 7} → marked RED
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#92400E', marginBottom: 6 }}>➖ −1 Deductions</div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
              • Leaves &gt; 2<br />• Late/Early &gt; 1<br />• Uninformed &gt; 1<br />• Half Days &gt; 2
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #FCD34D' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#92400E', marginBottom: 6 }}>⚠️ −2 Deductions</div>
            <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
              • Leaves &gt; 5<br />• Late/Early &gt; 4<br />• Uninformed &gt; 3<br />• Half Days &gt; 4
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: '#92400E', textAlign: 'center' }}>
          Shift: {scoringConfig.shiftStart || '10:00 AM'} – {scoringConfig.shiftEnd || '7:00 PM'} · Grace: {scoringConfig.lateGracePeriod || '15 min'} · Sundays excluded
        </div>
      </div>

      <div style={{
        padding: 12, background: '#f3f4f6', borderRadius: 8, fontSize: 11, color: '#6B7280', textAlign: 'center',
      }}>
        📥 Excel export includes 4 sheets: My HR Summary, Late-Early Details, Uninformed Dates, Scoring Rules · Opens in MS Excel, WPS Office, LibreOffice
      </div>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────
const filterLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #4a4a4a',
  background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', minWidth: 130,
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '2px solid #e5e7eb',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 12, color: '#1f2937',
}

function StatCard({ label, value, icon, color, warn }: { label: string; value: any; icon: string; color: string; warn?: boolean }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: 12,
      border: `1px solid ${warn ? '#EF4444' : '#e5e7eb'}`,
      borderLeft: `3px solid ${warn ? '#EF4444' : color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: warn ? '#DC2626' : '#1f2937' }}>
        {value}
      </div>
    </div>
  )
}

function ScoreRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{
      padding: 10, background: '#f9fafb', borderRadius: 8,
      border: `1px solid ${color}30`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: bold ? 20 : 16, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  )
}

function HrmsRow({ label, value }: { label: string; value: any }) {
  return (
    <div style={{
      padding: '8px 12px', background: '#fff', borderRadius: 6,
      border: '1px solid #BAE6FD',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#0C4A6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: value ? '#0C4A6E' : '#9CA3AF' }}>
        {value || '—'}
      </div>
    </div>
  )
}
