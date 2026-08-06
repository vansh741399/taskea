import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v24·0625 — EXTERNAL ATTENDANCE QUERY RESPONSE (for HRMS to write back)
// ════════════════════════════════════════════════════════════════════════
// HRMS HR posts a response to an attendance query raised in ERP.
//
// AUTH: Requires `x-erp-api-key` header matching env var ERP_BRIDGE_API_KEY.
//
// v24·0625-fix: FALLBACK — if ERP_BRIDGE_API_KEY is not set on this ERP
// deployment, accept HRMS_BRIDGE_API_KEY instead. See attendance-queries/route.ts
// for full rationale.
//
// SAFETY: ONLY modifies the AttendanceQuery row's hrReply / repliedBy /
// repliedAt / status fields. Never touches any other table.
// ════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Validate API key (with fallback to the symmetric key)
    const apiKey = request.headers.get('x-erp-api-key')
    const expectedKey = process.env.ERP_BRIDGE_API_KEY || process.env.HRMS_BRIDGE_API_KEY
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { hrReply, repliedBy, status } = body || {}

    if (!hrReply || !repliedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: hrReply, repliedBy' },
        { status: 400 }
      )
    }

    // Verify the query exists
    const existing = await db.attendanceQuery.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Query not found' }, { status: 404 })
    }

    const updated = await db.attendanceQuery.update({
      where: { id },
      data: {
        hrReply: String(hrReply).slice(0, 4000),
        repliedBy: String(repliedBy).slice(0, 100),
        repliedAt: new Date(),
        status: status === 'CLOSED' ? 'CLOSED' : 'RESPONDED',
      },
      include: {
        user: {
          select: {
            id: true, name: true, email: true,
            department: true, designation: true, phone: true,
          },
        },
      },
    })

    return NextResponse.json({ query: updated })
  } catch (error: any) {
    console.error('External attendance-query respond error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to respond' }, { status: 500 })
  }
}
