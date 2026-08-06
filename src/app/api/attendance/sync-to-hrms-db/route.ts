import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  upsertHrmsAttendanceRecord,
  fetchHrmsEmployeeCodeByCuid,
  computeDailyPunchSummary,
  isHrmsDbWritable,
} from '@/lib/hrms-db-write'

// ════════════════════════════════════════════════════════════════════════
// v25·0806-fix — Backfill HRMS Attendance from ERP punches
// ════════════════════════════════════════════════════════════════════════
// POST /api/attendance/sync-to-hrms-db
//
// One-shot backfill of ERP punches → HRMS Attendance table.
// Use this to retroactively push today's (or a specific date's) punches
// into HRMS for users who already punched before this fix was deployed.
//
// Body:
//   {
//     userId?:  string,  // sync only this user (optional)
//     date?:    string,  // "YYYY-MM-DD" IST date (optional, default: today IST)
//   }
//
// SAFETY: UPSERT only. No DELETE. Only touches the SPECIFIC date being
// synced (defaults to today IST). Never modifies historical records.
// ════════════════════════════════════════════════════════════════════════

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    if (!isHrmsDbWritable()) {
      return NextResponse.json({
        success: false,
        error: 'HRMS_DATABASE_URL not configured',
        message: 'Set HRMS_DATABASE_URL on Vercel to enable direct DB sync.',
        code: 'HRMS_DB_NOT_CONFIGURED',
      }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const specificUserId = body.userId
    const dateStr = body.date as string | undefined // "YYYY-MM-DD" IST

    // Compute IST date range
    let y: number, m: number, d: number
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [yStr, mStr, dStr] = dateStr.split('-')
      y = parseInt(yStr); m = parseInt(mStr); d = parseInt(dStr)
    } else {
      const now = new Date()
      const ist = new Date(now.getTime() + IST_OFFSET_MS)
      y = ist.getUTCFullYear()
      m = ist.getUTCMonth() + 1
      d = ist.getUTCDate()
    }

    const startUtcMs = Date.UTC(y, m - 1, d) - IST_OFFSET_MS
    const endUtcMs = Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS - 1
    const startDate = new Date(startUtcMs)
    const endDate = new Date(endUtcMs)

    // Fetch all ERP users with hrmsId
    const userWhere: any = {
      isActive: true,
      role: { in: ['EMPLOYEE', 'MANAGER'] },
      hrmsId: { not: null },
    }
    if (specificUserId) userWhere.id = specificUserId

    const users = await db.user.findMany({
      where: userWhere,
      select: { id: true, name: true, hrmsId: true, office: { select: { city: true } } },
      orderBy: [{ name: 'asc' }],
    })

    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No active employees with hrmsId found.',
        syncedCount: 0,
      })
    }

    // Fetch all punch records for these users in the date range
    const punches = await db.punchRecord.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        punchIn: { gte: startDate, lte: endDate },
      },
      select: {
        id: true, userId: true,
        punchIn: true, punchOut: true, status: true,
      },
      orderBy: { punchIn: 'asc' },
    })

    // Group punches by user
    const punchesByUser: Record<string, typeof punches> = {}
    for (const p of punches) {
      if (!punchesByUser[p.userId]) punchesByUser[p.userId] = [] as any
      punchesByUser[p.userId].push(p)
    }

    // Sync each user's punches to HRMS
    const results: any[] = []
    let totalSynced = 0
    let totalFailed = 0
    let totalSkipped = 0

    for (const user of users) {
      const userPunches = punchesByUser[user.id] || []

      if (userPunches.length === 0) {
        totalSkipped++
        results.push({
          user: user.name,
          hrmsId: user.hrmsId,
          status: 'skipped',
          reason: 'No punches for this date',
        })
        continue
      }

      // Resolve HRMS employee code (EMP-XXX) from the HRMS cuid
      const hrmsEmpCode = await fetchHrmsEmployeeCodeByCuid(user.hrmsId!)
      if (!hrmsEmpCode) {
        totalFailed++
        results.push({
          user: user.name,
          hrmsId: user.hrmsId,
          status: 'failed',
          reason: 'No HRMS Employee found with this cuid',
        })
        continue
      }

      // Compute consolidated daily summary
      const summary = computeDailyPunchSummary(
        userPunches.map(p => ({
          punchIn: new Date(p.punchIn),
          punchOut: p.punchOut ? new Date(p.punchOut) : null,
        }))
      )

      // UPSERT to HRMS
      const result = await upsertHrmsAttendanceRecord({
        hrmsEmployeeId: hrmsEmpCode,
        date: startDate,
        checkIn: summary.checkIn,
        checkOut: summary.checkOut,
        totalHours: summary.totalHours,
        overtimeHours: summary.overtimeHours,
        status: summary.status,
        lateEntry: summary.lateEntry,
        earlyOut: summary.earlyOut,
        halfDay: summary.halfDay,
        remarks: `Backfilled from ERP on ${new Date().toISOString()}`,
      })

      if (result.success) {
        totalSynced++
        results.push({
          user: user.name,
          hrmsEmployeeId: hrmsEmpCode,
          status: result.mode,
          attendanceId: result.id,
          summary: {
            checkIn: summary.checkIn?.toISOString() || null,
            checkOut: summary.checkOut?.toISOString() || null,
            totalHours: summary.totalHours,
            overtimeHours: summary.overtimeHours,
            status: summary.status,
            lateEntry: summary.lateEntry,
            earlyOut: summary.earlyOut,
          },
        })
      } else {
        totalFailed++
        results.push({
          user: user.name,
          hrmsEmployeeId: hrmsEmpCode,
          status: 'failed',
          error: result.error,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled ${totalSynced} attendance records to HRMS for ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} IST`,
      date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      summary: {
        totalUsers: users.length,
        usersWithPunches: Object.keys(punchesByUser).length,
        synced: totalSynced,
        failed: totalFailed,
        skipped: totalSkipped,
      },
      details: results,
    })
  } catch (error: any) {
    console.error('Backfill HRMS attendance error:', error)
    return NextResponse.json(
      { error: 'Backfill failed', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
