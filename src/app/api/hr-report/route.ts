import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchHrmsEmployees,
  findHrmsEmployeeByHrmsId,
  findHrmsEmployeeByName,
  type HrmsEmployee,
} from '@/lib/hrms-client'
import * as XLSX from 'xlsx'

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
// SCORING (unchanged from v25·0801):
//   HR Score = 2 (multiplier)
//   Base Score = Total Presents × HR Score
//   Deductions per marking scheme (see code below)
//   Overall Score = Base Score - Deductions
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

const HR_SCORE_MULTIPLIER = 2
const SHIFT_START_HOUR = 10 // 10:00 AM
const SHIFT_END_HOUR = 19   // 7:00 PM
const LATE_THRESHOLD_MINUTES = 15 // 15 min grace period

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
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
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

    // 2. Fetch punch records for the month
    const punches = await db.punchRecord.findMany({
      where: {
        userId: { in: userIds },
        punchIn: { gte: startDate, lte: endDate },
      },
      select: { userId: true, punchIn: true, punchOut: true, status: true },
      orderBy: { punchIn: 'asc' },
    })

    // 3. Fetch leaves for the month
    const leaves = await db.leave.findMany({
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

    // 4. Fetch HRMS employee master data (one bulk call, cached 5 min)
    const hrmsEmployees = await fetchHrmsEmployees()

    // 5. Compute stats per user
    const report = users.map((user, index) => {
      const userPunches = punches.filter(p => p.userId === user.id)
      const userLeaves = leaves.filter(l => l.userId === user.id)

      // ─── Match HRMS employee by hrmsId first, then by name ───
      const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
        findHrmsEmployeeByName(hrmsEmployees, user.name)

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
      scoringConfig: {
        hrScoreMultiplier: HR_SCORE_MULTIPLIER,
        shiftStart: `${SHIFT_START_HOUR}:00 AM`,
        shiftEnd: `${SHIFT_END_HOUR}:00 PM`,
        lateGracePeriod: `${LATE_THRESHOLD_MINUTES} min`,
        lowScoreThreshold: 7,
      },
      summary: {
        totalEmployees: report.length,
        totalPresents: report.reduce((s, r) => s + r.totalPresents, 0),
        avgScore: report.length > 0
          ? Math.round(report.reduce((s, r) => s + r.overallScore, 0) / report.length)
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
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
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

  const leaves = await db.leave.findMany({
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

  const empReport = computeEmployeeReport(user, punches, leaves, hrmsEmp, 0, month, year, daysInMonth)

  return {
    generatedAt: new Date().toISOString(),
    filters: { month, year, userId },
    mode: 'self',
    scoringConfig: {
      hrScoreMultiplier: HR_SCORE_MULTIPLIER,
      shiftStart: `${SHIFT_START_HOUR}:00 AM`,
      shiftEnd: `${SHIFT_END_HOUR}:00 PM`,
      lateGracePeriod: `${LATE_THRESHOLD_MINUTES} min`,
      lowScoreThreshold: 7,
    },
    employee: empReport,
    hrmsSyncedAt: hrmsEmployees.length > 0 ? new Date().toISOString() : null,
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
  // ─── Count present days (unique punch-in days) ───
  const presentDates = new Set(punches.map(p => new Date(p.punchIn).toDateString()))
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

  // ─── Count late comings / early goings ───
  let lateComings = 0
  let earlyGoings = 0
  const latePunchDetails: { date: string; punchIn: string; minutesLate: number }[] = []
  const earlyPunchDetails: { date: string; punchOut: string; minutesEarly: number }[] = []

  punches.forEach(p => {
    const punchInDate = new Date(p.punchIn)
    const punchInHour = punchInDate.getHours()
    const punchInMin = punchInDate.getMinutes()
    if (punchInHour > SHIFT_START_HOUR ||
        (punchInHour === SHIFT_START_HOUR && punchInMin > LATE_THRESHOLD_MINUTES)) {
      lateComings++
      const expected = punchInHour * 60 + punchInMin
      const threshold = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES
      latePunchDetails.push({
        date: punchInDate.toDateString(),
        punchIn: punchInDate.toLocaleTimeString('en-IN'),
        minutesLate: Math.max(0, expected - threshold),
      })
    }
    if (p.punchOut) {
      const punchOutDate = new Date(p.punchOut)
      const punchOutHour = punchOutDate.getHours()
      const punchOutMin = punchOutDate.getMinutes()
      if (punchOutHour < SHIFT_END_HOUR ||
          (punchOutHour === SHIFT_END_HOUR && punchOutMin === 0)) {
        earlyGoings++
        const actual = punchOutHour * 60 + punchOutMin
        const threshold = SHIFT_END_HOUR * 60
        earlyPunchDetails.push({
          date: punchOutDate.toDateString(),
          punchOut: punchOutDate.toLocaleTimeString('en-IN'),
          minutesEarly: Math.max(0, threshold - actual),
        })
      }
    }
  })

  const lateComingsEarlyGoings = lateComings + earlyGoings

  // ─── Count uninformed leaves ───
  let uninformedLeaves = 0
  const uninformedDates: string[] = []
  const today = new Date()
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year

  for (let day = 1; day <= daysInMonth; day++) {
    const checkDate = new Date(year, month - 1, day)
    if (isCurrentMonth && checkDate > today) break
    if (checkDate.getDay() === 0) continue // skip Sundays

    const dateStr = checkDate.toDateString()
    const wasPresent = presentDates.has(dateStr)
    const wasOnLeave = approvedLeaves.some(l => {
      const from = new Date(l.fromDate)
      const to = new Date(l.toDate)
      return checkDate >= from && checkDate <= to
    })

    if (!wasPresent && !wasOnLeave) {
      uninformedLeaves++
      uninformedDates.push(checkDate.toLocaleDateString('en-IN'))
    }
  }

  // ─── Calculate Overall Score ───
  const baseScore = totalPresents * HR_SCORE_MULTIPLIER
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

  const overallScore = Math.max(0, baseScore - deductions)
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

    // Scoring
    totalPresents,
    hrScore: HR_SCORE_MULTIPLIER,
    baseScore,
    deductions,
    deductionDetails,
    overallScore,
    isLowScore,
    status: overallScore >= 7 ? 'GOOD' : 'LOW',

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
    'HR Score': r.hrScore,
    'Base Score': r.baseScore,
    'Deductions': r.deductions,
    'Overall Score': r.overallScore,
    'Status': r.status,
    'HRMS ID': r.hrms?.hrmsEmployeeId || '',
    'Joining Date': r.hrms?.joiningDate ? new Date(r.hrms.joiningDate).toLocaleDateString('en-IN') : '',
  }))
  const ws1 = XLSX.utils.json_to_sheet(reportData)
  ws1['!cols'] = [
    { wch: 6 }, { wch: 22 }, { wch: 25 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
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

  // Sheet 3: Scoring Rules
  const rulesData = [
    { 'Rule': 'HR Score Multiplier', 'Value': HR_SCORE_MULTIPLIER, 'Description': 'Total Presents × HR Score = Base Score' },
    { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
    { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
    { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
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
    'HR Score Multiplier': HR_SCORE_MULTIPLIER,
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
    { 'Field': '── SCORE ──', 'Value': '' },
    { 'Field': 'Base Score (Presents × 2)', 'Value': emp.baseScore },
    { 'Field': 'Deductions', 'Value': emp.deductions },
    { 'Field': 'Overall Score', 'Value': emp.overallScore },
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

  // Sheet 4: Scoring Rules
  const rulesData = [
    { 'Rule': 'HR Score Multiplier', 'Value': HR_SCORE_MULTIPLIER, 'Description': 'Total Presents × HR Score = Base Score' },
    { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
    { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
    { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
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
