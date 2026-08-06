// ════════════════════════════════════════════════════════════════════════
// v25·0806 — HRMS Direct DB Client (READ-ONLY)
// ════════════════════════════════════════════════════════════════════════
// The HRMS HTTP API exposes Employees + Leaves, but DOES NOT expose
// Attendance or Payroll records (returns empty even though the DB has
// 30+ attendance records for July 2026 and 30 payroll records for
// July 2026). This module reads those tables directly from the HRMS
// Neon database using a read-only connection.
//
// ENV: HRMS_DATABASE_URL — Neon connection string for the HRMS database.
//   Example: postgresql://neondb_owner:***@ep-empty-haze-***.neon.tech/neondb?sslmode=require
//
// SAFETY: STRICTLY READ-ONLY. Only SELECT queries. No INSERT/UPDATE/DELETE.
// All queries use parameterized inputs to prevent SQL injection.
// The connection string points to the HRMS database, which is SEPARATE
// from the ERP database — there is zero risk of cross-contamination.
// ════════════════════════════════════════════════════════════════════════

import { Pool } from 'pg'

export interface HrmsAttendanceRecord {
  id: string
  employeeId: string
  date: string // ISO date
  checkIn: string | null // "10:01"
  checkOut: string | null // "19:00"
  totalHours: number
  status: string // present, late, early-out, half-day, absent, etc.
  lateEntry: boolean
  halfDay: boolean
  overtimeHours: number
  earlyOut: boolean
  isHoliday: boolean
  isWeeklyOff: boolean
  isSunday: boolean
  isPH: boolean
  sundayHours: number
  remarks: string | null
}

export interface HrmsPayrollRecord {
  id: string
  employeeId: string
  month: number
  year: number
  monthlySalary: number
  hourlyRate: number
  totalWorkedHrs: number
  otHours: number
  otRate: number
  otAmount: number
  sundayHrs: number
  sundayCount: number
  sundayEarnings: number
  totalHrs: number
  presentDays: number
  absentDays: number
  holidayDays: number
  paidLeaves: number
  grossSalary: number
  tdsDeduction: number
  loanDeduction: number
  advanceDeduction: number
  securityDeposit: number
  otherDeductions: number
  totalDeductions: number
  arrear: number
  bonus: number
  incentive: number
  netSalary: number
  status: string
  generatedAt: string | null
  approvedBy: string | null
}

let _pool: Pool | null = null

function getPool(): Pool | null {
  const url = process.env.HRMS_DATABASE_URL
  if (!url) return null
  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      ssl: { rejectUnauthorized: false },
    })
  }
  return _pool
}

export function isHrmsDbConfigured(): boolean {
  return !!process.env.HRMS_DATABASE_URL
}

/**
 * Fetch all HRMS attendance records for an employee within a date range.
 * Date range is INCLUSIVE on both ends (YYYY-MM-DD strings).
 * Returns [] if DB is not configured or on error.
 */
export async function fetchHrmsAttendanceByEmployee(
  employeeId: string,
  startDateIso: string,
  endDateIso: string
): Promise<HrmsAttendanceRecord[]> {
  const pool = getPool()
  if (!pool || !employeeId) return []
  try {
    const res = await pool.query(
      `SELECT id, "employeeId", date, "checkIn", "checkOut", "totalHours",
              status, "lateEntry", "halfDay", "overtimeHours", "earlyOut",
              "isHoliday", "isWeeklyOff", "isSunday", "isPH", "sundayHours",
              remarks
       FROM "Attendance"
       WHERE "employeeId" = $1
         AND date >= $2::timestamp
         AND date <= $3::timestamp
       ORDER BY date ASC`,
      [employeeId, startDateIso, endDateIso]
    )
    return res.rows.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalHours: Number(r.totalHours) || 0,
      status: r.status || 'present',
      lateEntry: !!r.lateEntry,
      halfDay: !!r.halfDay,
      overtimeHours: Number(r.overtimeHours) || 0,
      earlyOut: !!r.earlyOut,
      isHoliday: !!r.isHoliday,
      isWeeklyOff: !!r.isWeeklyOff,
      isSunday: !!r.isSunday,
      isPH: !!r.isPH,
      sundayHours: Number(r.sundayHours) || 0,
      remarks: r.remarks || null,
    }))
  } catch (e) {
    console.error('[HRMS-DB] fetchHrmsAttendanceByEmployee error:', e)
    return []
  }
}

