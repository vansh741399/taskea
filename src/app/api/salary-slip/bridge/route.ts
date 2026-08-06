import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchHrmsEmployees,
  fetchHrmsLeaves,
  findHrmsEmployeeByHrmsId,
  findHrmsEmployeeByName,
} from '@/lib/hrms-client'
import {
  fetchHrmsPayroll,
  fetchHrmsAttendanceByEmployee,
  isHrmsDbConfigured,
} from '@/lib/hrms-db'

// ════════════════════════════════════════════════════════════════════════
// v25·0806-salary-fix — SALARY SLIP BRIDGE (LOCAL COMPUTATION)
// ════════════════════════════════════════════════════════════════════════
// PREVIOUS DESIGN (BROKEN):
//   Called HRMS /api/external/salary-slip with header `x-hrms-api-key`
//   requiring a shared HRMS_BRIDGE_API_KEY env var on BOTH apps. The key
//   was never set on the ERP Vercel project, so every employee saw the
//   "HRMS bridge is not configured yet" banner and could NOT see their
//   salary slip.
//
// NEW DESIGN (FIXED):
//   Computes the salary slip LOCALLY in the ERP using:
//     1. HRMS employee master data — fetched via /api/employees with the
//        ALREADY-WORKING HRMS_ACCESS_TOKEN (Bearer auth). No new env var
//        needed. Includes monthlySalary, dailyRate, hourlyRate, bank,
//        PAN, joiningDate, designation, department, firm.
//     2. ERP punch records for the user (PunchRecord table).
//     3. ERP leaves for the user (Leave table) — merged with HRMS leaves
//        (read-only GET /api/leaves with Bearer token) so months before
//        the ERP punch feature (pre-2026-08) still show leave data.
//     4. Hardcoded firm details for the 3 Laxree firms (LAPL, LRSL, SI).
//
// SAFETY: PURELY READ-ONLY. NEVER writes to either database. No DELETE,
// no UPDATE, no UPSERT. Only Prisma findMany calls + HRMS GET fetches.
// ════════════════════════════════════════════════════════════════════════

// ─── IST helpers (identical to /api/hr-report — Vercel runs in UTC) ───
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

function getIstParts(date: Date) {
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
  return { start: new Date(startUtcMs), end: new Date(nextMonthStartUtcMs - 1) }
}

// ─── Shift config (same as HR report) ───
const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MINUTES = 15
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES
const SHIFT_END_MIN = SHIFT_END_HOUR * 60
const WEEKEND_DAYS = new Set([0, 6]) // Sun + Sat

// ─── Firm directory (matches HRMS SalarySlipGenerator firm data) ───
// Source: HRMS app's firm config (LAPL/LRSL/SI). Hardcoded here so the
// ERP doesn't need an extra round-trip to HRMS for firm details.
const FIRM_DIRECTORY: Record<string, {
  name: string
  code: string
  address: string
  phone: string
  email: string
  logo: string
}> = {
  LAPL: {
    name: 'Laxree Associate Projects Pvt. Ltd.',
    code: 'LAPL',
    address: 'Laxree Associate Projects Pvt. Ltd., Ajmer, Rajasthan',
    phone: '+91 98290 00000',
    email: 'hr@laxree.com',
    logo: '/logos/lapl-logo.png',
  },
  LRSL: {
    name: 'Laxree Retail Solutions Pvt. Ltd.',
    code: 'LRSL',
    address: 'Laxree Retail Solutions Pvt. Ltd., Ajmer, Rajasthan',
    phone: '+91 98290 00000',
    email: 'hr@laxree.com',
    logo: '/logos/lrsl-logo.png',
  },
  SI: {
    name: 'Shubham Industries',
    code: 'SI',
    address: 'Shubham Industries, Ajmer, Rajasthan',
    phone: '+91 98290 00000',
    email: 'hr@laxree.com',
    logo: '/logos/si-logo.png',
  },
}

