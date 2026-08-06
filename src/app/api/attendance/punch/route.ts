import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v25·0801 — PUNCH-IN / PUNCH-OUT with 100m Geofencing
// ════════════════════════════════════════════════════════════════════════
// Allows EMPLOYEE/MANAGER to punch in/out only when within 100m of their
// assigned office. Uses Haversine formula for accurate distance calculation.
//
// POST /api/attendance/punch
// Body: {
//   userId: string,
//   action: "in" | "out",
//   latitude: number,
//   longitude: number,
//   accuracy?: number,        // GPS accuracy in meters
//   note?: string,
// }
// ════════════════════════════════════════════════════════════════════════

// Haversine formula — distance between two lat/lng points in meters
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, action, latitude, longitude, accuracy, note } = body

    // Validate required fields
    if (!userId || !action || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: userId, action, latitude, longitude' },
        { status: 400 }
      )
    }

    if (action !== 'in' && action !== 'out') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "in" or "out"' },
        { status: 400 }
      )
    }

    // Get user with office assignment
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        officeId: true,
        office: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only EMPLOYEE and MANAGER can punch
    if (user.role !== 'EMPLOYEE' && user.role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Only employees and managers can punch in/out' },
        { status: 403 }
      )
    }

    // User must have an assigned office
    if (!user.office) {
      return NextResponse.json({
        error: 'No office assigned. Contact admin to assign your office location.',
        code: 'NO_OFFICE_ASSIGNED',
      }, { status: 400 })
    }

    // Calculate distance from office
    const distance = haversineDistance(
      latitude,
      longitude,
      user.office.latitude,
      user.office.longitude
    )

    // Geofence check — must be within 100m
    if (distance > user.office.radiusMeters) {
      return NextResponse.json({
        error: `You are ${distance}m away from ${user.office.name}. Punch allowed only within ${user.office.radiusMeters}m of office.`,
        code: 'OUTSIDE_GEOFENCE',
        distance,
        officeRadius: user.office.radiusMeters,
        office: {
          name: user.office.name,
          address: user.office.address,
          latitude: user.office.latitude,
          longitude: user.office.longitude,
        },
      }, { status: 403 })
    }

    const now = new Date()
    const userAgent = request.headers.get('user-agent') || 'unknown'

    if (action === 'in') {
      // Check if user already has an active punch (no punch-out)
      const activePunch = await db.punchRecord.findFirst({
        where: {
          userId: user.id,
          status: 'IN_PROGRESS',
        },
        orderBy: { punchIn: 'desc' },
      })

      if (activePunch) {
        return NextResponse.json({
          error: 'You are already punched in. Punch out first.',
          code: 'ALREADY_PUNCHED_IN',
          activePunch: {
            id: activePunch.id,
            punchIn: activePunch.punchIn,
            office: user.office.name,
          },
        }, { status: 400 })
      }

      // Create new punch-in record
      const punch = await db.punchRecord.create({
        data: {
          userId: user.id,
          officeId: user.office.id,
          punchIn: now,
          punchInLat: latitude,
          punchInLng: longitude,
          punchInAccuracy: accuracy || null,
          punchInDistance: distance,
          punchInDevice: userAgent,
          punchInNote: note || null,
          status: 'IN_PROGRESS',
        },
        include: {
          office: { select: { name: true, city: true, address: true } },
        },
      })

      return NextResponse.json({
        success: true,
        message: `Punched in successfully at ${user.office.name}`,
        punch: {
          id: punch.id,
          punchIn: punch.punchIn,
          punchInDistance: punch.punchInDistance,
          accuracy: punch.punchInAccuracy,
          office: punch.office,
        },
      })
    }

    // action === 'out'
    // Find the active punch-in
    const activePunch = await db.punchRecord.findFirst({
      where: {
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { punchIn: 'desc' },
    })

    if (!activePunch) {
      return NextResponse.json({
        error: 'No active punch-in found. Punch in first.',
        code: 'NO_ACTIVE_PUNCH',
      }, { status: 400 })
    }

    // Update with punch-out
    const updated = await db.punchRecord.update({
      where: { id: activePunch.id },
      data: {
        punchOut: now,
        punchOutLat: latitude,
        punchOutLng: longitude,
        punchOutAccuracy: accuracy || null,
        punchOutDistance: distance,
        punchOutDevice: userAgent,
        punchOutNote: note || null,
        status: 'COMPLETE',
      },
      include: {
        office: { select: { name: true, city: true, address: true } },
      },
    })

    // Calculate work duration
    const workDurationMs = now.getTime() - activePunch.punchIn.getTime()
    const workHours = Math.floor(workDurationMs / (1000 * 60 * 60))
    const workMinutes = Math.floor((workDurationMs % (1000 * 60 * 60)) / (1000 * 60))

    return NextResponse.json({
      success: true,
      message: `Punched out successfully. Worked ${workHours}h ${workMinutes}m`,
      punch: {
        id: updated.id,
        punchIn: updated.punchIn,
        punchOut: updated.punchOut,
        workDuration: `${workHours}h ${workMinutes}m`,
        punchOutDistance: updated.punchOutDistance,
        accuracy: updated.punchOutAccuracy,
        office: updated.office,
      },
    })
  } catch (error) {
    console.error('Punch API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// GET — fetch punch records for a user (today, or by date range)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date') // YYYY-MM-DD
    const month = searchParams.get('month')
    const year = searchParams.get('year')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Build date filter
    let dateFilter: any = {}
    if (date) {
      // Specific day
      const start = new Date(`${date}T00:00:00.000Z`)
      const end = new Date(`${date}T23:59:59.999Z`)
      dateFilter = { punchIn: { gte: start, lte: end } }
    } else if (month && year) {
      // Specific month
      const start = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1))
      const end = new Date(Date.UTC(parseInt(year), parseInt(month), 0, 23, 59, 59, 999))
      dateFilter = { punchIn: { gte: start, lte: end } }
    } else {
      // Default: today
      const today = new Date()
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999))
      dateFilter = { punchIn: { gte: start, lte: end } }
    }

    const records = await db.punchRecord.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      include: {
        office: { select: { name: true, city: true, address: true } },
      },
      orderBy: { punchIn: 'desc' },
    })

    // Find active punch (if any)
    const activePunch = records.find(r => r.status === 'IN_PROGRESS')

    return NextResponse.json({
      records,
      activePunch: activePunch || null,
      count: records.length,
    })
  } catch (error) {
    console.error('Punch GET API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