/**
 * Fetch ALL HRMS attendance records for a given month (any employee).
 * Useful for the admin HR report — gives full attendance picture across
 * the company for past months when ERP punch data doesn't exist.
 */
export async function fetchHrmsAttendanceForMonth(
  year: number,
  month: number // 1-12
): Promise<HrmsAttendanceRecord[]> {
  const pool = getPool()
  if (!pool) return []
  try {
    const startIso = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    const endIso = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-01 00:00:00`
    const res = await pool.query(
      `SELECT id, "employeeId", date, "checkIn", "checkOut", "totalHours",
              status, "lateEntry", "halfDay", "overtimeHours", "earlyOut",
              "isHoliday", "isWeeklyOff", "isSunday", "isPH", "sundayHours",
              remarks
       FROM "Attendance"
       WHERE date >= $1::timestamp
         AND date < $2::timestamp
       ORDER BY date ASC`,
      [startIso, endIso]
    )
    return res.rows.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalHours: Number(r.totalHours) || 0,
      status: r.status || 'present',
      lateEntry: !!r.lateEntry,
      halfDay: !!r.halfDay,
      overtimeHours: Number(r.overtimeHours) || 0,
      earlyOut: !!r.earlyOut,
      isHoliday: !!r.isHoliday,
      isWeeklyOff: !!r.isWeeklyOff,
      isSunday: !!r.isSunday,
      isPH: !!r.isPH,
      sundayHours: Number(r.sundayHours) || 0,
      remarks: r.remarks || null,
    }))
  } catch (e) {
    console.error('[HRMS-DB] fetchHrmsAttendanceForMonth error:', e)
    return []
  }
}

/**
 * Fetch the HRMS Payroll record for a specific employee + month + year.
 * Returns null if not found or on error.
 */
export async function fetchHrmsPayroll(
  employeeId: string,
  month: number,
  year: number
): Promise<HrmsPayrollRecord | null> {
  const pool = getPool()
  if (!pool || !employeeId) return null
  try {
    const res = await pool.query(
      `SELECT id, "employeeId", month, year, "monthlySalary", "hourlyRate",
              "totalWorkedHrs", "otHours", "otRate", "otAmount", "sundayHrs",
              "sundayCount", "sundayEarnings", "totalHrs", "presentDays",
              "absentDays", "holidayDays", "paidLeaves", "grossSalary",
              "tdsDeduction", "loanDeduction", "advanceDeduction",
              "securityDeposit", "otherDeductions", "totalDeductions",
              arrear, bonus, incentive, "netSalary", status, "generatedAt",
              "approvedBy"
       FROM "Payroll"
       WHERE "employeeId" = $1 AND month = $2 AND year = $3
       LIMIT 1`,
      [employeeId, month, year]
    )
    if (res.rows.length === 0) return null
    const r = res.rows[0]
    return {
      id: r.id,
      employeeId: r.employeeId,
      month: Number(r.month),
      year: Number(r.year),
      monthlySalary: Number(r.monthlySalary) || 0,
      hourlyRate: Number(r.hourlyRate) || 0,
      totalWorkedHrs: Number(r.totalWorkedHrs) || 0,
      otHours: Number(r.otHours) || 0,
      otRate: Number(r.otRate) || 0,
      otAmount: Number(r.otAmount) || 0,
      sundayHrs: Number(r.sundayHrs) || 0,
      sundayCount: Number(r.sundayCount) || 0,
      sundayEarnings: Number(r.sundayEarnings) || 0,
      totalHrs: Number(r.totalHrs) || 0,
      presentDays: Number(r.presentDays) || 0,
      absentDays: Number(r.absentDays) || 0,
      holidayDays: Number(r.holidayDays) || 0,
      paidLeaves: Number(r.paidLeaves) || 0,
      grossSalary: Number(r.grossSalary) || 0,
      tdsDeduction: Number(r.tdsDeduction) || 0,
      loanDeduction: Number(r.loanDeduction) || 0,
      advanceDeduction: Number(r.advanceDeduction) || 0,
      securityDeposit: Number(r.securityDeposit) || 0,
      otherDeductions: Number(r.otherDeductions) || 0,
      totalDeductions: Number(r.totalDeductions) || 0,
      arrear: Number(r.arrear) || 0,
      bonus: Number(r.bonus) || 0,
      incentive: Number(r.incentive) || 0,
      netSalary: Number(r.netSalary) || 0,
      status: r.status || 'generated',
      generatedAt: r.generatedAt ? (r.generatedAt instanceof Date ? r.generatedAt.toISOString() : String(r.generatedAt)) : null,
      approvedBy: r.approvedBy || null,
    }
  } catch (e) {
    console.error('[HRMS-DB] fetchHrmsPayroll error:', e)
    return null
  }
}

/**
 * Fetch ALL HRMS payroll records for a given month (any employee).
 * Useful for the admin HR report's salary summary.
 */
export async function fetchHrmsPayrollForMonth(
  year: number,
  month: number
): Promise<HrmsPayrollRecord[]> {
  const pool = getPool()
  if (!pool) return []
  try {
    const res = await pool.query(
      `SELECT id, "employeeId", month, year, "monthlySalary", "hourlyRate",
              "totalWorkedHrs", "otHours", "otRate", "otAmount", "sundayHrs",
              "sundayCount", "sundayEarnings", "totalHrs", "presentDays",
              "absentDays", "holidayDays", "paidLeaves", "grossSalary",
              "tdsDeduction", "loanDeduction", "advanceDeduction",
              "securityDeposit", "otherDeductions", "totalDeductions",
              arrear, bonus, incentive, "netSalary", status, "generatedAt",
              "approvedBy"
       FROM "Payroll"
       WHERE month = $1 AND year = $2
       ORDER BY "employeeId" ASC`,
      [month, year]
    )
    return res.rows.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      month: Number(r.month),
      year: Number(r.year),
      monthlySalary: Number(r.monthlySalary) || 0,
      hourlyRate: Number(r.hourlyRate) || 0,
      totalWorkedHrs: Number(r.totalWorkedHrs) || 0,
      otHours: Number(r.otHours) || 0,
      otRate: Number(r.otRate) || 0,
      otAmount: Number(r.otAmount) || 0,
      sundayHrs: Number(r.sundayHrs) || 0,
      sundayCount: Number(r.sundayCount) || 0,
      sundayEarnings: Number(r.sundayEarnings) || 0,
      totalHrs: Number(r.totalHrs) || 0,
      presentDays: Number(r.presentDays) || 0,
      absentDays: Number(r.absentDays) || 0,
      holidayDays: Number(r.holidayDays) || 0,
      paidLeaves: Number(r.paidLeaves) || 0,
      grossSalary: Number(r.grossSalary) || 0,
      tdsDeduction: Number(r.tdsDeduction) || 0,
      loanDeduction: Number(r.loanDeduction) || 0,
      advanceDeduction: Number(r.advanceDeduction) || 0,
      securityDeposit: Number(r.securityDeposit) || 0,
      otherDeductions: Number(r.otherDeductions) || 0,
      totalDeductions: Number(r.totalDeductions) || 0,
      arrear: Number(r.arrear) || 0,
      bonus: Number(r.bonus) || 0,
      incentive: Number(r.incentive) || 0,
      netSalary: Number(r.netSalary) || 0,
      status: r.status || 'generated',
      generatedAt: r.generatedAt ? (r.generatedAt instanceof Date ? r.generatedAt.toISOString() : String(r.generatedAt)) : null,
      approvedBy: r.approvedBy || null,
    }))
  } catch (e) {
    console.error('[HRMS-DB] fetchHrmsPayrollForMonth error:', e)
    return []
  }
}
