import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchHrmsEmployees,
  fetchHrmsLeaves,
  findHrmsEmployeeByHrmsId,
  findHrmsEmployeeByName,
  type HrmsEmployee,
  type HrmsLeave,
} from '@/lib/hrms-client'
import {
  fetchHrmsAttendanceForMonth,
  fetchHrmsAttendanceByEmployee,
  isHrmsDbConfigured,
  type HrmsAttendanceRecord,
} from '@/lib/hrms-db'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

// ════════════════════════════════════════════════════════════════════════
// v25·0806-fix — IST TIMEZONE HELPERS (critical fix)
// ════════════════════════════════════════════════════════════════════════
// Vercel serverless functions run in UTC. The previous version of this route
// used getHours()/getMinutes()/toDateString()/getDay() — which all return
// values in the SERVER's local timezone (UTC on Vercel). But the shift is
// in IST (UTC+5:30). This caused:
//   • Punch at 10:30 AM IST = 05:00 UTC → getHours() returns 5
//     5 > 10 is false → never marked late (BROKEN)
//   • Punch at 09:00 AM IST on Aug 6 = Aug 5 23:30 UTC → toDateString()
//     returns "Tue Aug 05 2026" → counted as present on wrong day
//     → marked UNINFORMED on Aug 6 even though user punched (BROKEN)
//   • Day-of-week check used UTC day, so Sundays in IST were sometimes
//     detected as Saturdays (BROKEN)
//
// FIX: All date operations now go through these IST helpers. They compute
// the IST components by adding 5:30 to the UTC milliseconds, then reading
// the UTC-* getters on the shifted Date (which gives us IST values).
// ════════════════════════════════════════════════════════════════════════
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // IST = UTC + 5:30

interface IstParts {
  year: number
  month: number   // 1-12
  day: number     // 1-31
  hour: number    // 0-23
  minute: number  // 0-59
  dayOfWeek: number // 0=Sun, 6=Sat
  dateStr: string // "YYYY-MM-DD" — sortable, comparable
}

function getIstParts(date: Date): IstParts {
  // Shift the timestamp forward by IST offset, then read UTC getters.
  // This gives us the IST civil-time components regardless of server tz.
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth() + 1
  const d = ist.getUTCDate()
  return {
    year: y,
    month: m,
    day: d,
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayOfWeek: ist.getUTCDay(),
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  }
}

function istDateString(ts: Date | string): string {
  return getIstParts(new Date(ts)).dateStr
}

/**
 * Build a UTC Date range that exactly covers one IST calendar month.
 *   month=7, year=2026  →  start = Jul 1 00:00 IST = Jun 30 18:30 UTC
 *                          end   = Jul 31 23:59:59.999 IST = Jul 31 18:29:59.999 UTC
 * Punches stored as UTC ISO strings will be correctly filtered.
 */