const DEFAULT_FIRM = FIRM_DIRECTORY.LRSL

// ─── Convert number to Indian English words (for "In Words" field) ───
function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigits(n: number): string {
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  }
  function threeDigits(n: number): string {
    const h = Math.floor(n / 100)
    const r = n % 100
    let s = ''
    if (h) s += ones[h] + ' Hundred'
    if (r) s += (h ? ' ' : '') + twoDigits(r)
    return s
  }

  let n = Math.floor(num)
  let words = ''
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lakh = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  const remainder = n

  if (crore) words += twoDigits(crore) + ' Crore '
  if (lakh) words += twoDigits(lakh) + ' Lakh '
  if (thousand) words += twoDigits(thousand) + ' Thousand '
  if (remainder) words += threeDigits(remainder)
  return words.trim() + ' Rupees Only'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // ─── 1. Look up the ERP user ───
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true,
        department: true, designation: true, location: true,
        hrmsId: true,
        office: { select: { name: true, city: true, address: true } },
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ─── 2. Fetch HRMS employees (Bearer-token, already configured) ───
    const hrmsEmployees = await fetchHrmsEmployees()
    if (hrmsEmployees.length === 0) {
      return NextResponse.json({
        configured: false,
        message: 'HRMS_ACCESS_TOKEN not set on the ERP server, or HRMS API unreachable. Set HRMS_ACCESS_TOKEN on Vercel.',
        employee: null,
        payroll: null,
        firm: null,
      })
    }

    // ─── 3. Match ERP user → HRMS employee (by hrmsId first, then by name) ───
    const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
      findHrmsEmployeeByName(hrmsEmployees, user.name)

    if (!hrmsEmp) {
      // No HRMS match — return configured:true so the UI shows the
      // "No HRMS record linked" state instead of the "not configured" banner.
      return NextResponse.json({
        configured: true,
        employee: null,
        payroll: null,
        firm: null,
        message: `No HRMS employee matches ERP user "${user.name}" (hrmsId=${user.hrmsId || 'null'}). Link the user's hrmsId in ERP admin or confirm the name matches HRMS exactly.`,
      })
    }

    // ─── 4. Compute attendance for the selected IST month ───
    const daysInMonth = new Date(year, month, 0).getDate()
    const { start, end } = istMonthRange(year, month)

    // ERP punches
    const punches = await db.punchRecord.findMany({
      where: {
        userId: user.id,
        punchIn: { gte: start, lte: end },
      },
      select: {
        punchIn: true, punchOut: true, status: true,
        punchInLat: true, punchInLng: true, punchInDistance: true,
        punchOutLat: true, punchOutLng: true, punchOutDistance: true,
        office: { select: { name: true, city: true, address: true } },
      },
      orderBy: { punchIn: 'asc' },
    })

    // ERP leaves
    const erpLeaves = await db.leave.findMany({
      where: {
        userId: user.id,
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate: { gte: start, lte: end } },
          { AND: [{ fromDate: { lte: start } }, { toDate: { gte: end } }] },
        ],
      },
      select: {
        leaveType: true, fromDate: true, toDate: true,
        status: true, totalDays: true, reason: true,
      },
    })

    // HRMS leaves (read-only) — merged so pre-ERP-punch months still have leave data
    const hrmsLeavesAll = await fetchHrmsLeaves()
    const erpLeaveKeys = new Set<string>()
    for (const l of erpLeaves) {
      erpLeaveKeys.add(istDateString(l.fromDate))
    }
    const mergedLeaves: Array<{
      leaveType: string
      fromDate: Date
      toDate: Date
      status: string
      totalDays: number
      reason: string
    }> = [...erpLeaves.map(l => ({
      leaveType: l.leaveType,
      fromDate: l.fromDate,
      toDate: l.toDate,
      status: l.status,
      totalDays: l.totalDays,
      reason: l.reason,
    }))]

    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    for (const hl of hrmsLeavesAll) {
      if (hl.status !== 'approved') continue
      const fromIst = istDateString(hl.startDate)
      const toIst = istDateString(hl.endDate)
      if (toIst < monthStartStr || fromIst > monthEndStr) continue
      // Only count leaves for THIS employee
      if (hl.employeeId !== hrmsEmp.employeeId && hl.employee?.fullName !== hrmsEmp.fullName) continue
      if (erpLeaveKeys.has(fromIst)) continue
      mergedLeaves.push({
        leaveType: hl.type || 'CASUAL',
        fromDate: new Date(hl.startDate),
        toDate: new Date(hl.endDate),
        status: 'APPROVED',
        totalDays: hl.days,
        reason: hl.reason,
      })
    }

    // ─── 5. Compute attendance stats (same logic as HR report) ───
    // v25·0806-hrms-db: If ERP has no punches for this month (pre-2026-08),
    // fall back to HRMS DB Attendance records. The HRMS Attendance table has
    // pre-computed status, checkIn/out, totalHours — we synthesize PunchLike
    // objects so the existing computation logic works unchanged.
    type EffectivePunch = {
      punchIn: Date
      punchOut: Date | null
      status: string | null
    }
    let effectivePunches: EffectivePunch[] = punches.map(p => ({
      punchIn: new Date(p.punchIn),
      punchOut: p.punchOut ? new Date(p.punchOut) : null,
      status: p.status,
    }))
    if (punches.length === 0 && isHrmsDbConfigured()) {
      const hrmsAttendance = await fetchHrmsAttendanceByEmployee(
        hrmsEmp.employeeId,
        `${year}-${String(month).padStart(2, '0')}-01`,
        `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      )
      if (hrmsAttendance.length > 0) {
        // Convert HRMS attendance to synthetic punches
        effectivePunches = hrmsAttendance
          .filter(a => !a.isWeeklyOff && !a.isHoliday && a.status !== 'absent' && a.checkIn)
          .map(a => {
            const dateObj = new Date(a.date)
            const istDateStr = istDateString(dateObj)
            const [inH, inM] = a.checkIn!.split(':').map(s => parseInt(s) || 0)
            const punchIn = new Date(`${istDateStr}T${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}:00+05:30`)
            let punchOut: Date | null = null
            if (a.checkOut) {
              const [outH, outM] = a.checkOut.split(':').map(s => parseInt(s) || 0)
              punchOut = new Date(`${istDateStr}T${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}:00+05:30`)
            }
            let status = 'PRESENT'
            if (a.lateEntry) status = 'LATE'
            else if (a.earlyOut) status = 'EARLY_OUT'
            else if (a.halfDay) status = 'HALF_DAY'
            return { punchIn, punchOut, status }
          })
      }
    }

    const presentDates = new Set(effectivePunches.map(p => istDateString(p.punchIn)))
    const presentDays = presentDates.size

    const approvedLeaves = mergedLeaves.filter(l => l.status === 'APPROVED')
    const fullDayLeaves = approvedLeaves.filter(l =>
      l.leaveType !== 'HALF_DAY' && (l.totalDays || 0) >= 1
    ).length
    const halfDayLeaves = approvedLeaves.filter(l =>
      l.leaveType === 'HALF_DAY' || (l.totalDays || 0) === 0.5
    ).length
    const paidLeaveDays = approvedLeaves.reduce((sum, l) => {
      // Half-day leaves count as 0.5, full-day as 1
      if (l.leaveType === 'HALF_DAY' || (l.totalDays || 0) === 0.5) return sum + 0.5
      return sum + (l.totalDays || 0)
    }, 0)

    const approvedLeaveRanges = approvedLeaves.map(l => ({
      fromStr: istDateString(l.fromDate),
      toStr: istDateString(l.toDate),
    }))

    // Sunday count (for Sunday earnings — many Laxree roles pay extra for Sunday work)
    let sundayCount = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS)
      const parts = getIstParts(checkDate)
      if (parts.dayOfWeek === 0 && presentDates.has(parts.dateStr)) {
        sundayCount++
      }
    }

    // Total worked hours (sum of punchOut - punchIn for complete punches)
    let totalWorkedMinutes = 0
    effectivePunches.forEach(p => {
      if (p.punchOut) {
        const diff = new Date(p.punchOut).getTime() - new Date(p.punchIn).getTime()
        if (diff > 0) totalWorkedMinutes += Math.floor(diff / 60000)
      }
    })
    const totalWorkedHrs = Math.floor(totalWorkedMinutes / 60)
    const totalWorkedMins = totalWorkedMinutes % 60
    const totalWorkedHrsDisplay = `${totalWorkedHrs}h ${String(totalWorkedMins).padStart(2, '0')}m`

    // ─── 6. Compute payroll ───
    // Per-day rate: prefer HRMS dailyRate if set; otherwise derive from monthlySalary / daysInMonth.
    const monthlySalary = hrmsEmp.monthlySalary || 0
    const perDayRate = hrmsEmp.dailyRate && hrmsEmp.dailyRate > 0
      ? hrmsEmp.dailyRate
      : (monthlySalary > 0 ? Math.round((monthlySalary / daysInMonth) * 100) / 100 : 0)

    // ─── 6-pre. Resolve firm details (needed in both branches) ───
    const firmCode = (hrmsEmp.firm || 'LRSL').toUpperCase()
    const firm = FIRM_DIRECTORY[firmCode] || DEFAULT_FIRM

    // ─── 6a. CHECK HRMS DB FOR PRE-COMPUTED PAYROLL ───
    // For months BEFORE the ERP punch feature launched (pre-2026-08), or any
    // month where the HRMS app has already generated a payroll record, prefer
    // the HRMS-computed payroll over our local computation. The HRMS payroll
    // table reflects what HR actually paid the employee — it's the source of
    // truth. ERP local computation is only a fallback for the CURRENT month
    // where HR hasn't generated payroll yet.
    //
    // v25·0806-stale-payroll-fix: If a payroll record exists BUT was generated
    // prematurely (e.g. HR generated it on July 1 for the whole month of July,
    // capturing only 1-3 days of attendance), the snapshot is STALE and the
    // HRMS app itself recomputes from the Attendance table on the fly when
    // displaying the slip. To match the HRMS app's display behavior, we detect
    // staleness by comparing payroll.presentDays vs the actual HRMS Attendance
    // record count for the same month. If attendance has significantly more
    // present days than the payroll snapshot, we treat the payroll as stale
    // and fall through to local computation from attendance records.
    const hrmsPayroll = isHrmsDbConfigured()
      ? await fetchHrmsPayroll(hrmsEmp.employeeId, month, year)
      : null

    // Pre-fetch HRMS attendance for the month — used both for staleness check
    // and as the fallback data source if payroll is stale.
    const hrmsAttendance = isHrmsDbConfigured()
      ? await fetchHrmsAttendanceByEmployee(
          hrmsEmp.employeeId,
          `${year}-${String(month).padStart(2, '0')}-01`,
          `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
        )
      : []

    // v25·0806-stale-payroll-fix: Staleness check.
    // Count ACTUAL present days from HRMS Attendance (excluding weekly off,
    // holiday, and absent records — same logic as the local computation below).
    const hrmsAttPresentDays = hrmsAttendance.filter(a =>
      !a.isWeeklyOff && !a.isHoliday && a.status !== 'absent' && a.checkIn
    ).length

    // If payroll says fewer present days than attendance actually has, the
    // payroll record is stale (generated mid-month). Use attendance instead.
    // We also require attendance to have at least 1 more day than payroll to
    // avoid false positives from rounding.
    const payrollIsStale = !!hrmsPayroll
      && hrmsPayroll.netSalary > 0
      && hrmsAttPresentDays > (hrmsPayroll.presentDays || 0) + 0.5

    if (payrollIsStale) {
      console.warn(
        `[salary-slip] Stale HRMS payroll detected for ${hrmsEmp.employeeId} ${year}-${month}: ` +
        `payroll.presentDays=${hrmsPayroll!.presentDays} but attendance has ${hrmsAttPresentDays} present days. ` +
        `Falling through to local computation from HRMS Attendance.`
      )
    }

    // ─── 6b. If HRMS has a FRESH payroll record, use it directly ───
    if (hrmsPayroll && hrmsPayroll.netSalary > 0 && !payrollIsStale) {
      const monthName2 = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'][month - 1]

      const employeeFromHrms = {
        id: hrmsEmp.id,
        employeeId: hrmsEmp.employeeId,
        fullName: hrmsEmp.fullName,
        mobile: hrmsEmp.mobile || user.phone || '',
        email: hrmsEmp.email || user.email || '',
        designation: hrmsEmp.designation || user.designation || '',
        department: hrmsEmp.department || user.department || '',
        location: hrmsEmp.location || user.office?.city || user.location || '',
        address: hrmsEmp.address || user.office?.address || '',
        firm: hrmsEmp.firm || firmCode,
        employmentType: hrmsEmp.employmentType || '',
        salaryType: hrmsEmp.salaryType || 'monthly',
        monthlySalary,
        dailyRate: hrmsEmp.dailyRate || perDayRate,
        hourlyRate: hrmsEmp.hourlyRate || 0,
        overtimeRate: hrmsEmp.overtimeRate || 0,
        shiftStart: hrmsEmp.shiftStart || `${SHIFT_START_HOUR}:00`,
        shiftEnd: hrmsEmp.shiftEnd || `${SHIFT_END_HOUR}:00`,
        joiningDate: hrmsEmp.joiningDate || null,
        bankName: hrmsEmp.bankName || null,
        bankAccount: hrmsEmp.bankAccount || null,
        bankIfsc: hrmsEmp.bankIfsc || null,
        panNumber: hrmsEmp.panNumber || null,
        aadhaarNumber: hrmsEmp.aadhaarNumber || null,
      }

      const payrollFromHrms = {
        monthlySalary: hrmsPayroll.monthlySalary || monthlySalary,
        perDayRate,
        baseSalary: Math.round((hrmsPayroll.grossSalary - hrmsPayroll.sundayEarnings) * 100) / 100,
        sundayEarnings: hrmsPayroll.sundayEarnings,
        grossSalary: hrmsPayroll.grossSalary,
        totalEarnings: Math.round((hrmsPayroll.grossSalary + hrmsPayroll.bonus + hrmsPayroll.incentive + hrmsPayroll.arrear + hrmsPayroll.otAmount) * 100) / 100,
        bonus: hrmsPayroll.bonus,
        incentive: hrmsPayroll.incentive,
        arrear: hrmsPayroll.arrear,
        otAmount: hrmsPayroll.otAmount,
        advanceDeduction: hrmsPayroll.advanceDeduction,
        tdsDeduction: hrmsPayroll.tdsDeduction,
        loanDeduction: hrmsPayroll.loanDeduction,
        securityDeposit: hrmsPayroll.securityDeposit,
        otherDeductions: hrmsPayroll.otherDeductions,
        totalDeductions: hrmsPayroll.totalDeductions,
        netSalary: hrmsPayroll.netSalary,
        netSalaryInWords: numberToIndianWords(hrmsPayroll.netSalary),
        presentDays: hrmsPayroll.presentDays,
        paidLeaves: hrmsPayroll.paidLeaves,
        fullDayLeaves: Math.floor(hrmsPayroll.paidLeaves),
        halfDayLeaves: hrmsPayroll.paidLeaves % 1 !== 0 ? 1 : 0,
        sundayCount: hrmsPayroll.sundayCount,
        totalWorkedHrs: Math.floor(hrmsPayroll.totalWorkedHrs),
        totalWorkedHrsDisplay: `${Math.floor(hrmsPayroll.totalWorkedHrs)}h ${String(Math.round((hrmsPayroll.totalWorkedHrs % 1) * 60)).padStart(2, '0')}m`,
      }

      return NextResponse.json({
        configured: true,
        computed: 'hrms-db',
        source: 'HRMS Payroll table (read-only DB)',
        employee: employeeFromHrms,
        payroll: payrollFromHrms,
        firm,
        monthName: monthName2,
        month,
        year,
        timezone: 'Asia/Kolkata (IST, UTC+5:30)',
        attendance: {
          totalPunches: hrmsAttendance.length,
          presentDays: hrmsPayroll.presentDays,
          paidLeaveDays: hrmsPayroll.paidLeaves,
          payableDays: hrmsPayroll.presentDays + hrmsPayroll.paidLeaves,
          fullDayLeaves: Math.floor(hrmsPayroll.paidLeaves),
          halfDayLeaves: hrmsPayroll.paidLeaves % 1 !== 0 ? 1 : 0,
          sundayCount: hrmsPayroll.sundayCount,
          totalWorkedHrsDisplay: `${Math.floor(hrmsPayroll.totalWorkedHrs)}h ${String(Math.round((hrmsPayroll.totalWorkedHrs % 1) * 60)).padStart(2, '0')}m`,
          erpPunchCount: punches.length,
          hrmsAttendanceCount: hrmsAttendance.length,
        },
      })
    }

    // v25·0806-stale-payroll-fix: If payroll was stale, FORCE use of HRMS
    // Attendance as the source of truth (instead of the empty ERP punch
    // table). This happens when the ERP punch route's "punches.length === 0"
    // branch wouldn't fire because punches might exist but the stale payroll
    // would have short-circuited earlier.
    if (payrollIsStale && hrmsAttendance.length > 0) {
      // Synthesize effective punches from HRMS attendance — same logic as
      // the existing fallback below, but forced because we know the payroll
      // is stale.
      effectivePunches = hrmsAttendance
        .filter(a => !a.isWeeklyOff && !a.isHoliday && a.status !== 'absent' && a.checkIn)
        .map(a => {
          const dateObj = new Date(a.date)
          const istDateStr = istDateString(dateObj)
          const [inH, inM] = a.checkIn!.split(':').map(s => parseInt(s) || 0)
          const punchIn = new Date(`${istDateStr}T${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}:00+05:30`)
          let punchOut: Date | null = null
          if (a.checkOut) {
            const [outH, outM] = a.checkOut.split(':').map(s => parseInt(s) || 0)
            punchOut = new Date(`${istDateStr}T${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}:00+05:30`)
          }
          let status = 'PRESENT'
          if (a.lateEntry) status = 'LATE'
          else if (a.earlyOut) status = 'EARLY_OUT'
          else if (a.halfDay) status = 'HALF_DAY'
          return { punchIn, punchOut, status }
        })
    }

    // ─── 6c. NO HRMS PAYROLL — compute locally from ERP punches ───
    // Base salary = per-day rate × payable days (present + paid leaves)
    const payableDays = presentDays + paidLeaveDays
    const baseSalary = Math.round(perDayRate * payableDays * 100) / 100

    // Sunday earnings (1x per-day rate per Sunday worked — same as HRMS default)
    const sundayEarnings = Math.round(perDayRate * sundayCount * 100) / 100

    // No ERP-side deduction fields tracked yet — defaults to 0
    const advanceDeduction = 0
    const tdsDeduction = 0
    const loanDeduction = 0
    const securityDeposit = 0
    const otherDeductions = 0
    const bonus = 0
    const incentive = 0
    const arrear = 0
    const otAmount = 0 // overtime not yet tracked in ERP

    const grossSalary = Math.round((baseSalary + sundayEarnings) * 100) / 100
    const totalEarnings = Math.round((grossSalary + bonus + incentive + arrear + otAmount) * 100) / 100
    const totalDeductions = advanceDeduction + tdsDeduction + loanDeduction + securityDeposit + otherDeductions
    const netSalary = Math.max(0, Math.round((totalEarnings - totalDeductions) * 100) / 100)
    const netSalaryInWords = numberToIndianWords(netSalary)

    // ─── 7. Build employee object (matches HRMS salary-slip shape) ───
    const employee = {
      id: hrmsEmp.id,
      employeeId: hrmsEmp.employeeId,
      fullName: hrmsEmp.fullName,
      mobile: hrmsEmp.mobile || user.phone || '',
      email: hrmsEmp.email || user.email || '',
      designation: hrmsEmp.designation || user.designation || '',
      department: hrmsEmp.department || user.department || '',
      location: hrmsEmp.location || user.office?.city || user.location || '',
      address: hrmsEmp.address || user.office?.address || '',
      firm: hrmsEmp.firm || firmCode,
      employmentType: hrmsEmp.employmentType || '',
      salaryType: hrmsEmp.salaryType || 'monthly',
      monthlySalary,
      dailyRate: hrmsEmp.dailyRate || perDayRate,
      hourlyRate: hrmsEmp.hourlyRate || 0,
      overtimeRate: hrmsEmp.overtimeRate || 0,
      shiftStart: hrmsEmp.shiftStart || `${SHIFT_START_HOUR}:00`,
      shiftEnd: hrmsEmp.shiftEnd || `${SHIFT_END_HOUR}:00`,
      joiningDate: hrmsEmp.joiningDate || null,
      bankName: hrmsEmp.bankName || null,
      bankAccount: hrmsEmp.bankAccount || null,
      bankIfsc: hrmsEmp.bankIfsc || null,
      panNumber: hrmsEmp.panNumber || null,
      aadhaarNumber: hrmsEmp.aadhaarNumber || null,
    }

    // ─── 9. Build payroll object (matches HRMS salary-slip shape) ───
    const payroll = {
      monthlySalary,
      perDayRate,
      baseSalary,
      sundayEarnings,
      grossSalary,
      totalEarnings,
      bonus,
      incentive,
      arrear,
      otAmount,
      advanceDeduction,
      tdsDeduction,
      loanDeduction,
      securityDeposit,
      otherDeductions,
      totalDeductions,
      netSalary,
      netSalaryInWords,
      presentDays,
      paidLeaves: paidLeaveDays,
      fullDayLeaves,
      halfDayLeaves,
      sundayCount,
      totalWorkedHrs,
      totalWorkedHrsDisplay,
    }

    const monthName = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'][month - 1]

    return NextResponse.json({
      configured: true,
      computed: effectivePunches.length > 0 && punches.length === 0 ? 'local+hrms-db' : 'local',
      source: effectivePunches.length > 0 && punches.length === 0
        ? 'HRMS DB Attendance + ERP leaves (read-only)'
        : 'ERP punches + HRMS (read-only)',
      employee,
      payroll,
      firm,
      monthName,
      month,
      year,
      timezone: 'Asia/Kolkata (IST, UTC+5:30)',
      attendance: {
        totalPunches: effectivePunches.length,
        erpPunchCount: punches.length,
        hrmsAttendanceUsed: punches.length === 0 && effectivePunches.length > 0,
        // v25·0806-stale-payroll-fix: include HRMS attendance count for stale
        // payroll fallback (when payroll exists but is stale, we use HRMS
        // Attendance as the source — surface the count for visibility).
        hrmsAttendanceCount: hrmsAttendance.length,
        presentDays,
        paidLeaveDays,
        payableDays,
        fullDayLeaves,
        halfDayLeaves,
        sundayCount,
        totalWorkedHrsDisplay,
      },
    })
  } catch (error: any) {
    console.error('Salary slip bridge error:', error)
    return NextResponse.json({
      configured: true,
      error: error?.message || 'Server error',
      employee: null,
      payroll: null,
      firm: null,
    })
  }
}
