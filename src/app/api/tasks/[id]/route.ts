import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const task = await db.task.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
        workflow: {
          select: { id: true, title: true, status: true, currentStepOrder: true },
          include: {
            steps: { orderBy: { order: 'asc' }, include: { assignee: { select: { id: true, name: true, role: true } } } },
          },
        },
        parentTask: { select: { id: true, title: true, status: true } },
        subTasks: {
          include: { owner: { select: { id: true, name: true, email: true, role: true } } },
        },
        dependencies: {
          include: { dependsOnTask: { select: { id: true, title: true, status: true } } },
        },
        dependents: {
          include: { task: { select: { id: true, title: true, status: true } } },
        },
        taskSteps: { orderBy: { order: 'asc' }, include: { assignee: { select: { id: true, name: true, role: true } } } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('Task GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, title, description, priority, department, category, dueDate, ownerId, frequency, weekDays, monthDates, reviseReason, reviseNextDate, score } = body

    const task = await db.task.findUnique({
      where: { id },
      include: { dependencies: true, workflow: true, owner: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const now = new Date()
    const updateData: Record<string, unknown> = { updatedAt: now }

    if (status !== undefined) {
      // Simplified status transitions - no workflow approval required
      if (status === WorkflowStatus.COMPLETED) {
        updateData.status = WorkflowStatus.COMPLETED
        updateData.completedAt = now

        // Auto-calculate performance score based on task completion.
        // Score is based ONLY on timeliness — revisions do NOT affect score.
        // Comparison is DATE-ONLY (ignores time-of-day) so that completing a
        // task any time on its due date counts as on-time.
        //   On-time (due date >= today)         → 100
        //   Slightly late (1–2 days overdue)    → 70
        //   Significantly late (> 2 days)       → 40
        //   No due date set                     → 80
        // Per-task score floor: 0.
        let baseScore: number
        if (score !== undefined) {
          baseScore = score
        } else if (task.dueDate) {
          const due = new Date(task.dueDate)
          // Normalize both due date and "now" to midnight (date-only)
          const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
          const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
          const diffDays = (dueDay - nowDay) / (1000 * 60 * 60 * 24)
          if (diffDays >= 0) {
            baseScore = 100  // Completed on or before due date
          } else if (diffDays >= -2) {
            baseScore = 70   // Slightly late (1–2 days overdue)
          } else {
            baseScore = 40   // Significantly late (> 2 days)
          }
        } else {
          baseScore = 80  // No due date set
        }

        updateData.score = Math.max(0, Math.round(baseScore))

        // If task has a workflow, mark it as COMPLETED too
        if (task.workflowId) {
          await db.workflowInstance.update({
            where: { id: task.workflowId },
            data: { status: WorkflowStatus.COMPLETED },
          }).catch(() => {})
        }
      } else if (status === WorkflowStatus.IN_PROGRESS) {
        // Allow transitioning to IN_PROGRESS from any status (for "Revise" functionality)
        updateData.status = WorkflowStatus.IN_PROGRESS
        // Clear completedAt if reopening from completed
        if (task.status === WorkflowStatus.COMPLETED) {
          updateData.completedAt = null
        }
        // Record revise metadata. We still track reviseCount for reporting
        // purposes — but revisions NO LONGER affect task score.
        updateData.revisedAt = now

        // Only count it as a "real" revision when the user actually provides
        // a new next date (or a reason). Toggling status alone doesn't count.
        const isActualRevise = (reviseNextDate !== undefined && reviseNextDate) || (reviseReason !== undefined && reviseReason)
        if (isActualRevise) {
          // Prisma atomic increment — never loses count even on concurrent revisions
          updateData.reviseCount = { increment: 1 }
        }

        if (reviseReason !== undefined) updateData.reviseReason = reviseReason
        if (reviseNextDate !== undefined) {
          updateData.reviseNextDate = reviseNextDate ? new Date(reviseNextDate) : null
          // Also update dueDate to the new next date so the task moves out of Today/Overdue
          if (reviseNextDate) {
            updateData.dueDate = new Date(reviseNextDate)
          }
        }
      } else if (status === WorkflowStatus.CANCELLED) {
        updateData.status = WorkflowStatus.CANCELLED
        updateData.completedAt = now

        // Cancel linked workflow too
        if (task.workflowId) {
          await db.workflowInstance.update({
            where: { id: task.workflowId },
            data: { status: WorkflowStatus.CANCELLED },
          }).catch(() => {})
        }
      } else {
        updateData.status = status
      }
    }

    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (priority !== undefined) updateData.priority = priority
    if (department !== undefined) updateData.department = department
    if (category !== undefined) updateData.category = category
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (ownerId !== undefined) updateData.ownerId = ownerId
    if (frequency !== undefined) updateData.frequency = frequency
    if (weekDays !== undefined) updateData.weekDays = weekDays
    if (monthDates !== undefined) updateData.monthDates = monthDates
    if (score !== undefined) updateData.score = score
    if (reviseReason !== undefined && status !== WorkflowStatus.IN_PROGRESS) updateData.reviseReason = reviseReason
    if (reviseNextDate !== undefined && status !== WorkflowStatus.IN_PROGRESS) updateData.reviseNextDate = reviseNextDate ? new Date(reviseNextDate) : null

    const updatedTask = await db.task.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, email: true, role: true, department: true } },
        workflow: { select: { id: true, title: true, status: true } },
      },
    })

    // ─── Audit log: record what changed in TaskActivity ─────────────────
    // We log only meaningful events: COMPLETED, REVISED, CANCELLED, and any
    // status change. We do NOT log pure field updates (title/description tweaks)
    // to keep the feed focused on what the user actually cares about.
    try {
      let action: string | null = null
      let description: string | null = null

      if (status === WorkflowStatus.COMPLETED) {
        action = 'COMPLETED'
        description = `Task "${task.title}" marked as completed`
      } else if (status === WorkflowStatus.IN_PROGRESS && (reviseNextDate || reviseReason)) {
        action = 'REVISED'
        const parts: string[] = []
        if (reviseReason) parts.push(`reason: "${reviseReason}"`)
        if (reviseNextDate) parts.push(`new due date: ${new Date(reviseNextDate).toLocaleDateString()}`)
        description = `Task "${task.title}" revised${parts.length ? ' (' + parts.join(', ') + ')' : ''}`
      } else if (status === WorkflowStatus.CANCELLED) {
        action = 'CANCELLED'
        description = `Task "${task.title}" cancelled`
      } else if (status && status !== task.status) {
        action = 'STATUS_CHANGED'
        description = `Task "${task.title}" status: ${task.status} → ${status}`
      }

      if (action) {
        await db.taskActivity.create({
          data: {
            action,
            taskId: id,
            taskTitle: task.title,
            priority: task.priority || null,
            department: task.department || null,
            category: task.category || null,
            status: (updateData.status as string) || task.status,
            actorId: task.ownerId, // best guess — owner triggered the change
            description,
          },
        })
      }
    } catch (actErr) {
      console.error('TaskActivity PATCH log error (non-fatal):', actErr)
    }

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('Task PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const task = await db.task.findUnique({
      where: { id },
      include: { workflow: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // ─── Audit log: persist a DELETED entry BEFORE we actually delete the
    // task. We snapshot the task title and metadata so the activity feed
    // can still show what was deleted even after the task row is gone.
    try {
      await db.taskActivity.create({
        data: {
          action: 'DELETED',
          taskId: id,
          taskTitle: task.title,
          priority: task.priority || null,
          department: task.department || null,
          category: task.category || null,
          status: task.status,
          actorId: task.ownerId, // best guess — owner triggered deletion
          description: `Task "${task.title}" was deleted`,
        },
      })
    } catch (actErr) {
      console.error('TaskActivity DELETED log error (non-fatal):', actErr)
    }

    // Delete related records first
    await db.taskStep.deleteMany({ where: { taskId: id } })
    await db.taskDependency.deleteMany({ where: { taskId: id } })
    await db.taskDependency.deleteMany({ where: { dependsOnTaskId: id } })

    // Delete the task
    await db.task.delete({ where: { id } })

    // If task had a workflow, cancel it
    if (task.workflowId) {
      await db.workflowInstance.update({
        where: { id: task.workflowId },
        data: { status: WorkflowStatus.CANCELLED },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Task DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
