import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v24·0625 — ATTENDANCE QUERY RESPONSE (ERP internal — for HR role inside ERP)
// ════════════════════════════════════════════════════════════════════════
// PATCH /api/attendance-queries/[id]/respond
// Body: { hrReply, repliedBy, status? }
// Allows an HR-role user inside ERP to respond to a query.
// (HRMS-side responses come through /api/external/attendance-queries/[id]/respond
//  which validates an API key — that endpoint writes to the same table.)
//
// SAFETY: ONLY modifies the AttendanceQuery row's hrReply / repliedBy / repliedAt
// / status fields. Never touches any other table.
// ════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { hrReply, repliedBy, status } = body || {}

    if (!hrReply || !repliedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: hrReply, repliedBy' },
        { status: 400 }
      )
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
        user: { select: { id: true, name: true, email: true, department: true, designation: true, phone: true } },
      },
    })

    return NextResponse.json({ query: updated })
  } catch (error: any) {
    console.error('AttendanceQuery respond error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to respond' }, { status: 500 })
  }
}