function istMonthRange(year: number, month: number): { start: Date; end: Date } {
  const startUtcMs = Date.UTC(year, month - 1, 1) - IST_OFFSET_MS
  const nextMonthStartUtcMs = Date.UTC(year, month, 1) - IST_OFFSET_MS
  const endUtcMs = nextMonthStartUtcMs - 1
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

// ════════════════════════════════════════════════════════════════════════
// v25·0806-hrms-db — Convert HRMS Attendance records to PunchLike
// ════════════════════════════════════════════════════════════════════════
// The HRMS DB has Attendance records for months BEFORE the ERP punch feature
// launched (pre-2026-08). This helper converts those records to PunchLike
// objects so they flow through the existing computeEmployeeReport logic.
//
// HRMS attendance has: date, checkIn ("10:01"), checkOut ("19:00"), status,
// lateEntry, earlyOut, halfDay, isSunday, isWeeklyOff, isHoliday.
// We synthesize punchIn/punchOut as full ISO timestamps in IST.
// ════════════════════════════════════════════════════════════════════════
function hrmsAttendanceToPunches(records: HrmsAttendanceRecord[]): PunchLike[] {
  const punches: PunchLike[] = []
  for (const a of records) {
    // Skip non-working days — they shouldn't count as presents
    if (a.isWeeklyOff || a.isHoliday) continue
    if (a.status === 'absent') continue
    if (!a.checkIn) continue

    const dateObj = new Date(a.date)
    const istParts = getIstParts(dateObj)
    const dateStr = istParts.dateStr // YYYY-MM-DD

    // Parse HRMS time "10:01" → hour, minute
    const [inH, inM] = a.checkIn.split(':').map(s => parseInt(s) || 0)
    // Build IST punch-in timestamp: dateStr + "T" + HH:MM + ":00+05:30"
    // Then convert to UTC Date for storage in PunchLike
    const punchInIso = new Date(`${dateStr}T${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}:00+05:30`)

    let punchOut: Date | null = null
    if (a.checkOut) {
      const [outH, outM] = a.checkOut.split(':').map(s => parseInt(s) || 0)
      punchOut = new Date(`${dateStr}T${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}:00+05:30`)
    }

    let status = 'PRESENT'
    if (a.lateEntry) status = 'LATE'
    else if (a.earlyOut) status = 'EARLY_OUT'
    else if (a.halfDay) status = 'HALF_DAY'

    punches.push({
      punchIn: punchInIso,
      punchOut: punchOut || undefined,
      status,
    })
  }
  return punches
}

// ════════════════════════════════════════════════════════════════════════
// v25·0806 — HR REPORT (self + admin modes, HRMS-enriched)
// ════════════════════════════════════════════════════════════════════════
// Two modes:
//   1. ADMIN VIEW (default)   — returns all active employees
//      GET /api/hr-report?month=8&year=2026&location=all
//   2. SELF VIEW (employee)   — returns ONLY the requesting user's own row
//      GET /api/hr-report?self=1&userId=xxx&month=8&year=2026
//
// SECURITY: when self=1, the API forces filter to the supplied userId,
// regardless of other params. This prevents IDOR — employees cannot
// enumerate other employees' data by passing different userId values.
// The userId is verified against the DB before any data is returned.
//
// HRMS ENRICHMENT: Pulls the full employee master list from
// https://laxree-hrms.vercel.app/api/employees using HRMS_ACCESS_TOKEN.
// Merges in: salary, joiningDate, firm, employmentType, bank details,
// PAN/Aadhaar, shift timings — all from HRMS (single source of truth).
//
// SCORING (v25·0806-out-of-10):
//   Max Score = 10 (out of 10)
//   Base Score = 10 (always starts at 10/10)
//   Deductions per marking scheme (see code below)
//   Overall Score = max(0, 10 - Deductions) — capped between 0 and 10
//   If Overall Score < 7 → marked RED
//
// EXCEL EXPORT (WPS-Office-compatible):
//   - Sheet 1: HR Report (single sheet, clean header row + freeze top row)
//   (Sheet 2 Employee Master, Sheet 3 Scoring Rules, Sheet 4 Location
//    Summary, Sheet 5 Report Info — all removed per founder request)
//   bookType: 'xlsx', standard OOXML — opens cleanly in MS Excel, WPS,
//   LibreOffice, Google Sheets.
// ════════════════════════════════════════════════════════════════════════

// v25·0806-out-of-10: Score is now OUT OF 10 (was Presents × 2).
// User criteria: start at 10, apply same -1 and -2 deductions.
const MAX_SCORE = 10
const SHIFT_START_HOUR = 10 // 10:00 AM IST
const SHIFT_END_HOUR = 19   // 7:00 PM IST
const LATE_THRESHOLD_MINUTES = 15 // 15 min grace period
// In minutes since IST midnight — used for precise late/early comparison
const SHIFT_START_MIN = SHIFT_START_HOUR * 60                 // 600 (10:00 AM)
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES // 615 (10:15 AM)
const SHIFT_END_MIN = SHIFT_END_HOUR * 60                     // 1140 (7:00 PM)
const WEEKEND_DAYS = new Set([0, 6]) // 0=Sunday, 6=Saturday — both skipped in uninformed count

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const location = searchParams.get('location') || 'all'
    const format = searchParams.get('format') || 'json'

    // ─── SELF MODE (employee personal report) ───
    // When self=1, the request must include userId. We verify the user
    // exists in DB before returning any data. All other filters are
    // ignored — the response contains only this user's row.
    const isSelfMode = searchParams.get('self') === '1'
    const selfUserId = searchParams.get('userId') || ''

    if (isSelfMode) {
      if (!selfUserId) {
        return NextResponse.json(
          { error: 'Missing userId for self-report' },
          { status: 400 }
        )
      }
      // Verify the user exists
      const selfUser = await db.user.findUnique({
        where: { id: selfUserId },
        select: { id: true, name: true, role: true, isActive: true },
      })
      if (!selfUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }
      // Build a self-only report
      const selfReport = await buildSelfReport(selfUserId, month, year)
      if (format === 'xlsx') {
        return await buildSelfExcelResponse(selfReport, month, year)
      }
      return NextResponse.json(selfReport)
    }

    // ─── ADMIN VIEW (all employees) ───
    // v25·0806-fix: use IST month range so punches near month boundaries
    // (e.g. Aug 1 02:00 IST = Jul 31 20:30 UTC) are assigned to the
    // correct IST month. Previously a UTC range caused last-month punches
    // to be excluded and next-month punches to be included.
    const { start: startDate, end: endDate } = istMonthRange(year, month)
    const daysInMonth = new Date(year, month, 0).getDate()

    // Build user filter
    const userWhere: any = { isActive: true }
    if (location && location !== 'all') {
      userWhere.OR = [
        { location: { contains: location, mode: 'insensitive' } },
        { office: { city: { contains: location, mode: 'insensitive' } } },
      ]
    }

    // 1. Fetch all active employees (exclude FOUNDER/ADMIN/DIRECTOR from attendance report)
    const users = await db.user.findMany({
      where: { ...userWhere, role: { in: ['EMPLOYEE', 'MANAGER', 'EA'] } },
      select: {
        id: true, name: true, email: true, role: true,
        department: true, designation: true, location: true,
        joinDate: true, hrmsId: true,
        office: { select: { name: true, city: true } },
      },
      orderBy: [{ name: 'asc' }],
    })

    const userIds = users.map(u => u.id)

    // 2. Fetch punch records for the month (IST range)
    const punches = await db.punchRecord.findMany({
      where: {
        userId: { in: userIds },
        punchIn: { gte: startDate, lte: endDate },
      },
      select: { userId: true, punchIn: true, punchOut: true, status: true },
      orderBy: { punchIn: 'asc' },
    })

    // 3. Fetch ERP leaves for the month
    const erpLeaves = await db.leave.findMany({
      where: {
        userId: { in: userIds },
        OR: [
          { fromDate: { gte: startDate, lte: endDate } },
          { toDate: { gte: startDate, lte: endDate } },
          { AND: [{ fromDate: { lte: startDate } }, { toDate: { gte: endDate } }] },
        ],
      },
      select: {
        userId: true, leaveType: true, fromDate: true, toDate: true,
        status: true, totalDays: true, reason: true,
      },
    })

    // v25·0806-fix: ALSO fetch HRMS leaves (read-only GET) and merge.
    // Rationale: the ERP punch feature was added on 2026-08-01, so previous
    // months have NO ERP punch/leave data. HRMS may have leave history for
    // those months. Fetching HRMS leaves is purely additive — never deletes
    // or modifies ERP leaves. We only ADD leaves that aren't already in ERP.
    //
    // NOTE: hrmsEmployees is fetched first (line below) so we can match
    // HRMS leaves to ERP users by name/hrmsId.
    const hrmsEmployeesRaw = await fetchHrmsEmployees()

    // v25·0806-active-only: Only ACTIVE HRMS employees should appear in the
    // HR report. An employee is considered active when:
    //   - status === 'Yes' (HRMS uses 'Yes'/'No' text values)
    //   - AND relievingDate is null (no relieving date set)
    // This is a defensive filter — even if an ERP user is marked isActive=true
    // but their HRMS record is inactive (e.g. Aayush, status=No), they will
    // still be excluded from the report. The user explicitly stated:
    // "Jo hrms mein inactive hain unki need nahi hain jo active hain unhi k chiye"
    const isHrmsActive = (e: { status?: string | null; relievingDate?: string | null }) => {
      const s = String(e?.status || '').trim().toLowerCase()
      return (s === 'yes' || s === 'true' || s === '1' || s === 'active') && !e?.relievingDate
    }
    const hrmsEmployees = hrmsEmployeesRaw.filter(isHrmsActive)

    // Build a set of inactive-HRMS ERP user IDs so we can exclude them below.
    // (isActive=true in ERP but HRMS record inactive.)
    const inactiveHrmsErpUserIds = new Set<string>()
    for (const u of users) {
      const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployeesRaw, u.hrmsId) ||
        findHrmsEmployeeByName(hrmsEmployeesRaw, u.name)
      if (hrmsEmp && !isHrmsActive(hrmsEmp)) {
        inactiveHrmsErpUserIds.add(u.id)
      }
    }
    if (inactiveHrmsErpUserIds.size > 0) {
      console.log(`[hr-report] Excluding ${inactiveHrmsErpUserIds.size} ERP user(s) whose HRMS record is inactive.`)
    }

    const hrmsLeavesAll = await fetchHrmsLeaves()
    // Build a set of (userId + fromDateStr) keys for ERP leaves to dedupe
    const erpLeaveKeys = new Set<string>()
    for (const l of erpLeaves) {
      erpLeaveKeys.add(`${l.userId}|${istDateString(l.fromDate)}`)
    }
    // Match HRMS leaves to ERP users by name (HRMS leaves don't have ERP userId)
    const hrmsLeavesMerged: LeaveLike[] = []
    for (const hl of hrmsLeavesAll) {
      if (hl.status !== 'approved') continue
      // Skip if outside the selected IST month
      const fromIst = istDateString(hl.startDate)
      const toIst = istDateString(hl.endDate)
      const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`
      const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      if (toIst < monthStartStr || fromIst > monthEndStr) continue
      // Find matching ERP user by HRMS employee name
      const matchedUser = users.find(u => {
        const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, u.hrmsId) ||
          findHrmsEmployeeByName(hrmsEmployees, u.name)
        return hrmsEmp && (hrmsEmp.fullName === hl.employee?.fullName ||
          hrmsEmp.employeeId === hl.employeeId)
      })
      if (!matchedUser) continue
      const key = `${matchedUser.id}|${fromIst}`
      if (erpLeaveKeys.has(key)) continue // already in ERP, skip duplicate
      hrmsLeavesMerged.push({
        userId: matchedUser.id,
        leaveType: hl.type || 'CASUAL',
        fromDate: new Date(hl.startDate),
        toDate: new Date(hl.endDate),
        status: 'APPROVED',
        totalDays: hl.days,
        reason: hl.reason,
      })
    }
    const leaves = [...erpLeaves, ...hrmsLeavesMerged]

    // v25·0806-hrms-db: If ERP has NO punches for this month, try HRMS DB.
    // This gives us attendance history for months BEFORE the ERP punch feature
    // launched (pre-2026-08). For each ERP user, find their HRMS employeeId,
    // then fetch HRMS attendance for that employee + month, convert to PunchLike.
    let hrmsAttendanceCount = 0
    const hrmsAttendanceByEmp = new Map<string, HrmsAttendanceRecord[]>()
    if (punches.length === 0 && isHrmsDbConfigured()) {
      const hrmsAttendanceAll = await fetchHrmsAttendanceForMonth(year, month)
      hrmsAttendanceCount = hrmsAttendanceAll.length
      for (const a of hrmsAttendanceAll) {
        if (!hrmsAttendanceByEmp.has(a.employeeId)) hrmsAttendanceByEmp.set(a.employeeId, [])
        hrmsAttendanceByEmp.get(a.employeeId)!.push(a)
      }
    }

    // 5. Compute stats per user
    // v25·0806-active-only: Skip ERP users whose HRMS record is inactive.
    // We still process them above (so we don't break indexing), but we filter
    // them out of the final `report` array before returning. This keeps the
    // founder/admin HR report strictly limited to ACTIVE HRMS employees.
    const report = users
      .filter(u => !inactiveHrmsErpUserIds.has(u.id))
      .map((user, index) => {
      let userPunches: PunchLike[] = punches.filter(p => p.userId === user.id)
      const userLeaves = leaves.filter(l => l.userId === user.id)

      // ─── Match HRMS employee by hrmsId first, then by name ───
      const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
        findHrmsEmployeeByName(hrmsEmployees, user.name)

      // v25·0806-hrms-db: If no ERP punches, use HRMS attendance as synthetic punches
      if (userPunches.length === 0 && hrmsEmp && isHrmsDbConfigured()) {
        const hrmsAtt = hrmsAttendanceByEmp.get(hrmsEmp.employeeId) || []
        if (hrmsAtt.length > 0) {
          userPunches = hrmsAttendanceToPunches(hrmsAtt)
        }
      }

      return computeEmployeeReport(user, userPunches, userLeaves, hrmsEmp, index, month, year, daysInMonth)
    })

    // Re-number SNO after filtering so it's sequential 1..N
    report.forEach((r, i) => { r.sno = i + 1 })

    // ─── Return in requested format ───
    if (format === 'xlsx') {
      return await buildAdminExcelResponse(report, { month, year, location })
    }

    // JSON format
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      filters: { month, year, location },
      mode: 'admin',
      timezone: 'Asia/Kolkata (IST, UTC+5:30)',
      // v25·0806-fix: dataStatus tells the frontend whether ERP punch data
      // exists for the selected month. The ERP punch feature was added on
      // 2026-08-01, so previous months will show 'no-erp-punches' — the
      // frontend can display a banner telling the user that only HRMS
      // leave data is shown for that month.
      // v25·0806-hrms-db: If HRMS DB attendance is available, mark as 'hrms-db'
      // instead — the frontend shows a positive "HRMS attendance data" banner.
      dataStatus: punches.length === 0
        ? (hrmsAttendanceCount > 0
            ? 'hrms-db-attendance'
            : (hrmsLeavesMerged.length > 0 ? 'no-erp-punches-leaves-only' : 'no-erp-punches'))
        : 'ok',
      scoringConfig: {
        maxScore: MAX_SCORE,
        baseScore: MAX_SCORE,
        shiftStart: `${SHIFT_START_HOUR}:00 AM IST`,
        shiftEnd: `${SHIFT_END_HOUR}:00 PM IST`,
        lateGracePeriod: `${LATE_THRESHOLD_MINUTES} min`,
        lowScoreThreshold: 7,
        weekend: 'Saturday + Sunday excluded',
        scoringType: 'out-of-10',
      },
      summary: {
        totalEmployees: report.length,
        totalPresents: report.reduce((s, r) => s + r.totalPresents, 0),
        avgScore: report.length > 0
          ? Number((report.reduce((s, r) => s + r.overallScore, 0) / report.length).toFixed(1))
          : 0,
        lowScoreCount: report.filter(r => r.isLowScore).length,
        totalFullDayLeaves: report.reduce((s, r) => s + r.fullDayLeaves, 0),
        totalHalfDayLeaves: report.reduce((s, r) => s + r.halfDayLeaves, 0),
        totalUninformedLeaves: report.reduce((s, r) => s + r.uninformedLeaves, 0),
        totalLateEarly: report.reduce((s, r) => s + r.lateComingsEarlyGoings, 0),
      },
      employees: report,
      hrmsSyncedAt: hrmsEmployees.length > 0 ? new Date().toISOString() : null,
      hrmsEmployeeCount: hrmsEmployees.length,
      hrmsLeavesMergedCount: hrmsLeavesMerged.length,
      punchCount: punches.length,
      hrmsAttendanceCount,
      hrmsDbConfigured: isHrmsDbConfigured(),
    })
  } catch (error) {
    console.error('HR Report API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report', details: String(error) },
      { status: 500 }
    )
  }
}

// ════════════════════════════════════════════════════════════════════════
// SELF REPORT — builds a single-user report object
// ════════════════════════════════════════════════════════════════════════
async function buildSelfReport(userId: string, month: number, year: number) {
  // v25·0806-fix: use IST month range (matches admin view)
  const { start: startDate, end: endDate } = istMonthRange(year, month)
  const daysInMonth = new Date(year, month, 0).getDate()

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true,
      department: true, designation: true, location: true,
      joinDate: true, hrmsId: true,
      office: { select: { name: true, city: true } },
    },
  })
  if (!user) throw new Error('User not found')

  const punches = await db.punchRecord.findMany({
    where: { userId: user.id, punchIn: { gte: startDate, lte: endDate } },
    select: { punchIn: true, punchOut: true, status: true },
    orderBy: { punchIn: 'asc' },
  })

  const erpLeaves = await db.leave.findMany({
    where: {
      userId: user.id,
      OR: [
        { fromDate: { gte: startDate, lte: endDate } },
        { toDate: { gte: startDate, lte: endDate } },
        { AND: [{ fromDate: { lte: startDate } }, { toDate: { gte: endDate } }] },
      ],
    },
    select: {
      leaveType: true, fromDate: true, toDate: true,
      status: true, totalDays: true, reason: true,
    },
  })

  const hrmsEmployees = await fetchHrmsEmployees()
  const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
    findHrmsEmployeeByName(hrmsEmployees, user.name)

  // v25·0806-fix: also pull HRMS leaves for this user (for months before ERP punch feature)
  const hrmsLeavesAll = await fetchHrmsLeaves()
  const erpLeaveKeys = new Set<string>()
  for (const l of erpLeaves) {
    erpLeaveKeys.add(istDateString(l.fromDate))
  }
  const hrmsLeavesMerged: LeaveLike[] = []
  for (const hl of hrmsLeavesAll) {
    if (hl.status !== 'approved') continue
    // Only include leaves for this HRMS employee (match by name or employeeId)
    const isMyLeave = hrmsEmp && (
      hl.employee?.fullName === hrmsEmp.fullName ||
      hl.employeeId === hrmsEmp.employeeId
    )
    if (!isMyLeave) continue
    const fromIst = istDateString(hl.startDate)
    const toIst = istDateString(hl.endDate)
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    if (toIst < monthStartStr || fromIst > monthEndStr) continue
    if (erpLeaveKeys.has(fromIst)) continue
    hrmsLeavesMerged.push({
      userId: user.id,
      leaveType: hl.type || 'CASUAL',
      fromDate: new Date(hl.startDate),
      toDate: new Date(hl.endDate),
      status: 'APPROVED',
      totalDays: hl.days,
      reason: hl.reason,
    })
  }
  const leaves = [...erpLeaves, ...hrmsLeavesMerged]

  // v25·0806-hrms-db: If ERP has no punches for this month, try HRMS DB attendance
  let hrmsAttendanceCount = 0
  let userPunches: PunchLike[] = punches
  if (punches.length === 0 && hrmsEmp && isHrmsDbConfigured()) {
    const hrmsAttendance = await fetchHrmsAttendanceByEmployee(
      hrmsEmp.employeeId,
      `${year}-${String(month).padStart(2, '0')}-01`,
      `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    )
    hrmsAttendanceCount = hrmsAttendance.length
    if (hrmsAttendance.length > 0) {
      userPunches = hrmsAttendanceToPunches(hrmsAttendance)
    }
  }

  const empReport = computeEmployeeReport(user, userPunches, leaves, hrmsEmp, 0, month, year, daysInMonth)

  return {
    generatedAt: new Date().toISOString(),
    filters: { month, year, userId },
    mode: 'self',
    timezone: 'Asia/Kolkata (IST, UTC+5:30)',
    dataStatus: punches.length === 0
      ? (hrmsAttendanceCount > 0
          ? 'hrms-db-attendance'
          : (hrmsLeavesMerged.length > 0 ? 'no-erp-punches-leaves-only' : 'no-erp-punches'))
      : 'ok',
    scoringConfig: {
      maxScore: MAX_SCORE,
      baseScore: MAX_SCORE,
      shiftStart: `${SHIFT_START_HOUR}:00 AM IST`,
      shiftEnd: `${SHIFT_END_HOUR}:00 PM IST`,
      lateGracePeriod: `${LATE_THRESHOLD_MINUTES} min`,
      lowScoreThreshold: 7,
      weekend: 'Saturday + Sunday excluded',
      scoringType: 'out-of-10',
    },
    employee: empReport,
    hrmsSyncedAt: hrmsEmployees.length > 0 ? new Date().toISOString() : null,
    hrmsLeavesMergedCount: hrmsLeavesMerged.length,
    punchCount: punches.length,
    hrmsAttendanceCount,
    hrmsDbConfigured: isHrmsDbConfigured(),
  }
}

