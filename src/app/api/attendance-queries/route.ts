import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v24·0625 — ATTENDANCE QUERY API (ERP side)
// ════════════════════════════════════════════════════════════════════════
// Employees raise queries about their HRMS attendance. HR (from HRMS) reads
// them via the external API at /api/external/attendance-queries and posts a
// reply back via /api/external/attendance-queries/[id]/respond.
//
// SAFETY: This endpoint ONLY touches the new AttendanceQuery table. No
// existing tables, rows, or live records are modified or deleted.
// ════════════════════════════════════════════════════════════════════════

// GET /api/attendance-queries?userId=X&status=OPEN
// Returns queries raised by a user, optionally filtered by status.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    const where: any = {}
    if (userId) where.userId = userId
    if (status) where.status = status

    const queries = await db.attendanceQuery.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true, designation: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ queries: Array.isArray(queries) ? queries : [] })
  } catch (error) {
    console.error('AttendanceQuery GET error:', error)
    return NextResponse.json({ queries: [] })
  }
}

// POST /api/attendance-queries
// Body: { userId, queryMonth, queryYear, queryText, hrmsEmployeeId? }
// Creates a new attendance query. PURELY ADDITIVE — never modifies attendance data.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, queryMonth, queryYear, queryText, hrmsEmployeeId } = body || {}

    // Validate required fields
    if (!userId || !queryText || !queryMonth || !queryYear) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, queryMonth, queryYear, queryText' },
        { status: 400 }
      )
    }

    // Verify user exists (defensive — should always succeed since frontend passes logged-in user)
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Create the query (additive only — no other tables touched)
    const query = await db.attendanceQuery.create({
      data: {
        userId,
        hrmsEmployeeId: hrmsEmployeeId || null,
        queryMonth: Number(queryMonth),
        queryYear: Number(queryYear),
        queryText: String(queryText).slice(0, 2000),  // cap length for safety
        status: 'OPEN',
      },
      include: {
        user: { select: { id: true, name: true, email: true, department: true, designation: true, phone: true } },
      },
    })

    return NextResponse.json({ query }, { status: 201 })
  } catch (error: any) {
    console.error('AttendanceQuery POST error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to create query' }, { status: 500 })
  }
}
