import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ════════════════════════════════════════════════════════════════════════
// v25·0806 — HR REPORT with Marking Scheme (per uploaded format)
// ════════════════════════════════════════════════════════════════════════
// Columns (exact match to user's uploaded image):
//   S.No | Name of Employee | Designation | Full Day | Half Days |
//   Uninformed Leaves | Late Comings / Early Goings | Overall Score | Status
//
// SCORING (from marking scheme image):
//   HR Score = 2 (multiplier)
//   Base Score = Total Presents × HR Score
//   Deductions:
//     -1 if leaves > 2 in a month
//     -1 if late comings/early goings > 1 in a month
//     -1 if uninformed leaves > 1
//     -1 if half days > 2 in a month
//     -2 if leaves exceed 5 days
//     -2 if late comings exceed 4 in a month
//     -2 if uninformed leaves > 3
//     -2 if half days > 4 in a month
//   Overall Score = Base Score - Total Deductions
//   If Overall Score < 7 → display in RED
//
// GET /api/hr-report?month=8&year=2026&location=Ajmer&format=xlsx
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
      select: {
        userId: true,
        punchIn: true,
        punchOut: true,
        status: true,
      },
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
        userId: true,
        leaveType: true,
        fromDate: true,
        toDate: true,
        status: true,
        totalDays: true,
        reason: true,
      },
    })

    // 4. Compute stats per user
    const report = users.map((user, index) => {
      const userPunches = punches.filter(p => p.userId === user.id)
      const userLeaves = leaves.filter(l => l.userId === user.id)

      // ─── Count present days (unique punch-in days) ───
      const presentDates = new Set(
        userPunches.map(p => new Date(p.punchIn).toDateString())
      )
      const totalPresents = presentDates.size

      // ─── Count approved leaves ───
      const approvedLeaves = userLeaves.filter(l => l.status === 'APPROVED')
      const fullDayLeaves = approvedLeaves.filter(l =>
        l.leaveType !== 'HALF_DAY' && (l.totalDays || 0) >= 1
      ).length
      const halfDayLeaves = approvedLeaves.filter(l =>
        l.leaveType === 'HALF_DAY' || (l.totalDays || 0) === 0.5
      ).length
      const totalLeaveDays = approvedLeaves.reduce((sum, l) => sum + (l.totalDays || 0), 0)

      // ─── Count late comings (punch-in after 10:15 AM) ───
      let lateComings = 0
      let earlyGoings = 0
      userPunches.forEach(p => {
        const punchInDate = new Date(p.punchIn)
        const punchInHour = punchInDate.getHours()
        const punchInMin = punchInDate.getMinutes()
        // Late if after 10:15 AM
        if (punchInHour > SHIFT_START_HOUR ||
            (punchInHour === SHIFT_START_HOUR && punchInMin > LATE_THRESHOLD_MINUTES)) {
          lateComings++
        }
        // Early going if punch-out before 7:00 PM
        if (p.punchOut) {
          const punchOutDate = new Date(p.punchOut)
          const punchOutHour = punchOutDate.getHours()
          if (punchOutHour < SHIFT_END_HOUR) {
            earlyGoings++
          }
        }
      })

      const lateComingsEarlyGoings = lateComings + earlyGoings

      // ─── Count uninformed leaves (absent days without approved leave) ───
      // For each working day in the month, check if employee was:
      //   - Present (has punch record), OR
      //   - On approved leave
      // If neither → uninformed leave
      let uninformedLeaves = 0
      const today = new Date()
      const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year

      for (let day = 1; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day)
        // Skip future days (if current month)
        if (isCurrentMonth && checkDate > today) break
        // Skip Sundays (day 0)
        if (checkDate.getDay() === 0) continue

        const dateStr = checkDate.toDateString()
        const wasPresent = presentDates.has(dateStr)
        const wasOnLeave = approvedLeaves.some(l => {
          const from = new Date(l.fromDate)
          const to = new Date(l.toDate)
          return checkDate >= from && checkDate <= to
        })

        if (!wasPresent && !wasOnLeave) {
          uninformedLeaves++
        }
      }

      // ─── Calculate Overall Score (per marking scheme) ───
      const baseScore = totalPresents * HR_SCORE_MULTIPLIER
      let deductions = 0
      const deductionDetails: string[] = []

      // -1 deductions
      if (totalLeaveDays > 2) {
        deductions += 1
        deductionDetails.push('-1 (leaves > 2)')
      }
      if (lateComingsEarlyGoings > 1) {
        deductions += 1
        deductionDetails.push('-1 (late/early > 1)')
      }
      if (uninformedLeaves > 1) {
        deductions += 1
        deductionDetails.push('-1 (uninformed > 1)')
      }
      if (halfDayLeaves > 2) {
        deductions += 1
        deductionDetails.push('-1 (half days > 2)')
      }

      // -2 deductions
      if (totalLeaveDays > 5) {
        deductions += 2
        deductionDetails.push('-2 (leaves > 5)')
      }
      if (lateComingsEarlyGoings > 4) {
        deductions += 2
        deductionDetails.push('-2 (late/early > 4)')
      }
      if (uninformedLeaves > 3) {
        deductions += 2
        deductionDetails.push('-2 (uninformed > 3)')
      }
      if (halfDayLeaves > 4) {
        deductions += 2
        deductionDetails.push('-2 (half days > 4)')
      }

      const overallScore = Math.max(0, baseScore - deductions)
      const isLowScore = overallScore < 7 // red if < 7

      return {
        sno: index + 1,
        id: user.id,
        name: user.name,
        designation: user.designation || '',
        department: user.department || '',
        location: user.office?.city || user.location || '',
        email: user.email,

        // Attendance stats
        fullDayLeaves,
        halfDayLeaves,
        uninformedLeaves,
        lateComings,
        earlyGoings,
        lateComingsEarlyGoings,

        // Scoring
        totalPresents,
        hrScore: HR_SCORE_MULTIPLIER,
        baseScore,
        deductions,
        deductionDetails,
        overallScore,
        isLowScore,

        // Status
        status: overallScore >= 7 ? 'GOOD' : 'LOW',
      }
    })

    // ─── Return in requested format ───
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new()

      // Sheet 1: HR Report (exact format from uploaded image)
      const reportData = report.map(r => ({
        'S.No': r.sno,
        'Name of Employee': r.name,
        'Designation': r.designation,
        'Full Day': r.fullDayLeaves,
        'Half Days': r.halfDayLeaves,
        'Uninformed Leaves': r.uninformedLeaves,
        'Late Comings / Early Goings': r.lateComingsEarlyGoings,
        'Total Presents': r.totalPresents,
        'HR Score': r.hrScore,
        'Base Score': r.baseScore,
        'Deductions': r.deductions,
        'Overall Score': r.overallScore,
        'Status': r.status,
        'Department': r.department,
        'Location': r.location,
      }))
      const ws1 = XLSX.utils.json_to_sheet(reportData)
      ws1['!cols'] = [
        { wch: 6 }, { wch: 22 }, { wch: 25 },
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 22 },
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 8 }, { wch: 15 }, { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, ws1, 'HR Report')

      // Sheet 2: Scoring Rules (for reference)
      const rulesData = [
        { 'Rule': 'HR Score Multiplier', 'Value': HR_SCORE_MULTIPLIER, 'Description': 'Total Presents × HR Score = Base Score' },
        { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
        { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
        { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
        {},
        { 'Rule': '-1 Deductions', 'Value': '', 'Description': '' },
        { 'Rule': 'Leaves > 2', 'Value': -1, 'Description': 'If total leave days > 2 in a month' },
        { 'Rule': 'Late/Early > 1', 'Value': -1, 'Description': 'If late comings + early goings > 1' },
        { 'Rule': 'Uninformed > 1', 'Value': -1, 'Description': 'If uninformed leaves > 1' },
        { 'Rule': 'Half Days > 2', 'Value': -1, 'Description': 'If half day leaves > 2' },
        {},
        { 'Rule': '-2 Deductions', 'Value': '', 'Description': '' },
        { 'Rule': 'Leaves > 5', 'Value': -2, 'Description': 'If total leave days > 5' },
        { 'Rule': 'Late/Early > 4', 'Value': -2, 'Description': 'If late comings + early goings > 4' },
        { 'Rule': 'Uninformed > 3', 'Value': -2, 'Description': 'If uninformed leaves > 3' },
        { 'Rule': 'Half Days > 4', 'Value': -2, 'Description': 'If half day leaves > 4' },
      ]
      const ws2 = XLSX.utils.json_to_sheet(rulesData)
      ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 50 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Scoring Rules')

      // Sheet 3: Summary by Location
      const locSummary: Record<string, any> = {}
      report.forEach(r => {
        const loc = r.location || 'Unknown'
        if (!locSummary[loc]) {
          locSummary[loc] = {
            'Location': loc,
            'Total Employees': 0,
            'Avg Presents': 0,
            'Avg Score': 0,
            'Low Score Count': 0,
          }
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
      const ws3 = XLSX.utils.json_to_sheet(locArray)
      XLSX.utils.book_append_sheet(wb, ws3, 'Location Summary')

      // Sheet 4: Report Info
      const metaData = [{
        'Report': 'Laxree HR Report',
        'Generated At': new Date().toLocaleString('en-IN'),
        'Month': `${month}/${year}`,
        'Location Filter': location,
        'Total Employees': report.length,
        'HR Score Multiplier': HR_SCORE_MULTIPLIER,
        'Low Score Threshold': 7,
      }]
      const ws4 = XLSX.utils.json_to_sheet(metaData)
      ws4['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, ws4, 'Report Info')

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      const filename = `HR_Report_${year}_${String(month).padStart(2, '0')}_${location}.xlsx`
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // JSON format
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      filters: { month, year, location },
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
    })
  } catch (error) {
    console.error('HR Report API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report', details: String(error) },
      { status: 500 }
    )
  }
}