// ════════════════════════════════════════════════════════════════════════
// CORE — compute a single employee's report row
// ════════════════════════════════════════════════════════════════════════
interface UserLike {
  id: string
  name: string
  email: string
  role: string
  department: string | null
  designation: string | null
  location: string | null
  joinDate?: Date | null
  hrmsId?: string | null
  office?: { name: string; city: string } | null
}

interface PunchLike {
  punchIn: Date | string
  punchOut?: Date | string | null
  status?: string | null
}

interface LeaveLike {
  userId?: string  // present in ERP leaves and HRMS-merged leaves; used to filter per user
  leaveType: string | null
  fromDate: Date | string
  toDate: Date | string
  status: string
  totalDays: number | null
  reason: string | null
}

function computeEmployeeReport(
  user: UserLike,
  punches: PunchLike[],
  leaves: LeaveLike[],
  hrmsEmp: HrmsEmployee | null,
  index: number,
  month: number,
  year: number,
  daysInMonth: number
) {
  // ════════════════════════════════════════════════════════════════════════
  // v25·0806-fix: ALL date operations below use IST helpers, NOT the
  // server's local timezone. On Vercel the server runs in UTC, so
  // getHours()/getMinutes()/toDateString()/getDay() would return UTC
  // values — which are wrong for an India-based company. Using getIstParts()
  // ensures a punch at 10:30 AM IST is correctly seen as hour=10, minute=30,
  // even though the server stores it as 05:00 UTC.
  // ════════════════════════════════════════════════════════════════════════

  // ─── Count present days (unique IST punch-in days) ───
  // Previously: new Date(p.punchIn).toDateString() — returned UTC date.
  //   A punch at Aug 6 09:00 IST = Aug 5 23:30 UTC → toDateString="Aug 05"
  //   → presentDates had "Aug 05" instead of "Aug 06"
  //   → uninformed check for "Aug 06" returned false → user marked absent!
  // Fix: use istDateString() to get "2026-08-06" format (IST).
  const presentDates = new Set(punches.map(p => istDateString(p.punchIn)))
  const totalPresents = presentDates.size

  // ─── Count approved leaves ───
  const approvedLeaves = leaves.filter(l => l.status === 'APPROVED')
  const fullDayLeaves = approvedLeaves.filter(l =>
    l.leaveType !== 'HALF_DAY' && (l.totalDays || 0) >= 1
  ).length
  const halfDayLeaves = approvedLeaves.filter(l =>
    l.leaveType === 'HALF_DAY' || (l.totalDays || 0) === 0.5
  ).length
  const totalLeaveDays = approvedLeaves.reduce((sum, l) => sum + (l.totalDays || 0), 0)

  // Pre-compute IST date strings for leaves for fast uninformed-loop lookup.
  // Each entry: { fromStr, toStr } in "YYYY-MM-DD" IST format.
  const approvedLeaveRanges = approvedLeaves.map(l => ({
    fromStr: istDateString(l.fromDate),
    toStr: istDateString(l.toDate),
  }))

  // ─── Count late comings / early goings (using IST hours/minutes) ───
  let lateComings = 0
  let earlyGoings = 0
  const latePunchDetails: { date: string; punchIn: string; minutesLate: number }[] = []
  const earlyPunchDetails: { date: string; punchOut: string; minutesEarly: number }[] = []

  punches.forEach(p => {
    // ─── Punch-IN: late detection ───
    const punchInDate = new Date(p.punchIn)
    const inParts = getIstParts(punchInDate)
    const punchInMin = inParts.hour * 60 + inParts.minute  // minutes since IST midnight
    // Late if punch-in after 10:15 AM IST (i.e. minutes > 615)
    if (punchInMin > LATE_THRESHOLD_MIN) {
      lateComings++
      latePunchDetails.push({
        date: inParts.dateStr,
        punchIn: `${String(inParts.hour).padStart(2, '0')}:${String(inParts.minute).padStart(2, '0')} IST`,
        minutesLate: Math.max(0, punchInMin - LATE_THRESHOLD_MIN),
      })
    }

    // ─── Punch-OUT: early going detection ───
    if (p.punchOut) {
      const punchOutDate = new Date(p.punchOut)
      const outParts = getIstParts(punchOutDate)
      const punchOutMin = outParts.hour * 60 + outParts.minute
      // Early if punch-out before 7:00 PM IST (i.e. minutes < 1140).
      // v25·0806-fix: removed the buggy `punchOutMin === 0` condition that
      // marked a punch at EXACTLY 19:00:00 as early. A punch at 19:00 is
      // on-time, not early.
      if (punchOutMin < SHIFT_END_MIN) {
        earlyGoings++
        earlyPunchDetails.push({
          date: outParts.dateStr,
          punchOut: `${String(outParts.hour).padStart(2, '0')}:${String(outParts.minute).padStart(2, '0')} IST`,
          minutesEarly: Math.max(0, SHIFT_END_MIN - punchOutMin),
        })
      }
    }
  })

  const lateComingsEarlyGoings = lateComings + earlyGoings

  // ─── Count uninformed leaves (IST date loop) ───
  let uninformedLeaves = 0
  const uninformedDates: string[] = []
  // v25·0806-fix: use IST "today" — previously new Date() returned UTC
  // and getMonth()+1 was checked against the filter month, which broke
  // for the first/last 5.5 hours of each day.
  const todayIst = getIstParts(new Date())
  const isCurrentMonth = todayIst.month === month && todayIst.year === year
  // Construct IST midnight Date for "today" (for the >today comparison)
  const todayIstMidnightUtcMs = Date.UTC(todayIst.year, todayIst.month - 1, todayIst.day) - IST_OFFSET_MS
  const todayIstMidnight = new Date(todayIstMidnightUtcMs)

  for (let day = 1; day <= daysInMonth; day++) {
    // Build IST midnight for this day (as a UTC Date for comparison)
    const checkDateUtcMs = Date.UTC(year, month - 1, day) - IST_OFFSET_MS
    const checkDate = new Date(checkDateUtcMs)
    const checkParts = getIstParts(checkDate)

    // For current month, don't flag future days as uninformed
    if (isCurrentMonth && checkDate > todayIstMidnight) break

    // v25·0806-fix: skip BOTH Saturday (6) and Sunday (0).
    // Previously only Sundays were skipped — Saturdays were wrongly
    // counted as uninformed for companies with weekends off.
    if (WEEKEND_DAYS.has(checkParts.dayOfWeek)) continue

    const checkDateStr = checkParts.dateStr
    const wasPresent = presentDates.has(checkDateStr)
    // v25·0806-fix: compare IST date strings (YYYY-MM-DD) instead of
    // Date objects — avoids UTC-vs-IST boundary errors.
    const wasOnLeave = approvedLeaveRanges.some(r =>
      checkDateStr >= r.fromStr && checkDateStr <= r.toStr
    )

    if (!wasPresent && !wasOnLeave) {
      uninformedLeaves++
      // Human-readable format for display
      uninformedDates.push(`${String(checkParts.day).padStart(2, '0')}/${String(checkParts.month).padStart(2, '0')}/${checkParts.year}`)
    }
  }

  // ─── Calculate Overall Score (out of 10) ───
  // v25·0806-out-of-10: Scoring is now OUT OF 10.
  //   Start at 10, apply deductions per the marking scheme.
  //   Final score is clamped between 0 and 10.
  //
  // v25·0806-progressive-scoring: PROGRESSIVE/TIERED deductions.
  //   Previous logic only had two thresholds per category (e.g. uninformed>1 → -1,
  //   uninformed>3 → -2, capped at -3 no matter how many). This meant someone with
  //   4 uninformed leaves and someone with 21 uninformed leaves got the SAME -3
  //   deduction — clearly wrong. Aayush had 21 uninformed leaves but scored 7/10
  //   (AVERAGE) which made no sense.
  //
  //   NEW progressive tiers — more violations = more deduction, no hard cap:
  //     UNINFORMED LEAVES:
  //       0-1   →  0
  //       2-3   → -1
  //       4-5   → -2
  //       6-8   → -3
  //       9-12  → -4
  //       13-17 → -5
  //       18+   → -6
  //     FULL DAY LEAVES:
  //       0-2   →  0
  //       3-5   → -1
  //       6-8   → -2
  //       9-12  → -3
  //       13+   → -4
  //     LATE/EARLY COMBINED:
  //       0-1   →  0
  //       2-4   → -1
  //       5-7   → -2
  //       8-10  → -3
  //       11+   → -4
  //     HALF DAYS:
  //       0-2   →  0
  //       3-4   → -1
  //       5-6   → -2
  //       7-8   → -3
  //       9+    → -4
  //
  //   Max possible total deduction = 6 + 4 + 4 + 4 = 18, but the final score
  //   is clamped to [0, 10] so it can never go negative.
  const baseScore = MAX_SCORE // Always starts at 10/10
  let deductions = 0
  const deductionDetails: string[] = []

  // Helper: progressive tier lookup
  const tierDeduction = (count: number, tiers: [number, number][]): number => {
    // tiers: array of [minCount, deduction] sorted ascending by minCount.
    // Returns the deduction for the highest tier whose minCount <= count.
    let ded = 0
    for (const [minCount, d] of tiers) {
      if (count >= minCount) ded = d
    }
    return ded
  }

  const uninfDed = tierDeduction(uninformedLeaves, [
    [2, 1], [4, 2], [6, 3], [9, 4], [13, 5], [18, 6],
  ])
  if (uninfDed > 0) {
    deductions += uninfDed
    deductionDetails.push(`-${uninfDed} (uninformed=${uninformedLeaves})`)
  }

  const leaveDed = tierDeduction(totalLeaveDays, [
    [3, 1], [6, 2], [9, 3], [13, 4],
  ])
  if (leaveDed > 0) {
    deductions += leaveDed
    deductionDetails.push(`-${leaveDed} (leaves=${totalLeaveDays})`)
  }

  const lateEarlyDed = tierDeduction(lateComingsEarlyGoings, [
    [2, 1], [5, 2], [8, 3], [11, 4],
  ])
  if (lateEarlyDed > 0) {
    deductions += lateEarlyDed
    deductionDetails.push(`-${lateEarlyDed} (late/early=${lateComingsEarlyGoings})`)
  }

  const halfDayDed = tierDeduction(halfDayLeaves, [
    [3, 1], [5, 2], [7, 3], [9, 4],
  ])
  if (halfDayDed > 0) {
    deductions += halfDayDed
    deductionDetails.push(`-${halfDayDed} (half days=${halfDayLeaves})`)
  }

  // Cap deductions: never let score go below 0 or above 10
  const overallScore = Math.max(0, Math.min(MAX_SCORE, baseScore - deductions))
  const isLowScore = overallScore < 7

  // ─── HRMS enrichment (salary, joining date, bank, etc.) ───
  const hrmsData = hrmsEmp ? {
    hrmsEmployeeId: hrmsEmp.employeeId,
    firm: hrmsEmp.firm,
    employmentType: hrmsEmp.employmentType,
    salaryType: hrmsEmp.salaryType,
    monthlySalary: hrmsEmp.monthlySalary,
    dailyRate: hrmsEmp.dailyRate,
    hourlyRate: hrmsEmp.hourlyRate,
    overtimeRate: hrmsEmp.overtimeRate,
    shiftStart: hrmsEmp.shiftStart,
    shiftEnd: hrmsEmp.shiftEnd,
    shiftHours: hrmsEmp.shiftHours,
    gender: hrmsEmp.gender,
    dateOfBirth: hrmsEmp.dateOfBirth,
    joiningDate: hrmsEmp.joiningDate,
    reportingManager: hrmsEmp.reportingManager,
    bankName: hrmsEmp.bankName,
    bankAccount: hrmsEmp.bankAccount,
    bankIfsc: hrmsEmp.bankIfsc,
    panNumber: hrmsEmp.panNumber,
    aadhaarNumber: hrmsEmp.aadhaarNumber,
    pfNumber: hrmsEmp.pfNumber,
    esiNumber: hrmsEmp.esiNumber,
    emergencyContact: hrmsEmp.emergencyContact,
    address: hrmsEmp.address,
    hrmsStatus: hrmsEmp.status,
  } : null

  return {
    sno: index + 1,
    id: user.id,
    name: user.name,
    designation: hrmsEmp?.designation || user.designation || '',
    department: hrmsEmp?.department || user.department || '',
    location: user.office?.city || user.location || hrmsEmp?.location || '',
    email: user.email,

    // Attendance stats
    fullDayLeaves,
    halfDayLeaves,
    uninformedLeaves,
    lateComings,
    earlyGoings,
    lateComingsEarlyGoings,

    // Detailed breakdown (for self-view)
    latePunchDetails,
    earlyPunchDetails,
    uninformedDates,

    // Scoring (out of 10)
    totalPresents,
    maxScore: MAX_SCORE,
    baseScore,
    deductions,
    deductionDetails,
    overallScore,
    overallScoreOutOf: MAX_SCORE,
    isLowScore,
    status: overallScore >= 8 ? 'GOOD' : overallScore >= 7 ? 'AVERAGE' : 'LOW',

    // HRMS enrichment
    hrms: hrmsData,
    joinDate: hrmsEmp?.joiningDate || user.joinDate || null,
  }
}

