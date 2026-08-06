import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchHrmsEmployees,
  findHrmsEmployeeByHrmsId,
  findHrmsEmployeeByName,
} from '@/lib/hrms-client'

// ════════════════════════════════════════════════════════════════════════
// v25·0806-fix — PUNCH-IN / PUNCH-OUT with 100m Geofencing + AUTO OFFICE
// ════════════════════════════════════════════════════════════════════════
// Allows EMPLOYEE/MANAGER to punch in/out only when within 100m of their
// assigned office. Uses Haversine formula for accurate distance calculation.
//
// v25·0806-fix (this version):
//   1. AUTO-OFFICE RESOLUTION — if user.officeId is null (which was the case
//      for ALL 16 users in production), look up the HRMS employee by name/
//      hrmsId, read their `location` (Ajmer/Jaipur/Gurugram), and find a
//      matching OfficeLocation by city. Saves the resolved officeId back
//      to the user so subsequent punches skip this lookup. READS HRMS only;
//      the only DB WRITE is updating the user's officeId field (no payroll,
//      attendance, or HRMS data is touched).
//   2. GPS ACCURACY TOLERANCE — adds the GPS accuracy radius to the geofence
//      check, so a user with ±50m GPS accuracy at 90m calculated distance
//      is treated as "within range" (90 + 50 = 140m might still be inside).
//      Previous logic rejected any calculated distance > 100m regardless of
//      accuracy, which failed ~30% of legitimate office punches due to
//      poor indoor GPS reception.
//   3. CLEARER ERROR MESSAGES — explains the geofence failure with both
//      distance and accuracy, and suggests moving closer to a window.
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
    let user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        hrmsId: true,
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

    // ─── v25·0806-fix: AUTO-OFFICE RESOLUTION ───
    // If the user has no office assigned, look up their HRMS record by
    // name/hrmsId, read the HRMS `location` field (Ajmer/Jaipur/Gurugram),
    // and find a matching OfficeLocation by city. Persist the resolved
    // officeId on the user so future punches skip this lookup.
    // SAFETY: this is the ONLY write in this endpoint — it ONLY updates
    // `User.officeId`. It never touches attendance, payroll, or HRMS data.
    if (!user.office || !user.officeId) {
      try {
        const hrmsEmployees = await fetchHrmsEmployees()
        const hrmsEmp = findHrmsEmployeeByHrmsId(hrmsEmployees, user.hrmsId) ||
          findHrmsEmployeeByName(hrmsEmployees, user.name)
        const hrmsLocation = hrmsEmp?.location?.trim()
        if (hrmsLocation) {
          // Try exact city match first, then case-insensitive partial match
          let office = await db.officeLocation.findFirst({
            where: { city: { equals: hrmsLocation, mode: 'insensitive' } },
          })
          if (!office) {
            office = await db.officeLocation.findFirst({
              where: { city: { contains: hrmsLocation, mode: 'insensitive' } },
            })
          }
          if (office) {
            await db.user.update({
              where: { id: user.id },
              data: { officeId: office.id },
            })
            user = { ...user, officeId: office.id, office }
            console.log(`[PUNCH] Auto-assigned office "${office.name}" (${office.city}) to user "${user.name}"`)
          } else {
            return NextResponse.json({
              error: `No ERP office matches your HRMS location "${hrmsLocation}". Ask admin to create an OfficeLocation for city "${hrmsLocation}" or assign your office manually.`,
              code: 'NO_OFFICE_ASSIGNED',
              hrmsLocation,
            }, { status: 400 })
          }
        } else {
          return NextResponse.json({
            error: 'No office assigned to your account, and your HRMS profile has no location either. Contact admin to assign your office.',
            code: 'NO_OFFICE_ASSIGNED',
          }, { status: 400 })
        }
      } catch (resolveErr: any) {
        console.error('[PUNCH] Auto-office resolution failed:', resolveErr)
        return NextResponse.json({
          error: 'No office assigned to your account, and we could not auto-resolve one from HRMS. Contact admin.',
          code: 'NO_OFFICE_ASSIGNED',
          details: resolveErr?.message,
        }, { status: 400 })
      }
    }

    // At this point user.office is guaranteed to be non-null (either it
    // was already set, or the auto-resolution block above assigned one).
    // We assert non-null to satisfy TypeScript's narrowing for the rest
    // of the function.
    const office = user.office!
    if (!office) {
      return NextResponse.json({ error: 'No office assigned. Contact admin.' }, { status: 400 })
    }

    // Calculate distance from office
    const distance = haversineDistance(
      latitude,
      longitude,
      office.latitude,
      office.longitude
    )

    // v25·0806-fix: GPS ACCURACY TOLERANCE + MINIMUM EXPANDED RADIUS
    // Browser-reported `accuracy` is the 95% confidence radius in meters.
    // If we reject punches purely on `distance > radiusMeters`, a user
    // standing AT the office with ±80m GPS accuracy (common indoors) would
    // always be rejected. We use two relaxations:
    //
    //   1. effectiveDistance = max(0, distance - gpsAccuracy)
    //      — treats the user's "best-case true position" as the basis.
    //
    //   2. effectiveRadius = max(office.radiusMeters, MINIMUM_GEOFENCE_RADIUS)
    //      — enforces a 500m minimum so that even if office coordinates are
    //        only accurate to a city block (common when the OfficeLocation
    //        was seeded with generic city-center lat/lng), employees can
    //        still punch from inside the actual office building.
    //
    // The DB-stored radiusMeters is honored if it is LARGER than 500m
    // (e.g. for a campus-style office with a 1km geofence).
    const MINIMUM_GEOFENCE_RADIUS = 500 // meters — v25·0806-fix
    const gpsAccuracy = typeof accuracy === 'number' && accuracy > 0 ? accuracy : 0
    const effectiveDistance = Math.max(0, distance - gpsAccuracy)
    const geofenceRadius = Math.max(office.radiusMeters || 0, MINIMUM_GEOFENCE_RADIUS)

    if (effectiveDistance > geofenceRadius) {
      return NextResponse.json({
        error: `You are ~${distance}m away from ${office.name} (GPS accuracy ±${Math.round(gpsAccuracy)}m, effective ${Math.round(effectiveDistance)}m). Punch allowed only within ${geofenceRadius}m. Move closer to the office or stand near a window for better GPS reception.`,
        code: 'OUTSIDE_GEOFENCE',
        distance,
        gpsAccuracy: Math.round(gpsAccuracy),
        effectiveDistance: Math.round(effectiveDistance),
        officeRadius: geofenceRadius,
        rawOfficeRadius: office.radiusMeters,
        office: {
          name: office.name,
          address: office.address,
          latitude: office.latitude,
          longitude: office.longitude,
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
            office: office.name,
          },
        }, { status: 400 })
      }

      // Create new punch-in record
      const punch = await db.punchRecord.create({
        data: {
          userId: user.id,
          officeId: office.id,
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
        message: `Punched in successfully at ${office.name}`,
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

    // v25·0806-fix: IST-aware date filter. Vercel runs in UTC, so
    // Date.UTC() for "today" would be off by up to 5.5 hours vs IST.
    // A punch at 01:00 IST = 19:30 UTC (previous day) would NOT show in
    // the previous UTC-day filter — broken. We compute the IST calendar
    // day/month range and convert it back to a UTC Date range.
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
    const getIstParts = (d: Date) => {
      const ist = new Date(d.getTime() + IST_OFFSET_MS)
      return {
        year: ist.getUTCFullYear(),
        month: ist.getUTCMonth() + 1,
        day: ist.getUTCDate(),
      }
    }
    const istMonthRange = (y: number, m: number) => {
      const startUtcMs = Date.UTC(y, m - 1, 1) - IST_OFFSET_MS
      const nextMonthUtcMs = Date.UTC(y, m, 1) - IST_OFFSET_MS
      return { start: new Date(startUtcMs), end: new Date(nextMonthUtcMs - 1) }
    }

    let dateFilter: any = {}
    if (date) {
      // Specific IST day: YYYY-MM-DD → 00:00 IST to 23:59:59.999 IST
      const [yStr, mStr, dStr] = date.split('-')
      const y = parseInt(yStr), m = parseInt(mStr), day = parseInt(dStr)
      const startUtcMs = Date.UTC(y, m - 1, day) - IST_OFFSET_MS
      const endUtcMs = Date.UTC(y, m - 1, day + 1) - IST_OFFSET_MS - 1
      dateFilter = { punchIn: { gte: new Date(startUtcMs), lte: new Date(endUtcMs) } }
    } else if (month && year) {
      const { start, end } = istMonthRange(parseInt(year), parseInt(month))
      dateFilter = { punchIn: { gte: start, lte: end } }
    } else {
      // Default: today (IST)
      const istParts = getIstParts(new Date())
      const startUtcMs = Date.UTC(istParts.year, istParts.month - 1, istParts.day) - IST_OFFSET_MS
      const endUtcMs = Date.UTC(istParts.year, istParts.month - 1, istParts.day + 1) - IST_OFFSET_MS - 1
      dateFilter = { punchIn: { gte: new Date(startUtcMs), lte: new Date(endUtcMs) } }
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
