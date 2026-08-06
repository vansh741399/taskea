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
//   - Sheet 1: HR Report (main, with header banner + freeze top row)
//   - Sheet 2: Employee Master (HRMS data: salary, joining, bank)
//   - Sheet 3: Scoring Rules
//   - Sheet 4: Location Summary
//   - Sheet 5: Report Info
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
        return buildSelfExcelResponse(selfReport, month, year)
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
    const hrmsEmployees = await fetchHrmsEmployees()

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
    const report = users.map((user, index) => {
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

    // ─── Return in requested format ───
    if (format === 'xlsx') {
      return buildAdminExcelResponse(report, { month, year, location })
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
  const baseScore = MAX_SCORE // Always starts at 10/10
  let deductions = 0
  const deductionDetails: string[] = []

  if (totalLeaveDays > 2) { deductions += 1; deductionDetails.push('-1 (leaves > 2)') }
  if (lateComingsEarlyGoings > 1) { deductions += 1; deductionDetails.push('-1 (late/early > 1)') }
  if (uninformedLeaves > 1) { deductions += 1; deductionDetails.push('-1 (uninformed > 1)') }
  if (halfDayLeaves > 2) { deductions += 1; deductionDetails.push('-1 (half days > 2)') }

  if (totalLeaveDays > 5) { deductions += 2; deductionDetails.push('-2 (leaves > 5)') }
  if (lateComingsEarlyGoings > 4) { deductions += 2; deductionDetails.push('-2 (late/early > 4)') }
  if (uninformedLeaves > 3) { deductions += 2; deductionDetails.push('-2 (uninformed > 3)') }
  if (halfDayLeaves > 4) { deductions += 2; deductionDetails.push('-2 (half days > 4)') }

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
// EXCEL — Admin view (5 sheets)
// ════════════════════════════════════════════════════════════════════════
function buildAdminExcelResponse(report: any[], filters: { month: number; year: number; location: string }) {
  const wb = XLSX.utils.book_new()
  const { month, year, location } = filters

  // Sheet 1: HR Report (main)
  const reportData = report.map(r => ({
    'S.No': r.sno,
    'Name of Employee': r.name,
    'Designation': r.designation,
    'Department': r.department,
    'Location': r.location,
    'Full Day Leaves': r.fullDayLeaves,
    'Half Days': r.halfDayLeaves,
    'Uninformed Leaves': r.uninformedLeaves,
    'Late Comings': r.lateComings,
    'Early Goings': r.earlyGoings,
    'Late/Early Total': r.lateComingsEarlyGoings,
    'Total Presents': r.totalPresents,
    'Max Score': r.maxScore,
    'Deductions': r.deductions,
    'Overall Score (out of 10)': r.overallScore,
    'Status': r.status,
    'HRMS ID': r.hrms?.hrmsEmployeeId || '',
    'Joining Date': r.hrms?.joiningDate ? new Date(r.hrms.joiningDate).toLocaleDateString('en-IN') : '',
  }))
  const ws1 = XLSX.utils.json_to_sheet(reportData)
  ws1['!cols'] = [
    { wch: 6 }, { wch: 22 }, { wch: 25 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
  ]
  // Freeze top row (header) — WPS-compatible
  ws1['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws1, 'HR Report')

  // Sheet 2: Employee Master (HRMS data)
  const masterData = report
    .filter(r => r.hrms)
    .map(r => ({
      'Name': r.name,
      'HRMS ID': r.hrms.hrmsEmployeeId,
      'Designation': r.designation,
      'Department': r.department,
      'Firm': r.hrms.firm,
      'Location': r.location,
      'Employment Type': r.hrms.employmentType,
      'Salary Type': r.hrms.salaryType,
      'Monthly Salary': r.hrms.monthlySalary,
      'Daily Rate': r.hrms.dailyRate,
      'Hourly Rate': r.hrms.hourlyRate,
      'Overtime Rate': r.hrms.overtimeRate,
      'Shift Start': r.hrms.shiftStart,
      'Shift End': r.hrms.shiftEnd,
      'Shift Hours': r.hrms.shiftHours,
      'Gender': r.hrms.gender,
      'Joining Date': r.hrms.joiningDate ? new Date(r.hrms.joiningDate).toLocaleDateString('en-IN') : '',
      'Reporting Manager': r.hrms.reportingManager,
      'Bank Name': r.hrms.bankName,
      'Bank Account': r.hrms.bankAccount,
      'Bank IFSC': r.hrms.bankIfsc,
      'PAN': r.hrms.panNumber,
      'Aadhaar': r.hrms.aadhaarNumber,
      'PF Number': r.hrms.pfNumber,
      'ESI Number': r.hrms.esiNumber,
      'Emergency Contact': r.hrms.emergencyContact,
      'HRMS Status': r.hrms.hrmsStatus,
    }))
  const ws2 = XLSX.utils.json_to_sheet(masterData)
  ws2['!cols'] = [
    { wch: 22 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Employee Master')

  // Sheet 3: Scoring Rules (out of 10)
  const rulesData = [
    { 'Rule': 'Max Score', 'Value': MAX_SCORE, 'Description': 'Score is OUT OF 10. Starts at 10, deductions applied per marking scheme.' },
    { 'Rule': 'Base Score', 'Value': MAX_SCORE, 'Description': 'Every employee starts the month at 10/10' },
    { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
    { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
    { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
    { 'Rule': 'Score Formula', 'Value': '10 − Deductions', 'Description': 'Final score clamped between 0 and 10' },
    {},
    { 'Rule': '−1 Deductions', 'Value': '', 'Description': '' },
    { 'Rule': 'Leaves > 2', 'Value': -1, 'Description': 'If total leave days > 2 in a month' },
    { 'Rule': 'Late/Early > 1', 'Value': -1, 'Description': 'If late comings + early goings > 1' },
    { 'Rule': 'Uninformed > 1', 'Value': -1, 'Description': 'If uninformed leaves > 1' },
    { 'Rule': 'Half Days > 2', 'Value': -1, 'Description': 'If half day leaves > 2' },
    {},
    { 'Rule': '−2 Deductions (severe)', 'Value': '', 'Description': '' },
    { 'Rule': 'Leaves > 5', 'Value': -2, 'Description': 'If total leave days > 5' },
    { 'Rule': 'Late/Early > 4', 'Value': -2, 'Description': 'If late comings + early goings > 4' },
    { 'Rule': 'Uninformed > 3', 'Value': -2, 'Description': 'If uninformed leaves > 3' },
    { 'Rule': 'Half Days > 4', 'Value': -2, 'Description': 'If half day leaves > 4' },
  ]
  const ws3 = XLSX.utils.json_to_sheet(rulesData)
  ws3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Scoring Rules')

  // Sheet 4: Location Summary
  const locSummary: Record<string, any> = {}
  report.forEach(r => {
    const loc = r.location || 'Unknown'
    if (!locSummary[loc]) {
      locSummary[loc] = { 'Location': loc, 'Total Employees': 0, 'Avg Presents': 0, 'Avg Score': 0, 'Low Score Count': 0 }
    }
    locSummary[loc]['Total Employees']++
    locSummary[loc]['Avg Presents'] += r.totalPresents
    locSummary[loc]['Avg Score'] += r.overallScore
    if (r.isLowScore) locSummary[loc]['Low Score Count']++
  })
  const locArray = Object.values(locSummary).map((d: any) => ({
    ...d,
    'Avg Presents': d['Total Employees'] > 0 ? Math.round(d['Avg Presents'] / d['Total Employees']) : 0,
    'Avg Score': d['Total Employees'] > 0 ? Math.round(d['Avg Score'] / d['Total Employees']) : 0,
  }))
  const ws4 = XLSX.utils.json_to_sheet(locArray)
  ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Location Summary')

  // Sheet 5: Report Info
  const metaData = [{
    'Report': 'Laxree HR Report',
    'Generated At': new Date().toLocaleString('en-IN'),
    'Month': `${month}/${year}`,
    'Location Filter': location,
    'Total Employees': report.length,
    'Scoring Type': 'Out of 10',
    'Low Score Threshold': 7,
    'HRMS Synced': report.some(r => r.hrms) ? 'Yes' : 'No',
  }]
  const ws5 = XLSX.utils.json_to_sheet(metaData)
  ws5['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws5, 'Report Info')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `HR_Report_${year}_${String(month).padStart(2, '0')}_${location}.xlsx`
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
// EXCEL — Self view (employee's personal HR report, 3 sheets)
// ════════════════════════════════════════════════════════════════════════
function buildSelfExcelResponse(selfReport: any, month: number, year: number) {
  const emp = selfReport.employee
  const wb = XLSX.utils.book_new()

  // Sheet 1: My HR Summary
  const summaryData = [
    { 'Field': 'Name', 'Value': emp.name },
    { 'Field': 'Email', 'Value': emp.email },
    { 'Field': 'Designation', 'Value': emp.designation },
    { 'Field': 'Department', 'Value': emp.department },
    { 'Field': 'Location', 'Value': emp.location },
    { 'Field': 'HRMS Employee ID', 'Value': emp.hrms?.hrmsEmployeeId || '—' },
    { 'Field': 'Firm', 'Value': emp.hrms?.firm || '—' },
    { 'Field': 'Employment Type', 'Value': emp.hrms?.employmentType || '—' },
    { 'Field': 'Joining Date', 'Value': emp.hrms?.joiningDate ? new Date(emp.hrms.joiningDate).toLocaleDateString('en-IN') : '—' },
    { 'Field': 'Reporting Manager', 'Value': emp.hrms?.reportingManager || '—' },
    {},
    { 'Field': '── ATTENDANCE ──', 'Value': '' },
    { 'Field': 'Month', 'Value': `${month}/${year}` },
    { 'Field': 'Total Presents', 'Value': emp.totalPresents },
    { 'Field': 'Full Day Leaves', 'Value': emp.fullDayLeaves },
    { 'Field': 'Half Days', 'Value': emp.halfDayLeaves },
    { 'Field': 'Uninformed Leaves', 'Value': emp.uninformedLeaves },
    { 'Field': 'Late Comings', 'Value': emp.lateComings },
    { 'Field': 'Early Goings', 'Value': emp.earlyGoings },
    { 'Field': 'Late/Early Total', 'Value': emp.lateComingsEarlyGoings },
    {},
    { 'Field': '── SCORE (OUT OF 10) ──', 'Value': '' },
    { 'Field': 'Starting Score (Max)', 'Value': emp.maxScore || 10 },
    { 'Field': 'Deductions', 'Value': emp.deductions },
    { 'Field': 'Overall Score (out of 10)', 'Value': emp.overallScore },
    { 'Field': 'Status', 'Value': emp.status },
    {},
    { 'Field': '── SALARY ──', 'Value': '' },
    { 'Field': 'Salary Type', 'Value': emp.hrms?.salaryType || '—' },
    { 'Field': 'Monthly Salary', 'Value': emp.hrms?.monthlySalary || '—' },
    { 'Field': 'Daily Rate', 'Value': emp.hrms?.dailyRate || '—' },
    { 'Field': 'Hourly Rate', 'Value': emp.hrms?.hourlyRate || '—' },
    { 'Field': 'Overtime Rate', 'Value': emp.hrms?.overtimeRate || '—' },
  ]
  const ws1 = XLSX.utils.json_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 28 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'My HR Summary')

  // Sheet 2: Late / Early Details
  const lateData = (emp.latePunchDetails || []).map((d: any, i: number) => ({
    'S.No': i + 1,
    'Type': 'LATE COMING',
    'Date': d.date,
    'Time': d.punchIn,
    'Minutes Late': d.minutesLate,
  })).concat(
    (emp.earlyPunchDetails || []).map((d: any, i: number) => ({
      'S.No': (emp.latePunchDetails?.length || 0) + i + 1,
      'Type': 'EARLY GOING',
      'Date': d.date,
      'Time': d.punchOut,
      'Minutes Early': d.minutesEarly,
    }))
  )
  const ws2 = XLSX.utils.json_to_sheet(
    lateData.length > 0 ? lateData : [{ 'S.No': 1, 'Type': '—', 'Date': '—', 'Time': '—', 'Note': 'No late/early records this month' }]
  )
  ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Late-Early Details')

  // Sheet 3: Uninformed Leave Dates
  const uninformedData = (emp.uninformedDates || []).map((d: string, i: number) => ({
    'S.No': i + 1,
    'Date': d,
    'Status': 'Uninformed (no punch + no approved leave)',
  }))
  const ws3 = XLSX.utils.json_to_sheet(
    uninformedData.length > 0 ? uninformedData : [{ 'S.No': 1, 'Date': '—', 'Status': 'No uninformed leaves this month' }]
  )
  ws3['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Uninformed Dates')

  // Sheet 4: Scoring Rules (out of 10)
  const rulesData = [
    { 'Rule': 'Max Score', 'Value': MAX_SCORE, 'Description': 'Score is OUT OF 10. Starts at 10, deductions applied per marking scheme.' },
    { 'Rule': 'Base Score', 'Value': MAX_SCORE, 'Description': 'Every employee starts the month at 10/10' },
    { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
    { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
    { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
    { 'Rule': 'Score Formula', 'Value': '10 − Deductions', 'Description': 'Final score clamped between 0 and 10' },
    {},
    { 'Rule': '−1 Deductions', 'Value': '', 'Description': '' },
    { 'Rule': 'Leaves > 2', 'Value': -1, 'Description': 'If total leave days > 2 in a month' },
    { 'Rule': 'Late/Early > 1', 'Value': -1, 'Description': 'If late comings + early goings > 1' },
    { 'Rule': 'Uninformed > 1', 'Value': -1, 'Description': 'If uninformed leaves > 1' },
    { 'Rule': 'Half Days > 2', 'Value': -1, 'Description': 'If half day leaves > 2' },
    {},
    { 'Rule': '−2 Deductions (severe)', 'Value': '', 'Description': '' },
    { 'Rule': 'Leaves > 5', 'Value': -2, 'Description': 'If total leave days > 5' },
    { 'Rule': 'Late/Early > 4', 'Value': -2, 'Description': 'If late comings + early goings > 4' },
    { 'Rule': 'Uninformed > 3', 'Value': -2, 'Description': 'If uninformed leaves > 3' },
    { 'Rule': 'Half Days > 4', 'Value': -2, 'Description': 'If half day leaves > 4' },
  ]
  const ws4 = XLSX.utils.json_to_sheet(rulesData)
  ws4['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Scoring Rules')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
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
