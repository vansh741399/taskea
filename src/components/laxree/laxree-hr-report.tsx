'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'

// ════════════════════════════════════════════════════════════════════════
// v25·0801 — HR Report View (Founder/Admin/Director only)
// ════════════════════════════════════════════════════════════════════════
// Generates an HR report with month/location/year filters.
// Supports Excel download (multi-sheet) and JSON preview.
// ════════════════════════════════════════════════════════════════════════

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
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

  // Fetch report data (JSON preview)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr-report', month, year, location],
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

  // Download Excel
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

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>HR Report</h2>
          <p>Monthly HR summary with task, leave, and attendance stats · Excel export</p>
        </div>
        <div className="ph-right">
          <button
            className="btn btn-gold"
            onClick={downloadExcel}
            disabled={downloading || isLoading}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {downloading ? '⏳ Generating...' : '📊 Download Excel'}
          </button>
        </div>
      </div>
      <div className="page-accent" />

      {/* Filters */}
      <div style={{
        background: 'var(--bg)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: '1px solid var(--b1)',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 4 }}>
            Month
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--b2)',
              background: 'var(--bg2)',
              color: 'var(--t1)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 130,
            }}
          >
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 4 }}>
            Year
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--b2)',
              background: 'var(--bg2)',
              color: 'var(--t1)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 100,
            }}
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 4 }}>
            Location
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--b2)',
              background: 'var(--bg2)',
              color: 'var(--t1)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 140,
            }}
          >
            {LOCATIONS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <button
          className="btn"
          onClick={() => refetch()}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--bg2)',
            border: '1px solid var(--b2)',
            color: 'var(--t1)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}>
          <SummaryCard label="Total Employees" value={summary.totalEmployees} icon="👥" color="#6D28D9" />
          <SummaryCard label="Total Tasks" value={summary.totalTasks} icon="📋" color="#1D4ED8" />
          <SummaryCard label="Completed" value={summary.completedTasks} icon="✅" color="#10B981" />
          <SummaryCard label="Overdue" value={summary.overdueTasks} icon="🔴" color="#EF4444" />
          <SummaryCard label="Leave Days" value={summary.totalLeaveDays} icon="🏖️" color="#F59E0B" />
          <SummaryCard label="Work Hours" value={summary.totalWorkHours} icon="⏰" color="#0F766E" />
          <SummaryCard label="Avg Performance" value={`${summary.avgPerformance}%`} icon="🎯" color="#B45309" />
        </div>
      )}

      {/* Employees Table */}
      <div style={{
        background: 'var(--bg)',
        borderRadius: 12,
        border: '1px solid var(--b1)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--b1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t1)' }}>
            Employee-wise Breakdown
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>
            {employees.length} employees · {MONTHS.find(m => m.value === month)?.label} {year}
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            Loading report...
          </div>
        ) : employees.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
            No employees found for selected filters
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <Th>Designation</Th>
                  <Th>Location</Th>
                  <Th align="center">Tasks</Th>
                  <Th align="center">Done</Th>
                  <Th align="center">Overdue</Th>
                  <Th align="center">Perf %</Th>
                  <Th align="center">Leaves</Th>
                  <Th align="center">Leave Days</Th>
                  <Th align="center">Punch Days</Th>
                  <Th align="center">Work Hrs</Th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp: any, i: number) => (
                  <tr
                    key={`${emp.email}-${i}`}
                    style={{
                      borderBottom: '1px solid var(--b1)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                    }}
                  >
                    <Td>
                      <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{emp.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{emp.email}</div>
                    </Td>
                    <Td>{emp.status}</Td>
                    <Td>{emp.department || '-'}</Td>
                    <Td>{emp.designation || '-'}</Td>
                    <Td>{emp.location || '-'}</Td>
                    <Td align="center">{emp.totalTasks}</Td>
                    <Td align="center">
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>{emp.completedTasks}</span>
                    </Td>
                    <Td align="center">
                      {emp.overdueTasks > 0 ? (
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{emp.overdueTasks}</span>
                      ) : '0'}
                    </Td>
                    <Td align="center">
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        background: emp.performanceScore >= 70 ? 'rgba(16,185,129,0.15)' :
                                    emp.performanceScore >= 40 ? 'rgba(245,158,11,0.15)' :
                                    'rgba(239,68,68,0.15)',
                        color: emp.performanceScore >= 70 ? '#10B981' :
                               emp.performanceScore >= 40 ? '#F59E0B' : '#EF4444',
                      }}>
                        {emp.performanceScore}%
                      </span>
                    </Td>
                    <Td align="center">{emp.totalLeaves}</Td>
                    <Td align="center">{emp.totalLeaveDays}</Td>
                    <Td align="center">{emp.punchDays}</Td>
                    <Td align="center">{emp.totalWorkHours}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'var(--bg2)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--t3)',
        textAlign: 'center',
      }}>
        📊 Report includes 4 Excel sheets: Employee Summary, Department Summary, Location Summary, Report Info ·
        Format details can be customized later
      </div>
    </>
  )
}

function SummaryCard({ label, value, icon, color }: { label: string; value: any; icon: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg)',
      borderRadius: 10,
      padding: 14,
      border: '1px solid var(--b1)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>
        {value}
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: align,
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--t3)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: align,
      color: 'var(--t2)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  )
}
