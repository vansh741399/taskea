import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // ══ v21·0622 — 2-HOUR DEADLINE NOTIFICATION ════════════════════════════
    // When a task owned by this user (or where they are a step assignee) has a
    // dueDate within the next 2 hours AND the task is NOT yet completed/cancelled,
    // auto-create a DEADLINE_REMINDER notification (once per task per cycle).
    //
    // How it works:
    //   1. Find tasks owned by user (or step-assigned) with dueDate in [now, now+2h].
    //   2. For each, check if an unread DEADLINE_REMINDER notification already
    //      exists for this task + user (avoids duplicate spam).
    //   3. If not, create one.
    //
    // This runs every time the user polls /api/notifications (every ~15-30s via
    // React Query refetchInterval), so reminders are timely without needing a
    // separate cron job.
    //
    // IMPORTANT: This is purely ADDITIVE — it only creates new notification rows.
    // It NEVER modifies or deletes existing task data. Task dueDates are read-only.
    try {
      const now = new Date()
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

      // Find tasks owned by this user with dueDate in the next 2 hours,
      // not completed/cancelled, and with a dueDate in the future (not overdue).
      const upcomingTasks = await db.task.findMany({
        where: {
          ownerId: userId,
          dueDate: { gte: now, lte: twoHoursLater },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          parentTaskId: null,
        },
        select: { id: true, title: true, dueDate: true, priority: true },
      })

      // Also find tasks where user is a step assignee (not just owner)
      const stepAssignments = await db.taskStep.findMany({
        where: { assigneeId: userId },
        select: { taskId: true },
      })
      const stepTaskIds = [...new Set(stepAssignments.map(s => s.taskId))]
      let stepTasks: any[] = []
      if (stepTaskIds.length > 0) {
        stepTasks = await db.task.findMany({
          where: {
            id: { in: stepTaskIds },
            ownerId: { not: userId }, // avoid double-counting tasks user owns
            dueDate: { gte: now, lte: twoHoursLater },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            parentTaskId: null,
          },
          select: { id: true, title: true, dueDate: true, priority: true },
        })
      }

      const allDueSoonTasks = [...upcomingTasks, ...stepTasks]

      for (const task of allDueSoonTasks) {
        // Check if an unread DEADLINE_REMINDER already exists for this task+user
        // (created in the last 3 hours — so if the task was extended, a new
        // reminder can fire again on the next cycle)
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)
        const existing = await db.notification.findFirst({
          where: {
            receiverId: userId,
            type: 'DEADLINE_REMINDER',
            title: { contains: task.id },
            createdAt: { gte: threeHoursAgo },
          },
          select: { id: true },
        })

        if (!existing) {
          // Calculate minutes remaining for the message
          const dueDate = new Date(task.dueDate!)
          const minsRemaining = Math.max(1, Math.round((dueDate.getTime() - now.getTime()) / (60 * 1000)))
          const hoursRemaining = Math.floor(minsRemaining / 60)
          const remainingMins = minsRemaining % 60
          const timeStr = hoursRemaining > 0
            ? `${hoursRemaining}h ${remainingMins}m`
            : `${minsRemaining}m`

          await db.notification.create({
            data: {
              type: 'DEADLINE_REMINDER',
              title: `⏰ Deadline approaching: ${task.title} (Task ID: ${task.id})`,
              message: `Task "${task.title}" is due in ${timeStr}. Priority: ${task.priority || 'MEDIUM'}. Please complete it before the deadline.`,
              receiverId: userId,
              // No senderId — this is a system-generated notification
            },
          })
          console.log(`[notifications] Created DEADLINE_REMINDER for user ${userId}, task ${task.id}, due in ${timeStr}`)
        }
      }
    } catch (deadlineErr) {
      console.error('[notifications] Deadline reminder error (non-fatal):', deadlineErr)
    }

    // ══ CLEANUP: Aggressively clean old notifications to keep count accurate ══
    try {
      // Delete read notifications older than 1 day
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      await db.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: oneDayAgo } },
      })
      // Delete unread STATUS_CHANGE notifications older than 2 days (task assignments pile up)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      await db.notification.deleteMany({
        where: { isRead: false, type: 'STATUS_CHANGE', createdAt: { lt: twoDaysAgo } },
      })
      // Delete all other unread notifications older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      await db.notification.deleteMany({
        where: { isRead: false, createdAt: { lt: sevenDaysAgo } },
      })
    } catch (cleanupErr) {
      console.error('Notification cleanup error (non-fatal):', cleanupErr)
    }

    // ══ CLEANUP: Delete orphaned notifications referencing non-existent workflows ══
    try {
      const orphans = await db.notification.findMany({
        where: { workflowId: { not: null } },
        select: { id: true, workflowId: true },
      })
      if (orphans.length > 0) {
        const existingWorkflowIds = new Set(
          (await db.workflowInstance.findMany({
            where: { id: { in: orphans.map(n => n.workflowId!) } },
            select: { id: true },
          })).map(w => w.id)
        )
        const orphanIds = orphans.filter(n => !existingWorkflowIds.has(n.workflowId!)).map(n => n.id)
        if (orphanIds.length > 0) {
          await db.notification.deleteMany({ where: { id: { in: orphanIds } } })
        }
      }
    } catch (orphanErr) {
      console.error('Orphan notification cleanup error (non-fatal):', orphanErr)
    }

    const where: Record<string, unknown> = { receiverId: userId }
    if (unreadOnly) where.isRead = false

    const notifications = await db.notification.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const unreadCount = await db.notification.count({
      where: {
        receiverId: userId,
        isRead: false,
        // Only count notifications from the last 48 hours for relevance
        createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    const action = request.nextUrl.searchParams.get('action')
    const body = await request.json().catch(() => ({}))
    const { notificationIds } = body

    // Mark single notification as read via query params
    if (id && action === 'markRead') {
      await db.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      })
      return NextResponse.json({ success: true })
    }

    // Mark all as read for a user
    if (action === 'markAllRead') {
      const userId = request.nextUrl.searchParams.get('userId') || 'user-admin'
      await db.notification.updateMany({
        where: { receiverId: userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      return NextResponse.json({ success: true })
    }

    // Batch mark as read via body
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json({ error: 'notificationIds is required' }, { status: 400 })
    }

    const now = new Date()
    await db.notification.updateMany({
      where: { id: { in: notificationIds } },
      data: { isRead: true, readAt: now },
    })

    return NextResponse.json({ success: true, count: notificationIds.length })
  } catch (error) {
    console.error('Notifications PATCH error:', error)
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    const userId = request.nextUrl.searchParams.get('userId')

    if (id) {
      await db.notification.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    if (userId) {
      await db.notification.deleteMany({ where: { receiverId: userId } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'id or userId is required' }, { status: 400 })
  } catch (error) {
    console.error('Notifications DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
