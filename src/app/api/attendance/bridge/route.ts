import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchHrmsEmployees,
  fetchHrmsLeaves,
  findHrmsEmployeeByHrmsId,
  findHrmsEmployeeByName,
  type HrmsEmployee,
} from '@/lib/hrms-client'
import {
  fetchHrmsAttendanceByEmployee,
  isHrmsDbConfigured,
} from '@/lib/hrms-db'

// ════════════════════════════════════════════════════════════════════════
// v25·0806-fix — ATTENDANCE BRIDGE (LOCAL COMPUTATION)
// ════════════════════════════════════════════════════════════════════════
// PREVIOUS DESIGN (BROKEN):
//   Called HRMS /api/external/attendance with header `x-hrms-api-key`
//   requiring a shared HRMS_BRIDGE_API_KEY env var on BOTH apps. The key
//   was never set on the ERP Vercel project, so every employee saw the
//   "HRMS bridge is not configured yet" banner in the Attendance tab and
//   could NOT see their live attendance.
//
// NEW DESIGN (FIXED — mirrors the salary-slip bridge fix):
//   Computes the attendance locally in the ERP using:
//     1. HRMS employee master data — fetched via /api/employees with the
//        ALREADY-WORKING HRMS_ACCESS_TOKEN (Bearer auth). No new env var
//        needed. We use this to identify the employee + resolve their
//        shift, location, and firm info.
//     2. ERP punch records for the user (PunchRecord table) — the source
//        of truth for attendance since the punch-in feature went live on
//        2026-08-01.
//     3. ERP + HRMS leaves (read-only GET /api/leaves with Bearer token)
//        so days off show up correctly even before ERP punch feature.
//     4. Hardcoded shift (10:00–19:00 IST, 15-min grace, Sat+Sun weekend).
//
// SAFETY: PURELY READ-ONLY. NEVER writes to either database. No DELETE,
// no UPDATE, no UPSERT. Only Prisma findMany calls + HRMS GET fetches.
//
// RESPONSE SHAPE (unchanged from v1 — frontend doesn't need changes):
//   {
//     configured: true,
//     employee: { fullName, employeeId, department, designation, ... },
//     records:  [{ date, checkIn, checkOut, totalHours, overtimeHours, status }],
//     summary:  { present, absent, late, halfDay, earlyOuts,
//                 totalWorkHours, totalOvertimeHours, totalRecords }
//   }
// ════════════════════════════════════════════════════════════════════════

// ─── IST helpers (Vercel runs in UTC — all date math must be IST-aware) ───
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // IST = UTC + 5:30

interface IstParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  dayOfWeek: number // 0=Sun, 6=Sat
  dateStr: string // "YYYY-MM-DD"
}

