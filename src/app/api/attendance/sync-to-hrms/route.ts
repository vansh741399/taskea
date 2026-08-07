import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v25·0806 — Sync Taskea Punch Records to HRMS
// ════════════════════════════════════════════════════════════════════════
// Pushes all active employees' punch-in/out data to HRMS via external API.
// This is a one-way sync: Taskea → HRMS.
//
// POST /api/attendance/sync-to-hrms
// Body: {
//   month?: number,  // default: current month
//   year?: number,   // default: current year
//   userId?: string, // optional: sync specific user only
// }
//
// Requires HRMS_BRIDGE_URL and HRMS_BRIDGE_API_KEY env vars to be set.
// Returns summary of synced records + any errors per user.
// ════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const now = new Date()
    const month = body.month || now.getMonth() + 1
    const year = body.year || now.getFullYear()
    const specificUserId = body.userId

    // HRMS bridge config
    const hrmsUrl = process.env.HRMS_BRIDGE_URL || 'https://laxree-hrms.vercel.app'
    const hrmsKey = process.env.HRMS_BRIDGE_API_KEY || process.env.ERP_BRIDGE_API_KEY

    if (!hrmsKey) {
      return NextResponse.json({
        success: false,
        error: 'HRMS bridge not configured',
        message: 'Set HRMS_BRIDGE_API_KEY on Vercel to enable sync to HRMS.',
        code: 'HRMS_NOT_CONFIGURED',
      }, { status: 503 })
    }

    // Build date range
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    // Fetch all active employees with their hrmsId
    const userWhere: any = {
      isActive: true,
      role: { in: ['EMPLOYEE', 'MANAGER'] },
      hrmsId: { not: null },
    }
    if (specificUserId) userWhere.id = specificUserId

    const users = await db.user.findMany({
      where: userWhere,
      select: {
        id: true, name: true, email: true, hrmsId: true,
        office: { select: { name: true, city: true } },
      },
      orderBy: [{ name: 'asc' }],
    })

    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No active employees with hrmsId found. Run HRMS sync first to link employees.',
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
        id: true,
        userId: true,
        punchIn: true,
        punchOut: true,
        status: true,
        punchInLat: true,
        punchInLng: true,
        punchOutLat: true,
        punchOutLng: true,
        punchInDistance: true,
        punchOutDistance: true,
        office: { select: { name: true, city: true, address: true } },
      },
      orderBy: { punchIn: 'asc' },
    })

    // Group punches by user
    const punchesByUser: Record<string, typeof punches> = {}
    punches.forEach(p => {
      if (!punchesByUser[p.userId]) punchesByUser[p.userId] = []
      punchesByUser[p.userId].push(p)
    })

    // Sync each user's punches to HRMS
    const results: any[] = []
    let totalSynced = 0
    let totalFailed = 0

    for (const user of users) {
      const userPunches = punchesByUser[user.id] || []

      if (userPunches.length === 0) {
        results.push({
          user: user.name,
          hrmsId: user.hrmsId,
          status: 'skipped',
          reason: 'No punch records for this month',
          count: 0,
        })
        continue
      }

      try {
        // Push to HRMS — format: attendance records with punch-in/out times
        const payload = {
          employeeId: user.hrmsId,
          employeeName: user.name,
          email: user.email,
          month,
          year,
          records: userPunches.map(p => ({
            date: new Date(p.punchIn).toISOString().split('T')[0],
            punchIn: p.punchIn,
            punchOut: p.punchOut,
            status: p.status,
            office: p.office?.name,
            officeCity: p.office?.city,
            punchInLocation: {
              lat: p.punchInLat,
              lng: p.punchInLng,
              distanceFromOffice: p.punchInDistance,
            },
            punchOutLocation: p.punchOutLat ? {
              lat: p.punchOutLat,
              lng: p.punchOutLng,
              distanceFromOffice: p.punchOutDistance,
            } : null,
          })),
        }

        const hrmsResponse = await fetch(
          `${hrmsUrl.replace(/\/$/, '')}/api/external/attendance/sync`,
          {
            method: 'POST',
            headers: {
              'x-hrms-api-key': hrmsKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        )

        if (hrmsResponse.ok) {
          totalSynced += userPunches.length
          results.push({
            user: user.name,
            hrmsId: user.hrmsId,
            status: 'synced',
            count: userPunches.length,
          })
        } else {
          totalFailed += userPunches.length
          const errText = await hrmsResponse.text().catch(() => '')
          results.push({
            user: user.name,
            hrmsId: user.hrmsId,
            status: 'failed',
            count: userPunches.length,
            error: `HRMS returned ${hrmsResponse.status}: ${errText.substring(0, 100)}`,
          })
        }
      } catch (e: any) {
        totalFailed += userPunches.length
        results.push({
          user: user.name,
          hrmsId: user.hrmsId,
          status: 'error',
          count: userPunches.length,
          error: e.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${totalSynced} punch records to HRMS for ${users.length} employees`,
      summary: {
        totalUsers: users.length,
        totalRecords: punches.length,
        synced: totalSynced,
        failed: totalFailed,
        skipped: results.filter(r => r.status === 'skipped').length,
      },
      details: results,
      hrmsUrl,
      month,
      year,
    })
  } catch (error) {
    console.error('Sync to HRMS error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}

// GET — check sync status (last sync, pending count)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    // Count active employees with hrmsId
    const usersWithHrmsId = await db.user.count({
      where: {
        isActive: true,
        role: { in: ['EMPLOYEE', 'MANAGER'] },
        hrmsId: { not: null },
      },
    })

    // Count total punch records this month
    const totalPunches = await db.punchRecord.count({
      where: { punchIn: { gte: startDate, lte: endDate } },
    })

    const hrmsConfigured = !!(process.env.HRMS_BRIDGE_API_KEY || process.env.ERP_BRIDGE_API_KEY)

    return NextResponse.json({
      hrmsConfigured,
      hrmsUrl: process.env.HRMS_BRIDGE_URL || 'https://laxree-hrms.vercel.app',
      month,
      year,
      usersWithHrmsId,
      totalPunchesThisMonth: totalPunches,
      message: hrmsConfigured
        ? 'HRMS bridge configured. Ready to sync.'
        : 'HRMS_BRIDGE_API_KEY not set on Vercel. Sync will not work until configured.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}