// ════════════════════════════════════════════════════════════════════════
// EXCEL — Admin view (1 sheet, professional & minimal)
// v25·0806-min: Trimmed per founder request.
//   • Single sheet: "HR Report" — clean header row, color-coded scores
//   Removed per founder request:
//     - Banner title row (was appearing as unnecessary image-like header)
//     - Sheet 2 (Employee Master)
//     - Sheet 3 (Scoring Rules)
//     - Sheet 4 (Location Summary)
//     - Sheet 5 (Report Info)
//     - Columns: Location, Firm, HRMS ID, Joining Date from main sheet
// ════════════════════════════════════════════════════════════════════════
async function buildAdminExcelResponse(report: any[], filters: { month: number; year: number; location: string }) {
  const { month, year, location } = filters
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const locationLabel = location && location !== 'all'
    ? (location.charAt(0).toUpperCase() + location.slice(1))
    : 'All Locations'

  // ─── Color palette ─────────────────────────────────────────────────────
  const C = {
    brandDark:   'FF4C1D95',
    brandMid:    'FF6D28D9',
    brandLight:  'FFEDE9FE',
    good:        'FF059669',
    goodBg:      'FFD1FAE5',
    warn:        'FFD97706',
    warnBg:      'FFFEF3C7',
    bad:         'FFDC2626',
    badBg:       'FFFEE2E2',
    textDark:    'FF1F2937',
    textMuted:   'FF6B7280',
    borderLight: 'FFE5E7EB',
    white:       'FFFFFFFF',
    zebra:       'FFF9FAFB',
    hdrBg:       'FF1F2937',
    accentGold:  'FFF59E0B',
  }

  const thin = { style: 'thin' as const, color: { argb: C.borderLight } }
  const borderAll = { top: thin, left: thin, bottom: thin, right: thin }
  const fontHdr = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } }
  const fontVal = { name: 'Calibri', size: 10, color: { argb: C.textDark } }
  const fontValBold = { name: 'Calibri', size: 10, bold: true, color: { argb: C.textDark } }
  const alignCenter = { vertical: 'middle' as const, horizontal: 'center' as const }
  const alignLeft = { vertical: 'middle' as const, horizontal: 'left' as const, indent: 1 }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Laxree ERP'
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 1: HR Report — Professional layout with logo header
  // Layout:
  //   Rows 1-4: Logo (cols A-B) | Title block (cols C-N)
  //   Row 5: spacer
  //   Row 6: Table header
  //   Row 7+: Data
  // ═══════════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('HR Report', {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false, ySplit: 6 }],
  })

  // Define columns (Location, Firm, HRMS ID, Joining Date removed per founder request)
  const cols = [
    { key: 'sno',           header: '#',                  width: 6 },
    { key: 'name',          header: 'Name of Employee',   width: 24 },
    { key: 'designation',   header: 'Designation',        width: 24 },
    { key: 'department',    header: 'Department',         width: 14 },
    { key: 'fullDayLeaves', header: 'Full Day Leaves',    width: 8 },
    { key: 'halfDayLeaves', header: 'Half Days',          width: 8 },
    { key: 'uninformed',    header: 'Uninformed',         width: 10 },
    { key: 'lateComings',   header: 'Late Comings',       width: 8 },
    { key: 'earlyGoings',   header: 'Early Goings',       width: 8 },
    { key: 'lateEarlyTot',  header: 'L/E Total',          width: 8 },
    { key: 'presents',      header: 'Presents',           width: 8 },
    { key: 'maxScore',      header: 'Max Score',          width: 8 },
    { key: 'deductions',    header: 'Deductions',         width: 10 },
    { key: 'score',         header: 'Score',              width: 10 },
    { key: 'status',        header: 'Status',             width: 10 },
  ]
  ws1.columns = cols

  // ─── BRANDED HEADER ROWS 1-4 ───────────────────────────────────────────
  // Logo image: rows 1-4 (4 rows tall), cols A-B (2 cols wide)
  // Title block: cols C-N (merged) — split into:
  //   Row 1-2: "LAXREE" small brand text (merged C1:N2)
  //   Row 3: "HR REPORT" big title (merged C3:N3)
  //   Row 4: "For the month of MONTH YEAR  ·  LOCATION" subtitle (merged C4:N4)

  // Load logo (try multiple paths for Vercel/local compat)
  let logoImageId: number | null = null
  try {
    const logoCandidates = [
      path.join(process.cwd(), 'public', 'laxree-logo-excel.png'),
      '/home/z/my-project/public/laxree-logo-excel.png',
    ]
    for (const logoPath of logoCandidates) {
      try {
        if (fs.existsSync(logoPath)) {
          const imgBuf = fs.readFileSync(logoPath)
          logoImageId = wb.addImage({ buffer: imgBuf as any, extension: 'png' })
          break
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[hr-report] Could not load logo image:', e)
  }

  // Set row heights for the header band (rows 1-4)
  ws1.getRow(1).height = 22
  ws1.getRow(2).height = 22
  ws1.getRow(3).height = 32
  ws1.getRow(4).height = 22
  ws1.getRow(5).height = 8 // spacer

  // Brand background fill for the header band (rows 1-4, cols A-N)
  const brandFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandDark } }
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws1.getCell(r, c)
      cell.fill = brandFill
      cell.border = { top: { style: 'thin', color: { argb: C.brandDark } },
                       left: { style: 'thin', color: { argb: C.brandDark } },
                       bottom: { style: 'thin', color: { argb: C.brandDark } },
                       right: { style: 'thin', color: { argb: C.brandDark } } }
    }
  }

  // Place the logo image (rows 1-4, cols A-B)
  if (logoImageId !== null) {
    ws1.addImage(logoImageId, {
      tl: { col: 0, row: 0 } as any,
      br: { col: 2, row: 4 } as any,
    })
  }

  // Title text in cols C-N (merged across all 12 remaining columns)
  // Row 1-2: small "LAXREE" brand text (spaced letters for elegant look)
  ws1.mergeCells(1, 3, 2, cols.length)
  const brandCell = ws1.getCell(1, 3)
  brandCell.value = 'L  A  X  R  E  E'
  brandCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.brandLight } }
  brandCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  brandCell.fill = brandFill

  // Row 3: "HR REPORT" big title
  ws1.mergeCells(3, 3, 3, cols.length)
  const titleCell = ws1.getCell(3, 3)
  titleCell.value = 'HR REPORT'
  titleCell.font = { name: 'Calibri', size: 28, bold: true, color: { argb: C.white } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  titleCell.fill = brandFill

  // Row 4: subtitle — month + location
  ws1.mergeCells(4, 3, 4, cols.length)
  const subCell = ws1.getCell(4, 3)
  subCell.value = `For the month of  ${monthLabel}   ·   ${locationLabel}`
  subCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.brandLight } }
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  subCell.fill = brandFill

  // Row 5: spacer (already set height 8 above) — leave as brand-colored strip
  for (let c = 1; c <= cols.length; c++) {
    ws1.getCell(5, c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandLight } } as any
  }

  // ─── TABLE HEADER (Row 6) ──────────────────────────────────────────────
  const HEADER_ROW = 6
  const hdrRow = ws1.getRow(HEADER_ROW)
  hdrRow.height = 32
  cols.forEach((c, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = c.header
    cell.font = fontHdr
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hdrBg } }
    cell.alignment = alignCenter
    cell.border = borderAll
  })

  // ─── DATA ROWS (Row 7+) ────────────────────────────────────────────────
  let rowIdx = HEADER_ROW + 1
  report.forEach((r, i) => {
    const isZebra = i % 2 === 1
    const rowBg = isZebra ? C.zebra : C.white

    const isLow = r.isLowScore
    const isAvg = !isLow && r.overallScore < 8
    const scoreColor = isLow ? C.bad : isAvg ? C.warn : C.good
    const scoreBg    = isLow ? C.badBg : isAvg ? C.warnBg : C.goodBg

    const rowData: any = {
      sno: i + 1,
      name: r.name,
      designation: r.designation,
      department: r.department,
      fullDayLeaves: r.fullDayLeaves,
      halfDayLeaves: r.halfDayLeaves,
      uninformed: r.uninformedLeaves,
      lateComings: r.lateComings,
      earlyGoings: r.earlyGoings,
      lateEarlyTot: r.lateComingsEarlyGoings,
      presents: r.totalPresents,
      maxScore: r.maxScore,
      deductions: `− ${r.deductions}`,
      score: r.overallScore,
      status: r.status,
    }
    const dataRow = ws1.getRow(rowIdx)
    dataRow.values = rowData
    dataRow.height = 20

    cols.forEach((c, ci) => {
      const cell = dataRow.getCell(ci + 1)
      cell.border = borderAll
      cell.alignment = alignCenter
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }

      if (c.key === 'name') {
        cell.font = fontValBold
        cell.alignment = alignLeft
      } else if (c.key === 'designation') {
        cell.font = fontVal
        cell.alignment = alignLeft
      } else if (c.key === 'score' || c.key === 'status') {
        cell.font = { ...fontValBold, color: { argb: scoreColor } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreBg } }
      } else if (c.key === 'deductions') {
        const hasDeduct = r.deductions > 0
        cell.font = { ...fontValBold, color: { argb: hasDeduct ? C.bad : C.textMuted } }
      } else if (['fullDayLeaves', 'halfDayLeaves', 'uninformed', 'lateComings', 'earlyGoings'].includes(c.key)) {
        const val = (cell.value as number) || 0
        if (val > 0) cell.font = { ...fontValBold, color: { argb: C.warn } }
        else cell.font = fontVal
      } else {
        cell.font = fontVal
      }
    })
    rowIdx++
  })

  // ─── FOOTER ROW ────────────────────────────────────────────────────────
  const footerRow = rowIdx
  ws1.mergeCells(footerRow, 1, footerRow, cols.length)
  const footCell = ws1.getCell(footerRow, 1)
  const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  footCell.value = `Generated on ${generatedAt} IST  ·  Laxree ERP  ·  Confidential — for internal use only`
  footCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.textMuted } }
  footCell.alignment = { vertical: 'middle', horizontal: 'center' }
  footCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandLight } }
  ws1.getRow(footerRow).height = 22

  // Freeze the header (everything above row 7 stays put when scrolling)
  ws1.views = [{ showGridLines: false, ySplit: HEADER_ROW, xSplit: 0 }]

  // Auto-filter on the table header row (row 6)
  ws1.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: cols.length },
  }

  // ─── Write buffer & respond ────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  const filename = `Laxree_HR_Report_${year}_${String(month).padStart(2, '0')}_${location}.xlsx`
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ════════════════════════════════════════════════════════════════════════
// EXCEL — Self view (employee's personal HR report)
// v25·0806-pro: Redesigned with ExcelJS for eye-catching, professional output.
//   • Sheet 1: My HR Summary — branded header, identity block, attendance
//               & score sections (NO SALARY section per founder request)
//   • Sheet 2: Late-Early Details — color-coded table
//   • Sheet 3: Uninformed Dates — clean table
//   (Scoring Rules sheet removed per founder request)
// ════════════════════════════════════════════════════════════════════════
async function buildSelfExcelResponse(selfReport: any, month: number, year: number) {
  const emp = selfReport.employee
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // ─── Color palette ─────────────────────────────────────────────────────
  const C = {
    brandDark:   'FF4C1D95',   // deep indigo (title bar)
    brandMid:    'FF6D28D9',   // mid purple (sub-bar)
    brandLight:  'FFEDE9FE',   // very light purple (zebra)
    identityBg:  'FFF5F3FF',   // identity block bg
    attendanceBg:'FFE0F2FE',   // light blue (attendance section bg)
    attendanceHd:'FF0EA5E9',   // blue (attendance section header)
    scoreBg:     'FFFEF3C7',   // light amber (score section bg)
    scoreHd:     'FFD97706',   // amber (score section header)
    good:        'FF059669',   // green
    goodBg:      'FFD1FAE5',
    warn:        'FFD97706',
    warnBg:      'FFFEF3C7',
    bad:         'FFDC2626',
    badBg:       'FFFEE2E2',
    textDark:    'FF1F2937',
    textMuted:   'FF6B7280',
    borderLight: 'FFE5E7EB',
    white:       'FFFFFFFF',
    zebra:       'FFF9FAFB',
    lateRed:     'FFDC2626',
    earlyBlue:   'FF0EA5E9',
  }

  // ─── Reusable style fragments ──────────────────────────────────────────
  const thin = { style: 'thin' as const, color: { argb: C.borderLight } }
  const borderAll = { top: thin, left: thin, bottom: thin, right: thin }
  const fontHdr = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } }
  const fontLabel = { name: 'Calibri', size: 10, bold: true, color: { argb: C.textMuted } }
  const fontVal = { name: 'Calibri', size: 11, color: { argb: C.textDark } }
  const fontValBold = { name: 'Calibri', size: 11, bold: true, color: { argb: C.textDark } }
  const alignLeft = { vertical: 'middle' as const, horizontal: 'left' as const, indent: 1 }
  const alignCenter = { vertical: 'middle' as const, horizontal: 'center' as const }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Laxree ERP'
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 1: My HR Summary
  // ═══════════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('My HR Summary', {
    properties: { defaultRowHeight: 20 },
    views: [{ showGridLines: false }],
  })
  // v25·0807-fix: Removed empty logo column (was causing empty space on the
  // left side of every row below the title). Now layout uses only 2 main cols:
  //   A: label column (also hosts the logo image at the top, rows 2-3)
  //   B: value column (widened to 50 to fit long values like firm names)
  //   C: thin right margin
  ws1.columns = [
    { width: 26 },   // A: label / logo column
    { width: 50 },   // B: value column (wide for long text)
    { width: 3 },    // C: thin margin
  ]

  // Load logo image (try multiple paths for Vercel/local compat)
  let logoImageId: number | null = null
  try {
    const logoCandidates = [
      path.join(process.cwd(), 'public', 'laxree-logo-excel.png'),
      '/home/z/my-project/public/laxree-logo-excel.png',
    ]
    for (const logoPath of logoCandidates) {
      try {
        if (fs.existsSync(logoPath)) {
          const imgBuf = fs.readFileSync(logoPath)
          logoImageId = wb.addImage({ buffer: imgBuf as any, extension: 'png' })
          break
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[hr-report:self] Could not load logo image:', e)
  }

  // Row 1: spacer (thin)
  ws1.addRow([])
  ws1.getRow(1).height = 8

  // Row 2: Title bar — "MY HR REPORT" in B2 + Logo overlay in A2:A3
  // (Logo image sits on top of A2:A3, title text fills B2 — both get brand bg)
  const tCell = ws1.getCell('B2')
  tCell.value = 'MY HR REPORT'
  tCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: C.white } }
  tCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandDark } } as any
  tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  // Brand bg in column A (logo sits on top)
  const aCell2 = ws1.getCell('A2')
  aCell2.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandDark } } as any
  // Margin column C also gets brand bg so the bar looks continuous
  ws1.getCell('C2').fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandDark } } as any
  ws1.getRow(2).height = 40

  // Row 3: Subtitle — employee name + period (in B3) + brand bg in A3 & C3
  const sCell = ws1.getCell('B3')
  sCell.value = `${emp.name || '—'}  ·  ${monthLabel}`
  sCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.white } }
  sCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandMid } } as any
  sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  const aCell3 = ws1.getCell('A3')
  aCell3.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandMid } } as any
  ws1.getCell('C3').fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: C.brandMid } } as any
  ws1.getRow(3).height = 26

  // Place the logo image spanning A2:A3 (col 0 → 1, rows 1 → 3)
  if (logoImageId !== null) {
    ws1.addImage(logoImageId, {
      tl: { col: 0, row: 1 } as any,
      br: { col: 1, row: 3 } as any,
    })
  }

  // Row 4: spacer
  ws1.addRow([])
  ws1.getRow(4).height = 8

  // ─── IDENTITY BLOCK ────────────────────────────────────────────────────
  // Row 5: section header "EMPLOYEE INFORMATION" merged across A5:B5
  ws1.mergeCells('A5:B5')
  const idHdr = ws1.getCell('A5')
  idHdr.value = '👤  EMPLOYEE INFORMATION'
  idHdr.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.brandDark } }
  idHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandLight } }
  idHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  idHdr.border = borderAll
  ws1.getCell('B5').border = borderAll
  ws1.getRow(5).height = 24

  const identityRows: [string, any][] = [
    ['Full Name',         emp.name || '—'],
    ['Designation',       emp.designation || '—'],
    ['Department',        emp.department || '—'],
    ['Location',          emp.location || '—'],
    ['HRMS Employee ID',  emp.hrms?.hrmsEmployeeId || '—'],
    ['Firm',              emp.hrms?.firm || '—'],
    ['Employment Type',   emp.hrms?.employmentType || '—'],
  ]
  let r = 6
  for (const [label, value] of identityRows) {
    const aCellL = ws1.getCell(`A${r}`)
    const bCellV = ws1.getCell(`B${r}`)
    aCellL.value = label
    aCellL.font = fontLabel
    aCellL.alignment = alignLeft
    aCellL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.identityBg } }
    aCellL.border = borderAll
    bCellV.value = value ?? '—'
    bCellV.font = fontValBold
    bCellV.alignment = alignLeft
    bCellV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } }
    bCellV.border = borderAll
    ws1.getRow(r).height = 20
    r++
  }

  // spacer
  ws1.addRow([])
  ws1.getRow(r).height = 8
  r++

  // ─── ATTENDANCE SECTION ────────────────────────────────────────────────
  ws1.mergeCells(`A${r}:B${r}`)
  const atHdr = ws1.getCell(`A${r}`)
  atHdr.value = '✅  ATTENDANCE'
  atHdr.font = fontHdr
  atHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.attendanceHd } }
  atHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  atHdr.border = borderAll
  ws1.getCell(`B${r}`).border = borderAll
  ws1.getRow(r).height = 24
  r++

  const attendanceRows: [string, any, boolean?][] = [
    ['Month',              `${monthLabel}`, false],
    ['Total Presents',     emp.totalPresents, false],
    ['Full Day Leaves',    emp.fullDayLeaves, emp.fullDayLeaves > 2],
    ['Half Days',          emp.halfDayLeaves, emp.halfDayLeaves > 2],
    ['Uninformed Leaves',  emp.uninformedLeaves, emp.uninformedLeaves > 1],
    ['Late Comings',       emp.lateComings, emp.lateComings > 1],
    ['Early Goings',       emp.earlyGoings, emp.earlyGoings > 1],
    ['Late/Early Total',   emp.lateComingsEarlyGoings, false],
  ]
  for (const [label, value, warn] of attendanceRows) {
    const aCellL = ws1.getCell(`A${r}`)
    const bCellV = ws1.getCell(`B${r}`)
    aCellL.value = label
    aCellL.font = fontLabel
    aCellL.alignment = alignLeft
    aCellL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.attendanceBg } }
    aCellL.border = borderAll
    bCellV.value = value ?? '—'
    bCellV.font = warn ? { ...fontValBold, color: { argb: C.bad } } : fontValBold
    bCellV.alignment = alignLeft
    bCellV.fill = { type: 'pattern', pattern: 'solid', fgColor: warn ? { argb: C.badBg } : { argb: C.white } }
    bCellV.border = borderAll
    ws1.getRow(r).height = 20
    r++
  }

  // spacer
  ws1.addRow([])
  ws1.getRow(r).height = 8
  r++

  // ─── SCORE SECTION ─────────────────────────────────────────────────────
  ws1.mergeCells(`A${r}:B${r}`)
  const scHdr = ws1.getCell(`A${r}`)
  scHdr.value = '🎯  SCORE'
  scHdr.font = fontHdr
  scHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.scoreHd } }
  scHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  scHdr.border = borderAll
  ws1.getCell(`B${r}`).border = borderAll
  ws1.getRow(r).height = 24
  r++

  const scoreRows: [string, any][] = [
    ['Starting Score (Max)', emp.maxScore || 10],
    ['Deductions', `− ${emp.deductions}`],
    ['Overall Score', emp.overallScore],
    ['Status', emp.status],
  ]
  for (const [label, value] of scoreRows) {
    const aCellL = ws1.getCell(`A${r}`)
    const bCellV = ws1.getCell(`B${r}`)
    aCellL.value = label
    aCellL.font = fontLabel
    aCellL.alignment = alignLeft
    aCellL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.scoreBg } }
    aCellL.border = borderAll

    bCellV.value = value ?? '—'
    bCellV.alignment = alignLeft

    // Highlight overall score row specially
    if (label === 'Overall Score') {
      const isLow = emp.isLowScore
      const isAvg = !isLow && emp.overallScore < 8
      const color = isLow ? C.bad : isAvg ? C.warn : C.good
      const bg    = isLow ? C.badBg : isAvg ? C.warnBg : C.goodBg
      bCellV.font = { name: 'Calibri', size: 14, bold: true, color: { argb: color } }
      bCellV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      ws1.getRow(r).height = 26
    } else if (label === 'Status') {
      const isLow = emp.isLowScore
      const isAvg = !isLow && emp.overallScore < 8
      const color = isLow ? C.bad : isAvg ? C.warn : C.good
      bCellV.font = { ...fontValBold, color: { argb: color } }
      bCellV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } }
      ws1.getRow(r).height = 20
    } else {
      bCellV.font = fontValBold
      bCellV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } }
      ws1.getRow(r).height = 20
    }
    bCellV.border = borderAll
    r++
  }

  // spacer + footer
  ws1.addRow([])
  ws1.getRow(r).height = 8
  r++
  ws1.mergeCells(`A${r}:B${r}`)
  const foot = ws1.getCell(`A${r}`)
  foot.value = `Generated on ${new Date().toLocaleString('en-IN')} · Laxree ERP · HRMS-synced`
  foot.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.textMuted } }
  foot.alignment = { vertical: 'middle', horizontal: 'center' }
  ws1.getRow(r).height = 18

  // Freeze title rows
  ws1.views = [{ showGridLines: false, ySplit: 4 }]

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 2: Late-Early Details
  // ═══════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Late-Early Details', {
    properties: { defaultRowHeight: 20 },
    views: [{ showGridLines: false, ySplit: 3 }],
  })
  ws2.columns = [
    { width: 4 },   // A spacer
    { width: 8 },   // B S.No
    { width: 16 },  // C Type
    { width: 16 },  // D Date
    { width: 14 },  // E Time
    { width: 16 },  // F Minutes
    { width: 4 },   // G spacer
  ]

  // Title
  ws2.mergeCells('B2:F2')
  const t2 = ws2.getCell('B2')
  t2.value = 'LATE COMINGS & EARLY GOINGS'
  t2.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.white } }
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandDark } }
  t2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws2.getRow(2).height = 32

  ws2.mergeCells('B3:F3')
  const s2 = ws2.getCell('B3')
  s2.value = `${emp.name}  ·  ${monthLabel}`
  s2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } }
  s2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandMid } }
  s2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws2.getRow(3).height = 20

  // Header row
  const hdrs = ['#', 'Type', 'Date', 'Time', 'Minutes']
  const hdrRow = ws2.getRow(5)
  hdrs.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 2) // start at col B
    cell.value = h
    cell.font = fontHdr
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandMid } }
    cell.alignment = alignCenter
    cell.border = borderAll
  })
  ws2.getRow(5).height = 24

  const lateList = (emp.latePunchDetails || []).map((d: any, i: number) => ({
    sno: i + 1,
    type: 'LATE COMING',
    date: d.date,
    time: d.punchIn,
    minutes: `+${d.minutesLate} min`,
    color: C.lateRed,
    bg: C.badBg,
  }))
  const earlyList = (emp.earlyPunchDetails || []).map((d: any, i: number) => ({
    sno: lateList.length + i + 1,
    type: 'EARLY GOING',
    date: d.date,
    time: d.punchOut,
    minutes: `−${d.minutesEarly} min`,
    color: C.earlyBlue,
    bg: C.attendanceBg,
  }))
  const allRows = [...lateList, ...earlyList]

  if (allRows.length === 0) {
    ws2.mergeCells('B6:F6')
    const empty = ws2.getCell('B6')
    empty.value = '✓  No late comings or early goings this month — perfect attendance!'
    empty.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.good } }
    empty.alignment = { vertical: 'middle', horizontal: 'center' }
    empty.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.goodBg } }
    empty.border = borderAll
    ws2.getRow(6).height = 30
  } else {
    let rowIdx = 6
    allRows.forEach((row, i) => {
      const isZebra = i % 2 === 1
      const rowBg = isZebra ? C.zebra : C.white
      const dataRow = ws2.getRow(rowIdx)
      const cells = [
        { v: row.sno,    f: { ...fontValBold, color: { argb: C.textMuted } }, bg: rowBg, a: alignCenter },
        { v: row.type,   f: { ...fontValBold, color: { argb: row.color } },   bg: row.bg, a: alignCenter },
        { v: row.date,   f: fontVal,                                          bg: rowBg, a: alignCenter },
        { v: row.time,   f: fontVal,                                          bg: rowBg, a: alignCenter },
        { v: row.minutes, f: { ...fontValBold, color: { argb: row.color } },  bg: rowBg, a: alignCenter },
      ]
      cells.forEach((c, ci) => {
        const cell = dataRow.getCell(ci + 2)
        cell.value = c.v
        cell.font = c.f
        cell.alignment = c.a
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } }
        cell.border = borderAll
      })
      ws2.getRow(rowIdx).height = 20
      rowIdx++
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 3: Uninformed Dates
  // ═══════════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Uninformed Dates', {
    properties: { defaultRowHeight: 20 },
    views: [{ showGridLines: false, ySplit: 3 }],
  })
  ws3.columns = [
    { width: 4 },   // A spacer
    { width: 8 },   // B S.No
    { width: 22 },  // C Date
    { width: 56 },  // D Status
    { width: 4 },   // E spacer
  ]

  // Title
  ws3.mergeCells('B2:D2')
  const t3 = ws3.getCell('B2')
  t3.value = 'UNINFORMED LEAVE DATES'
  t3.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.white } }
  t3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandDark } }
  t3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws3.getRow(2).height = 32

  ws3.mergeCells('B3:D3')
  const s3 = ws3.getCell('B3')
  s3.value = `${emp.name}  ·  ${monthLabel}`
  s3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } }
  s3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandMid } }
  s3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws3.getRow(3).height = 20

  // Header
  const hdrs3 = ['#', 'Date', 'Status']
  const hdrRow3 = ws3.getRow(5)
  hdrs3.forEach((h, i) => {
    const cell = hdrRow3.getCell(i + 2)
    cell.value = h
    cell.font = fontHdr
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brandMid } }
    cell.alignment = alignCenter
    cell.border = borderAll
  })
  ws3.getRow(5).height = 24

  const uninfList = emp.uninformedDates || []
  if (uninfList.length === 0) {
    ws3.mergeCells('B6:D6')
    const empty = ws3.getCell('B6')
    empty.value = '✓  No uninformed leaves this month'
    empty.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.good } }
    empty.alignment = { vertical: 'middle', horizontal: 'center' }
    empty.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.goodBg } }
    empty.border = borderAll
    ws3.getRow(6).height = 30
  } else {
    let rowIdx = 6
    uninfList.forEach((d: string, i: number) => {
      const isZebra = i % 2 === 1
      const rowBg = isZebra ? C.zebra : C.white
      const dataRow = ws3.getRow(rowIdx)
      const cells = [
        { v: i + 1, f: { ...fontValBold, color: { argb: C.textMuted } }, bg: rowBg },
        { v: d,     f: fontValBold,                                       bg: rowBg },
        { v: 'Uninformed (no punch + no approved leave)', f: { ...fontVal, color: { argb: C.bad } }, bg: rowBg },
      ]
      cells.forEach((c, ci) => {
        const cell = dataRow.getCell(ci + 2)
        cell.value = c.v
        cell.font = c.f
        cell.alignment = alignCenter
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } }
        cell.border = borderAll
      })
      ws3.getRow(rowIdx).height = 20
      rowIdx++
    })
  }

  // ─── Write buffer & respond ────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  const filename = `My_HR_Report_${year}_${String(month).padStart(2, '0')}.xlsx`
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