function getIstParts(date: Date): IstParts {
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

function istMonthRange(year: number, month: number): { start: Date; end: Date } {
  const startUtcMs = Date.UTC(year, month - 1, 1) - IST_OFFSET_MS
  const nextMonthStartUtcMs = Date.UTC(year, month, 1) - IST_OFFSET_MS
  const endUtcMs = nextMonthStartUtcMs - 1
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

// ─── Shift config (same as HR report + salary slip) ───
const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MINUTES = 15
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES // 615 (10:15 AM)
const SHIFT_END_MIN = SHIFT_END_HOUR * 60 // 1140 (7:00 PM)
const WEEKEND_DAYS = new Set([0, 6]) // Sun + Sat

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const month = parseInt(searchParams.get('month') || String(getIstParts(new Date()).month))
    const year = parseInt(searchParams.get('year') || String(getIstParts(new Date()).year))

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // ─── 1. Look up the ERP user (need name + hrmsId to match HRMS) ───
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true,
        department: true, designation: true, location: true,
        hrmsId: true, role: true,
        office: { select: { name: true, city: true } },
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ─── 2. Fetch HRMS employee master list (Bearer auth, already works) ───
    // Match by hrmsId first, then by name. If no match, we still return
    // configured:true and compute attendance from ERP punches — we just
    // won't have HRMS metadata (firm, official designation, etc.).
    const hrmsEmployees = await fetchHrmsEmployees()
    const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
      findHrmsEmployeeByName(hrmsEmployees, user.name)

    // ─── 3. Fetch ERP punch records for the selected IST month ───
    const { start: startDate, end: endDate } = istMonthRange(year, month)
    const punches = await db.punchRecord.findMany({
      where: {
        userId: user.id,
        punchIn: { gte: startDate, lte: endDate },
      },
      select: {
        punchIn: true, punchOut: true, status: true,
        punchInDistance: true, punchOutDistance: true,
      },
      orderBy: { punchIn: 'asc' },
    })

    // ─── 3a. FALLBACK: If NO ERP punches exist for this month, try HRMS DB ───
    // The ERP punch feature launched 2026-08-01. For any month BEFORE that
    // (e.g. July 2026 and earlier), there will be zero ERP punches. The HRMS
    // DB has Attendance records for those months — fetch them directly so
    // the user can see their actual attendance history.
    let hrmsDbAttendance: Awaited<ReturnType<typeof fetchHrmsAttendanceByEmployee>> = []
    let usingHrmsDbAttendance = false
    if (punches.length === 0 && hrmsEmp && isHrmsDbConfigured()) {
      const daysInMonthForHrms = new Date(year, month, 0).getDate()
      hrmsDbAttendance = await fetchHrmsAttendanceByEmployee(
        hrmsEmp.employeeId,
        `${year}-${String(month).padStart(2, '0')}-01`,
        `${year}-${String(month).padStart(2, '0')}-${String(daysInMonthForHrms).padStart(2, '0')}`
      )
      if (hrmsDbAttendance.length > 0) {
        usingHrmsDbAttendance = true
      }
    }

    // ─── 4. Fetch ERP + HRMS leaves for the month (merge, read-only) ───
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

    const hrmsLeavesAll = await fetchHrmsLeaves()
    const erpLeaveDateKeys = new Set<string>()
    for (const l of erpLeaves) {
      // Mark each IST date covered by this leave as "in ERP"
      const fromStr = istDateString(l.fromDate)
      const toStr = istDateString(l.toDate)
      const fromParts = getIstParts(new Date(l.fromDate))
      const toParts = getIstParts(new Date(l.toDate))
      const fromDay = fromParts.year * 10000 + fromParts.month * 100 + fromParts.day
      const toDay = toParts.year * 10000 + toParts.month * 100 + toParts.day
      for (let d = fromDay; d <= toDay; d++) {
        erpLeaveDateKeys.add(String(d))
      }
      // also store the IST date-string format
      erpLeaveDateKeys.add(`${fromStr}|${toStr}`)
    }

    // Build a quick lookup of "is this IST date a leave day" — keyed by YYYY-MM-DD
    const leaveDayMap = new Map<string, { type: string; halfDay: boolean }>()
    const addLeaveRange = (fromIso: Date | string, toIso: Date | string, type: string, totalDays: number | null) => {
      const fromParts = getIstParts(new Date(fromIso))
      const toParts = getIstParts(new Date(toIso))
      const fromDay = fromParts.year * 10000 + fromParts.month * 100 + fromParts.day
      const toDay = toParts.year * 10000 + toParts.month * 100 + toParts.day
      const dayCount = toDay - fromDay + 1
      // Half-day heuristic: totalDays=0.5 OR totalDays=0 with single-day range
      const isHalfDay = totalDays === 0.5 || (totalDays === 0 && dayCount === 1) || type === 'HALF_DAY'
      for (let d = fromDay; d <= toDay; d++) {
        const yr = Math.floor(d / 10000)
        const mo = Math.floor((d % 10000) / 100)
        const dy = d % 100
        const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`
        // Don't overwrite if already marked (ERP takes priority)
        if (!leaveDayMap.has(dateStr)) {
          leaveDayMap.set(dateStr, { type: type || 'CASUAL', halfDay: isHalfDay })
        }
      }
    }
    for (const l of erpLeaves) {
      if (l.status !== 'APPROVED') continue
      addLeaveRange(l.fromDate, l.toDate, l.leaveType || 'CASUAL', l.totalDays)
    }
    // HRMS leaves — only for THIS user (match by name / employeeId)
    for (const hl of hrmsLeavesAll) {
      if (hl.status !== 'approved') continue
      const isMyLeave = hrmsEmp && (
        hl.employee?.fullName === hrmsEmp.fullName ||
        hl.employeeId === hrmsEmp.employeeId
      )
      if (!isMyLeave) continue
      // Check if within month
      const fromIst = istDateString(hl.startDate)
      const toIst = istDateString(hl.endDate)
      const daysInMonth = new Date(year, month, 0).getDate()
      const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`
      const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      if (toIst < monthStartStr || fromIst > monthEndStr) continue
      addLeaveRange(hl.startDate, hl.endDate, hl.type || 'CASUAL', hl.days)
    }

    // ─── 5. Build daily attendance records for the entire month ───
    // For each calendar day in the IST month, produce a record object
    // matching the shape the frontend expects:
    //   { date, checkIn, checkOut, totalHours, overtimeHours, status }
    //
    // Status values understood by the frontend (see laxree-attendance-panel.tsx):
    //   'present', 'late', 'early-out', 'absent', 'half-day',
    //   'weekly-off', 'holiday'
    const daysInMonth = new Date(year, month, 0).getDate()
    const todayIst = getIstParts(new Date())
    const isCurrentMonth = todayIst.month === month && todayIst.year === year
    const todayIstMidnightUtcMs = Date.UTC(todayIst.year, todayIst.month - 1, todayIst.day) - IST_OFFSET_MS
    const todayIstMidnight = new Date(todayIstMidnightUtcMs)

    type DailyRecord = {
      date: string // ISO date "YYYY-MM-DD"
      checkIn: string | null // "HH:MM AM/PM" or null
      checkOut: string | null
      totalHours: number // decimal hours (e.g. 8.5 = 8h 30m)
      overtimeHours: number // decimal hours
      status: string // see map above
    }

    // ─── 5-pre. Build the employee object (HRMS-enriched) ───
    // Needed in both the HRMS-DB shortcut and the regular ERP-punch path.
    const employee = hrmsEmp ? {
      employeeId: hrmsEmp.employeeId,
      fullName: hrmsEmp.fullName,
      email: hrmsEmp.email || user.email || null,
      mobile: hrmsEmp.mobile || user.phone || null,
      department: hrmsEmp.department || user.department || '',
      designation: hrmsEmp.designation || user.designation || '',
      location: hrmsEmp.location || user.office?.city || user.location || '',
      firm: hrmsEmp.firm || '',
      employmentType: hrmsEmp.employmentType || '',
      shiftStart: hrmsEmp.shiftStart || `${SHIFT_START_HOUR}:00`,
      shiftEnd: hrmsEmp.shiftEnd || `${SHIFT_END_HOUR}:00`,
      shiftHours: hrmsEmp.shiftHours || (SHIFT_END_HOUR - SHIFT_START_HOUR),
      joiningDate: hrmsEmp.joiningDate || null,
      status: hrmsEmp.status || 'Yes',
    } : {
      // Fallback — no HRMS match. Use ERP user info only.
      employeeId: user.hrmsId || '',
      fullName: user.name,
      email: user.email || null,
      mobile: user.phone || null,
      department: user.department || '',
      designation: user.designation || '',
      location: user.office?.city || user.location || '',
      firm: '',
      employmentType: '',
      shiftStart: `${SHIFT_START_HOUR}:00`,
      shiftEnd: `${SHIFT_END_HOUR}:00`,
      shiftHours: SHIFT_END_HOUR - SHIFT_START_HOUR,
      joiningDate: null,
      status: 'Yes',
    }

    // ─── 5a. SHORTCUT: If using HRMS DB attendance, build records directly ───
    // The HRMS Attendance table already has pre-computed status, checkIn/out,
    // totalHours, overtimeHours — we just translate them to the frontend shape.
    if (usingHrmsDbAttendance) {
      const formatHrmsTime = (t: string | null): string | null => {
        if (!t) return null
        // HRMS stores "10:01" (24-hour). Convert to "10:01 AM" format.
        const [hStr, mStr] = t.split(':')
        let h = parseInt(hStr)
        const m = mStr || '00'
        const ampm = h >= 12 ? 'PM' : 'AM'
        h = h % 12
        if (h === 0) h = 12
        return `${h}:${m} ${ampm}`
      }

      const hrmsRecords: DailyRecord[] = hrmsDbAttendance.map(a => {
        const aParts = getIstParts(new Date(a.date))
        // Map HRMS status to frontend status
        let status = a.status || 'present'
        if (a.isHoliday) status = 'holiday'
        else if (a.isWeeklyOff) status = 'weekly-off'
        else if (a.halfDay) status = 'half-day'
        else if (a.lateEntry) status = 'late'
        else if (a.earlyOut) status = 'early-out'
        else if (a.status === 'absent') status = 'absent'
        else status = 'present'

        return {
          date: aParts.dateStr,
          checkIn: formatHrmsTime(a.checkIn),
          checkOut: formatHrmsTime(a.checkOut),
          totalHours: a.totalHours,
          overtimeHours: a.overtimeHours,
          status,
        }
      })

      // Compute summary from HRMS records
      let hrmsPresent = 0, hrmsLate = 0, hrmsEarlyOut = 0
      let hrmsHalfDay = 0, hrmsAbsent = 0, hrmsWorkHrs = 0, hrmsOtHrs = 0
      for (const r of hrmsRecords) {
        if (r.status === 'present') hrmsPresent++
        else if (r.status === 'late') hrmsLate++
        else if (r.status === 'early-out') hrmsEarlyOut++
        else if (r.status === 'half-day') hrmsHalfDay++
        else if (r.status === 'absent') hrmsAbsent++
        hrmsWorkHrs += r.totalHours
        hrmsOtHrs += r.overtimeHours
      }

      return NextResponse.json({
        configured: true,
        employee,
        records: hrmsRecords,
        summary: {
          present: hrmsPresent,
          absent: hrmsAbsent,
          late: hrmsLate,
          halfDay: hrmsHalfDay,
          earlyOuts: hrmsEarlyOut,
          totalWorkHours: Math.round(hrmsWorkHrs * 100) / 100,
          totalOvertimeHours: Math.round(hrmsOtHrs * 100) / 100,
          totalRecords: hrmsRecords.filter(r => r.status !== 'weekly-off' && r.status !== 'holiday').length,
        },
        meta: {
          mode: 'hrms-db',
          hrmsLinked: !!hrmsEmp,
          punchCount: 0,
          erpLeaveCount: erpLeaves.length,
          hrmsLeaveCount: hrmsLeavesAll.length,
          hrmsAttendanceCount: hrmsDbAttendance.length,
          timezone: 'Asia/Kolkata (IST, UTC+5:30)',
          shift: `${SHIFT_START_HOUR}:00–${SHIFT_END_HOUR}:00 IST`,
          note: 'Showing HRMS Attendance records (pre-ERP-punch era).',
        },
      })
    }

    // Group punches by IST date
    const punchesByDay = new Map<string, { firstIn: Date; lastOut: Date | null }>()
    for (const p of punches) {
      const dayStr = istDateString(p.punchIn)
      const existing = punchesByDay.get(dayStr)
      if (!existing) {
        punchesByDay.set(dayStr, { firstIn: new Date(p.punchIn), lastOut: p.punchOut ? new Date(p.punchOut) : null })
      } else {
        // Take earliest punch-in and latest punch-out for the day
        if (new Date(p.punchIn) < existing.firstIn) existing.firstIn = new Date(p.punchIn)
        if (p.punchOut && (!existing.lastOut || new Date(p.punchOut) > existing.lastOut)) {
          existing.lastOut = new Date(p.punchOut)
        }
      }
    }

    const records: DailyRecord[] = []
    let presentCount = 0
    let lateCount = 0
    let earlyOutCount = 0
    let halfDayCount = 0
    let absentCount = 0
    let totalWorkHours = 0
    let totalOvertimeHours = 0

    const formatTime = (d: Date): string => {
      const p = getIstParts(d)
      let h = p.hour
      const ampm = h >= 12 ? 'PM' : 'AM'
      h = h % 12
      if (h === 0) h = 12
      return `${h}:${String(p.minute).padStart(2, '0')} ${ampm}`
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateUtcMs = Date.UTC(year, month - 1, day) - IST_OFFSET_MS
      const dateObj = new Date(dateUtcMs)
      const parts = getIstParts(dateObj)
      const dateStr = parts.dateStr

      // Skip future days (current month only)
      if (isCurrentMonth && dateObj > todayIstMidnight) {
        // Stop generating future days — frontend iterates the rest itself
        break
      }

      const dayOfWeek = parts.dayOfWeek
      const isWeekend = WEEKEND_DAYS.has(dayOfWeek)
      const punch = punchesByDay.get(dateStr)
      const leave = leaveDayMap.get(dateStr)

      let status: string
      let checkIn: string | null = null
      let checkOut: string | null = null
      let totalHours = 0
      let overtimeHours = 0

      if (punch) {
        // Has a punch record — compute hours + determine status
        checkIn = formatTime(punch.firstIn)
        if (punch.lastOut) {
          checkOut = formatTime(punch.lastOut)
          const workedMs = punch.lastOut.getTime() - punch.firstIn.getTime()
          totalHours = Math.max(0, workedMs / (1000 * 60 * 60))
        }

        // Late detection: punch-in after 10:15 AM IST
        const inParts = getIstParts(punch.firstIn)
        const punchInMin = inParts.hour * 60 + inParts.minute
        const isLate = punchInMin > LATE_THRESHOLD_MIN

        // Early-out detection: punch-out before 7:00 PM IST
        let isEarly = false
        if (punch.lastOut) {
          const outParts = getIstParts(punch.lastOut)
          const punchOutMin = outParts.hour * 60 + outParts.minute
          isEarly = punchOutMin < SHIFT_END_MIN
        }

        // Overtime: hours worked beyond shift end (9 hours)
        const shiftHours = SHIFT_END_HOUR - SHIFT_START_HOUR // 9
        if (totalHours > shiftHours) {
          overtimeHours = Math.max(0, totalHours - shiftHours)
        }

        // Priority: late > early-out > present
        if (isLate && isEarly) {
          status = 'late' // late takes priority for visibility
          lateCount++
        } else if (isLate) {
          status = 'late'
          lateCount++
        } else if (isEarly) {
          status = 'early-out'
          earlyOutCount++
        } else if (leave?.halfDay) {
          status = 'half-day'
          halfDayCount++
        } else {
          status = 'present'
          presentCount++
        }
        totalWorkHours += totalHours
        totalOvertimeHours += overtimeHours
      } else if (leave) {
        // No punch, but has approved leave
        if (leave.halfDay) {
          status = 'half-day'
          halfDayCount++
        } else {
          // Full-day leave — display as 'present' so the user doesn't see
          // "absent" on approved leave days. The summary count for "present"
          // thus includes approved-leave days, matching HRMS semantics.
          status = 'present'
          presentCount++
        }
      } else if (isWeekend) {
        status = 'weekly-off'
      } else if (isCurrentMonth && dateObj.getTime() >= todayIstMidnight.getTime()) {
        // Future today or later in current month — skip
        continue
      } else {
        // Past weekday with no punch and no leave = absent
        status = 'absent'
        absentCount++
      }

      records.push({
        date: dateStr,
        checkIn,
        checkOut,
        totalHours: Math.round(totalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        status,
      })
    }

    // ─── 6. Build the summary object ───
    const summary = {
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      halfDay: halfDayCount,
      earlyOuts: earlyOutCount,
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalRecords: records.filter(r => r.status !== 'weekly-off').length,
    }

    return NextResponse.json({
      configured: true, // ALWAYS true now — no env var required
      employee,
      records,
      summary,
      // Metadata for debugging / future UI hints
      meta: {
        mode: 'local-compute',
        hrmsLinked: !!hrmsEmp,
        punchCount: punches.length,
        erpLeaveCount: erpLeaves.length,
        hrmsLeaveCount: hrmsLeavesAll.length,
        timezone: 'Asia/Kolkata (IST, UTC+5:30)',
        shift: `${SHIFT_START_HOUR}:00–${SHIFT_END_HOUR}:00 IST`,
      },
    })
  } catch (error: any) {
    console.error('Attendance bridge error:', error)
    return NextResponse.json({
      configured: true,
      error: error?.message || 'Server error',
      records: [],
      summary: null,
      employee: null,
    }, { status: 500 })
  }
}
