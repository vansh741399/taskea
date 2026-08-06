import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ════════════════════════════════════════════════════════════════════════
// v25·0801 — HR REPORT with month/location/year filters + Excel export
// ════════════════════════════════════════════════════════════════════════
// Founder-only endpoint that generates an HR report with:
//   - Filters: month, year, location (city)
//   - Excel download (multiple sheets)
//   - JSON response (for preview)
//
// GET /api/hr-report?month=8&year=2026&location=Ajmer&format=xlsx
// GET /api/hr-report?month=8&year=2026&location=Ajmer&format=json
// ════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const location = searchParams.get('location') // "Ajmer" | "Jaipur" | "Gurugram" | "all"
    const format = searchParams.get('format') || 'json'

    // Build date range for the specified month/year
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    // Build user filter (by location)
    const userWhere: any = { isActive: true }
    if (location && location !== 'all') {
      userWhere.OR = [
        { location: { contains: location, mode: 'insensitive' } },
        { office: { city: { contains: location, mode: 'insensitive' } } },
      ]
    }

    // 1. Fetch all users with their data
    const users = await db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        department: true,
        designation: true,
        location: true,
        joinDate: true,
        hrmsId: true,
        office: { select: { name: true, city: true, address: true } },
      },
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
    })

    const userIds = users.map(u => u.id)

    // Tasks: filter by completion date in the month
    const tasks = await db.task.findMany({
      where: {
        ownerId: { in: userIds },
        OR: [
          { completedAt: { gte: startDate, lte: endDate } },
          { createdAt: { gte: startDate, lte: endDate } },
          { dueDate: { gte: startDate, lte: endDate } },
        ],
      },
      select: {
        ownerId: true,
        status: true,
        priority: true,
        completedAt: true,
        dueDate: true,
        createdAt: true,
      },
    })

    // Leaves: filter by date range overlap
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

    // Punch records
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
        office: { select: { name: true, city: true } },
      },
    })

    // 3. Aggregate per-user stats
    const report = users.map(user => {
      const userTasks = tasks.filter(t => t.ownerId === user.id)
      const userLeaves = leaves.filter(l => l.userId === user.id)
      const userPunches = punches.filter(p => p.userId === user.id)

      const completedTasks = userTasks.filter(t => t.status === 'COMPLETED').length
      const overdueTasks = userTasks.filter(t =>
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        t.dueDate &&
        new Date(t.dueDate) < new Date()
      ).length
      const inProgressTasks = userTasks.filter(t =>
        ['IN_PROGRESS', 'IN_REVIEW', 'PENDING'].includes(t.status)
      ).length

      const approvedLeaves = userLeaves.filter(l => l.status === 'APPROVED')
      const pendingLeaves = userLeaves.filter(l => l.status === 'PENDING')
      const totalLeaveDays = approvedLeaves.reduce((sum, l) => sum + (l.totalDays || 0), 0)

      const punchDays = new Set(
        userPunches.map(p => new Date(p.punchIn).toDateString())
      ).size
      const totalPunches = userPunches.length
      const completePunches = userPunches.filter(p => p.status === 'COMPLETE').length

      let totalWorkMs = 0
      userPunches.forEach(p => {
        if (p.punchOut) {
          totalWorkMs += new Date(p.punchOut).getTime() - new Date(p.punchIn).getTime()
        }
      })
      const totalWorkHours = Math.round((totalWorkMs / (1000 * 60 * 60)) * 10) / 10

      const totalTasksForScore = userTasks.length || 1
      const performanceScore = Math.round((completedTasks / totalTasksForScore) * 100)

      return {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        department: user.department || '',
        designation: user.designation || '',
        location: user.office?.city || user.location || '',
        office: user.office?.name || '',
        joinDate: user.joinDate ? new Date(user.joinDate).toLocaleDateString('en-IN') : '',
        hrmsId: user.hrmsId || '',

        totalTasks: userTasks.length,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        performanceScore,

        totalLeaves: userLeaves.length,
        approvedLeaves: approvedLeaves.length,
        pendingLeaves: pendingLeaves.length,
        totalLeaveDays,

        punchDays,
        totalPunches,
        completePunches,
        totalWorkHours,

        status: user.role === 'FOUNDER' ? 'Founder' :
                user.role === 'ADMIN' ? 'Admin' :
                user.role === 'DIRECTOR' ? 'Director' :
                user.role === 'EA' ? 'EA' :
                user.role === 'MANAGER' ? 'Manager' : 'Employee',
      }
    })

    // 4. Return in requested format
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new()

      // Sheet 1: Employee Summary
      const summaryData = report.map(r => ({
        'Name': r.name,
        'Role': r.status,
        'Department': r.department,
        'Designation': r.designation,
        'Location': r.location,
        'Office': r.office,
        'Email': r.email,
        'Phone': r.phone,
        'Join Date': r.joinDate,
        'HRMS ID': r.hrmsId,
        'Total Tasks': r.totalTasks,
        'Completed': r.completedTasks,
        'In Progress': r.inProgressTasks,
        'Overdue': r.overdueTasks,
        'Performance %': r.performanceScore,
        'Total Leaves': r.totalLeaves,
        'Approved Leaves': r.approvedLeaves,
        'Pending Leaves': r.pendingLeaves,
        'Leave Days': r.totalLeaveDays,
        'Punch Days': r.punchDays,
        'Total Punches': r.totalPunches,
        'Work Hours': r.totalWorkHours,
      }))
      const ws1 = XLSX.utils.json_to_sheet(summaryData)
      ws1['!cols'] = [
        { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 15 },
        { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 10 },
      ]
      XLSX.utils.book_append_sheet(wb, ws1, 'Employee Summary')

      // Sheet 2: Department-wise Summary
      const deptSummary: Record<string, any> = {}
      report.forEach(r => {
        const dept = r.department || 'Unassigned'
        if (!deptSummary[dept]) {
          deptSummary[dept] = {
            'Department': dept,
            'Total Employees': 0,
            'Total Tasks': 0,
            'Completed Tasks': 0,
            'Overdue Tasks': 0,
            'Total Leave Days': 0,
            'Total Work Hours': 0,
            'Avg Performance %': 0,
          }
        }
        deptSummary[dept]['Total Employees']++
        deptSummary[dept]['Total Tasks'] += r.totalTasks
        deptSummary[dept]['Completed Tasks'] += r.completedTasks
        deptSummary[dept]['Overdue Tasks'] += r.overdueTasks
        deptSummary[dept]['Total Leave Days'] += r.totalLeaveDays
        deptSummary[dept]['Total Work Hours'] += r.totalWorkHours
        deptSummary[dept]['Avg Performance %'] += r.performanceScore
      })
      const deptArray = Object.values(deptSummary).map((d: any) => ({
        ...d,
        'Avg Performance %': d['Total Employees'] > 0
          ? Math.round(d['Avg Performance %'] / d['Total Employees'])
          : 0,
      }))
      const ws2 = XLSX.utils.json_to_sheet(deptArray)
      ws2['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ]
      XLSX.utils.book_append_sheet(wb, ws2, 'Department Summary')

      // Sheet 3: Location-wise Summary
      const locSummary: Record<string, any> = {}
      report.forEach(r => {
        const loc = r.location || 'Unknown'
        if (!locSummary[loc]) {
          locSummary[loc] = {
            'Location': loc,
            'Total Employees': 0,
            'Total Tasks': 0,
            'Completed Tasks': 0,
            'Total Leave Days': 0,
            'Total Punch Days': 0,
            'Total Work Hours': 0,
          }
        }
        locSummary[loc]['Total Employees']++
        locSummary[loc]['Total Tasks'] += r.totalTasks
        locSummary[loc]['Completed Tasks'] += r.completedTasks
        locSummary[loc]['Total Leave Days'] += r.totalLeaveDays
        locSummary[loc]['Total Punch Days'] += r.punchDays
        locSummary[loc]['Total Work Hours'] += r.totalWorkHours
      })
      const ws3 = XLSX.utils.json_to_sheet(Object.values(locSummary))
      ws3['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ]
      XLSX.utils.book_append_sheet(wb, ws3, 'Location Summary')

      // Sheet 4: Metadata
      const metaData = [{
        'Report': 'Laxree HR Report',
        'Generated At': new Date().toLocaleString('en-IN'),
        'Month': `${month}/${year}`,
        'Location Filter': location || 'all',
        'Total Employees': report.length,
        'Total Tasks': report.reduce((s, r) => s + r.totalTasks, 0),
        'Total Completed': report.reduce((s, r) => s + r.completedTasks, 0),
        'Total Overdue': report.reduce((s, r) => s + r.overdueTasks, 0),
        'Total Leave Days': report.reduce((s, r) => s + r.totalLeaveDays, 0),
        'Total Work Hours': report.reduce((s, r) => s + r.totalWorkHours, 0),
      }]
      const ws4 = XLSX.utils.json_to_sheet(metaData)
      ws4['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, ws4, 'Report Info')

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const filename = `HR_Report_${year}_${String(month).padStart(2, '0')}_${location || 'all'}.xlsx`
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
      filters: {
        month,
        year,
        location: location || 'all',
      },
      summary: {
        totalEmployees: report.length,
        totalTasks: report.reduce((s, r) => s + r.totalTasks, 0),
        completedTasks: report.reduce((s, r) => s + r.completedTasks, 0),
        overdueTasks: report.reduce((s, r) => s + r.overdueTasks, 0),
        totalLeaveDays: report.reduce((s, r) => s + r.totalLeaveDays, 0),
        totalWorkHours: report.reduce((s, r) => s + r.totalWorkHours, 0),
        avgPerformance: report.length > 0
          ? Math.round(report.reduce((s, r) => s + r.performanceScore, 0) / report.length)
          : 0,
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
