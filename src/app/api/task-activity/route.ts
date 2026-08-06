import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/task-activity
// Fetches the persistent audit log of task events (CREATED, DELETED, UPDATED, etc.)
// Optional query params:
//   ?limit=20   — max items to return (default 30, max 100)
//   ?action=CREATED  — filter by action type
//   ?taskId=... — filter by task ID
//   ?actorId=... — filter by who did the action
export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get('limit')
    const action = request.nextUrl.searchParams.get('action')
    const taskId = request.nextUrl.searchParams.get('taskId')
    const actorId = request.nextUrl.searchParams.get('actorId')

    console.log('[task-activity] GET params:', { limitParam, action, taskId, actorId })

    const limit = Math.min(parseInt(limitParam || '30', 10) || 30, 100)

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (taskId) where.taskId = taskId
    if (actorId) where.actorId = actorId

    // ─── DIAGNOSTIC: First, try to count TaskActivity rows to make sure the table exists ──
    let totalCount = 0
    try {
      totalCount = await db.taskActivity.count()
      console.log('[task-activity] Total rows in table:', totalCount)
    } catch (countErr: any) {
      console.error('[task-activity] Count failed (table might not exist yet):', countErr?.message || countErr)
      // If the table doesn't exist yet (e.g. prisma db push hasn't run), return an empty
      // list instead of a 500 error so the dashboard doesn't crash.
      return NextResponse.json({ activities: [], count: 0, error: 'TaskActivity table not yet available' })
    }

    const activities = await db.taskActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
    })
    console.log('[task-activity] Returning', activities.length, 'activities')

    return NextResponse.json({ activities, count: activities.length })
  } catch (error: any) {
    console.error('TaskActivity GET error:', error)
    // Return empty array instead of 500 so the UI doesn't break
    return NextResponse.json({ activities: [], count: 0, error: String(error?.message || error) })
  }
}
