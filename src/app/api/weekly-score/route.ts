import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

// GET /api/weekly-score?userId=xxx&weekStart=ISO&weekEnd=ISO
// Returns per-user weekly task statistics.
//
// Scoring is based ONLY on task timeliness & status — revisions do NOT
// affect score.
//   COMPLETED on time            → 100
//   COMPLETED late (within 2d)   → 70
//   COMPLETED late (> 2d)        → 40
//   IN_PROGRESS / IN_REVIEW      → 70 (on track) or 20 (overdue)
//   PENDING / RE_OPENED          → 50 (on track) or 20 (overdue)
//   ON_HOLD / EXTERNAL_HOLD      → 60
//   ESCALATED                    → 20
//   REJECTED                     → 0
//   No due date set              → 80 (treated as on-track by default)
//
// Final per-task score floor: 0
//
// PR Score = average of per-task scores across all tasks in the week.
// Green / Yellow / Red bands are computed from the per-task scores:
//   Green  = task score >= 70
//   Yellow = task score 40–69
//   Red    = task score < 40
//
// (reviseCount is still tracked for reporting — tasksRevised / totalRevisions
//  fields remain in the response — but they no longer carry any penalty.)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const weekStart = searchParams.get('weekStart')
    const weekEnd = searchParams.get('weekEnd')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }
    if (!weekStart || !weekEnd) {
      return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 })
    }

    const startDate = new Date(weekStart)
    const endDate = new Date(weekEnd)
    endDate.setHours(23, 59, 59, 999)

    // Fetch all tasks owned by the user that are relevant to the selected week
    const tasks = await db.task.findMany({
      where: {
        ownerId: userId,
        status: { notIn: [WorkflowStatus.CANCELLED, WorkflowStatus.DRAFT] },
        OR: [
          { dueDate: { gte: startDate, lte: endDate } },
          { createdAt: { gte: startDate, lte: endDate } },
          { completedAt: { gte: startDate, lte: endDate } },
        ],
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        reviseCount: true,
      },
    })

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    let completedOnTime = 0
    let completedLate = 0
    let inProgressOnTrack = 0
    let overdue = 0
    let pending = 0
    let rejected = 0

    let totalRevisions = 0          // Sum of reviseCount across all tasks in the week (reporting only)
    let tasksRevised = 0            // How many distinct tasks have reviseCount > 0 (reporting only)

    let greenCount = 0   // task score >= 70
    let yellowCount = 0  // task score 40-69
    let redCount = 0     // task score < 40
    let totalTaskScore = 0

    for (const task of tasks) {
      const isOverdue = task.dueDate
        ? new Date(task.dueDate) < todayStart && task.status !== WorkflowStatus.COMPLETED && task.status !== WorkflowStatus.CANCELLED
        : false

      let baseScore = 0

      switch (task.status) {
        case WorkflowStatus.COMPLETED:
          if (task.dueDate && task.completedAt && new Date(task.completedAt) > new Date(task.dueDate)) {
            // Date-only comparison — completing any time on the due date
            // counts as on-time. Only compare calendar days.
            const due = new Date(task.dueDate)
            const comp = new Date(task.completedAt)
            const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
            const compDay = new Date(comp.getFullYear(), comp.getMonth(), comp.getDate()).getTime()
            const dayDiff = (compDay - dueDay) / (1000 * 60 * 60 * 24)
            if (dayDiff <= 0) {
              completedOnTime++
              baseScore = 100
            } else if (dayDiff <= 2) {
              completedLate++
              baseScore = 70
            } else {
              completedLate++
              baseScore = 40
            }
          } else if (task.dueDate) {
            completedOnTime++
            baseScore = 100
          } else {
            completedOnTime++
            baseScore = 80  // No due date — completed, treated as on-time
          }
          break
        case WorkflowStatus.REJECTED:
          rejected++
          baseScore = 0
          break
        case WorkflowStatus.IN_PROGRESS:
        case WorkflowStatus.IN_REVIEW:
        case WorkflowStatus.ESCALATED:
        case WorkflowStatus.EXTERNAL_HOLD:
        case WorkflowStatus.ON_HOLD:
          if (isOverdue) {
            overdue++
            baseScore = task.status === WorkflowStatus.ESCALATED ? 10 : 20
          } else {
            inProgressOnTrack++
            baseScore = task.status === WorkflowStatus.ON_HOLD || task.status === WorkflowStatus.EXTERNAL_HOLD ? 60 : 70
          }
          break
        case WorkflowStatus.PENDING:
        case WorkflowStatus.RE_OPENED:
          if (isOverdue) {
            overdue++
            baseScore = 20
          } else {
            pending++
            baseScore = 50
          }
          break
        case WorkflowStatus.APPROVED:
          inProgressOnTrack++
          baseScore = 75
          break
        default:
          break
      }

      // Score is based ONLY on status & timeliness — revisions do NOT
      // affect score. Per-task floor: 0.
      const reviseCount = (task as any).reviseCount || 0
      const finalScore = Math.max(0, Math.round(baseScore))

      if (reviseCount > 0) {
        tasksRevised++
        totalRevisions += reviseCount
      }

      totalTaskScore += finalScore
      if (finalScore >= 70) greenCount++
      else if (finalScore >= 40) yellowCount++
      else redCount++
    }

    const totalTasks = tasks.length

    // Percentage bands (count-based, for backwards-compat with UI)
    const greenScore = totalTasks > 0 ? Math.round((greenCount / totalTasks) * 100) : 0
    const yellowScore = totalTasks > 0 ? Math.round((yellowCount / totalTasks) * 100) : 0
    const redScore = totalTasks > 0 ? Math.round((redCount / totalTasks) * 100) : 0

    // ─── PR Score (timeliness-only — revisions do not affect score) ────
    // Average of per-task final scores (0-100).
    const prScore = totalTasks > 0
      ? Math.round((totalTaskScore / totalTasks) * 10) / 10
      : 0

    return NextResponse.json({
      totalTasks,
      completedOnTime,
      completedLate,
      inProgressOnTrack,
      overdue,
      pending,
      rejected,
      greenScore,
      yellowScore,
      redScore,
      prScore,
      // Revision tracking is kept for reporting only — these do NOT
      // affect prScore anymore. Penalty fields are returned as 0 for
      // backwards-compatibility with older UI clients.
      tasksRevised,            // how many distinct tasks have been revised
      totalRevisions,          // total revision count across all tasks
      avgRevisionPenalty: 0,   // deprecated — always 0 now
      totalRevisionPenalty: 0, // deprecated — always 0 now
      greenCount,
      yellowCount,
      redCount,
      avgTaskScore: prScore,   // alias for clarity
    })
  } catch (error: any) {
    console.error('Weekly score error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
