import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, TaskPriority } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || request.nextUrl.searchParams.get('ownerId')
    const status = request.nextUrl.searchParams.get('status')
    const assignedTo = request.nextUrl.searchParams.get('assignedTo')
    const assignedById = request.nextUrl.searchParams.get('assignedById')
    // strictAssignedBy=1 — when set, ONLY return tasks where assignedById === X.
    // Used by FOUNDER role so they see ONLY the tasks THEY assigned (no legacy NULL fallback).
    // When omitted (DIRECTOR case), legacy NULL-assignedBy tasks are also shown so no
    // historical data disappears.
    const strictAssignedBy = request.nextUrl.searchParams.get('strictAssignedBy') === '1'

    console.log('[tasks] GET params:', { userId, status, assignedTo, assignedById, strictAssignedBy })

    const where: Record<string, unknown> = {}
    if (userId) where.ownerId = userId
    if (status) where.status = status
    // ─── ASSIGNED-BY FILTER ───────────────────────────────────────────
    // Two modes:
    //   • strictAssignedBy=1 (FOUNDER): only tasks where assignedById === X.
    //     Founder sees ONLY tasks they assigned — never other people's tasks
    //     and never legacy NULL-assignedBy tasks.
    //   • default (DIRECTOR): tasks where assignedById === X OR assignedById IS NULL.
    //     Legacy NULL-assignedBy tasks (created before the field existed) are shown
    //     to ALL directors so historical data is never hidden.
    if (assignedById) {
      if (strictAssignedBy) {
        where.assignedById = assignedById
      } else {
        where.OR = [
          { assignedById: assignedById },
          { assignedById: null },
        ]
      }
    }

    // ─── DIAGNOSTIC: First, try a minimal query to see if DB itself is reachable ──
    const totalTaskCount = await db.task.count()
    console.log('[tasks] DB task count:', totalTaskCount)

    // ─── SCHEMA-DRIFT DEFENSE ──────────────────────────────────────────
    // If the `assignedById` column doesn't exist in the production DB yet (e.g., the
    // Vercel build hasn't run `prisma db push` yet), the WHERE clause above will throw
    // P2022. Detect this and clear the assignedById filter so the API still returns all
    // tasks instead of crashing with HTTP 500 (which is what was making the 35-40
    // tasks invisible on the EA/Admin dashboard).
    if (assignedById) {
      try {
        await db.task.count({ where })
      } catch (probeErr: any) {
        const msg = String(probeErr?.message || probeErr).toLowerCase()
        if (msg.includes('assignedbyid') && msg.includes('does not exist')) {
          console.warn('[tasks] assignedById column missing in DB — dropping assignedById filter (showing all tasks)')
          delete where.OR
          delete where.assignedById
        } else {
          throw probeErr
        }
      }
    }

    // If assignedTo is provided, also find tasks where the user is a task step assignee
    let assignedStepTasks: any[] = []
    if (assignedTo) {
      const stepTasks = await db.taskStep.findMany({
        where: { assigneeId: assignedTo },
        select: { taskId: true },
      })
      const taskIdsFromSteps = [...new Set(stepTasks.map(s => s.taskId))]
      if (taskIdsFromSteps.length > 0) {
        const stepWhere: Record<string, unknown> = { id: { in: taskIdsFromSteps }, parentTaskId: null }
        if (status) stepWhere.status = status
        // Same ASSIGNED-BY filter as the main `where` above — strict for FOUNDER,
        // legacy-NULL-compatible for DIRECTOR.
        if (assignedById) {
          if (strictAssignedBy) {
            stepWhere.assignedById = assignedById
          } else {
            stepWhere.OR = [
              { assignedById: assignedById },
              { assignedById: null },
            ]
          }
        }
        assignedStepTasks = await db.task.findMany({
          where: stepWhere,
          include: {
            owner: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
            assignedBy: { select: { id: true, name: true, role: true } },
            workflow: {
              include: {
                steps: { orderBy: { order: 'asc' }, include: { assignee: { select: { id: true, name: true, role: true } } } },
              },
            },
            taskSteps: {
              orderBy: { order: 'asc' },
              include: { assignee: { select: { id: true, name: true, role: true } } },
            },
            subTasks: {
              include: {
                owner: { select: { id: true, name: true, email: true, role: true } },
              },
            },
            dependencies: {
              include: {
                dependsOnTask: { select: { id: true, title: true, status: true } },
              },
            },
            dependents: {
              include: {
                task: { select: { id: true, title: true, status: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      }
    }

    // ─── TRY SIMPLE QUERY FIRST ──────────────────────────────────────────
    // Some production deployments are failing on the heavy `include` clause (likely
    // because `dependencies`/`dependents` relations reference Task rows that no
    // longer exist). Use a LIGHTER query: only basic relations, no dependency graph.
    let tasks: any[]
    try {
      tasks = await db.task.findMany({
        where: { ...where, parentTaskId: null },
        include: {
          owner: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
          assignedBy: { select: { id: true, name: true, role: true } },
          taskSteps: {
            orderBy: { order: 'asc' },
            include: { assignee: { select: { id: true, name: true, role: true } } },
          },
          subTasks: {
            include: {
              owner: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      console.log('[tasks] Light query succeeded, returned', tasks.length, 'tasks')
    } catch (heavyErr: any) {
      console.error('[tasks] Light query FAILED, retrying with minimal include:', heavyErr?.message || heavyErr)
      // Fallback #1: drop subTasks (often the cause of relation errors)
      try {
        tasks = await db.task.findMany({
          where: { ...where, parentTaskId: null },
          include: {
            owner: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
            assignedBy: { select: { id: true, name: true, role: true } },
            taskSteps: {
              orderBy: { order: 'asc' },
              include: { assignee: { select: { id: true, name: true, role: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        console.log('[tasks] Minimal query returned', tasks.length, 'tasks')
      } catch (minErr: any) {
        // Fallback #2: drop `assignedBy` too — this happens when the `assignedById`
        // column hasn't been added to the production DB yet. Returning tasks without
        // the assignedBy relation is FAR better than returning 0 tasks (which is what
        // was happening on the EA/Admin dashboard, causing the user to think their
        // 35-40 tasks were deleted).
        console.error('[tasks] Minimal query also FAILED, retrying WITHOUT assignedBy include:', minErr?.message || minErr)
        tasks = await db.task.findMany({
          where: { ...where, parentTaskId: null },
          include: {
            owner: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
            taskSteps: {
              orderBy: { order: 'asc' },
              include: { assignee: { select: { id: true, name: true, role: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        console.log('[tasks] Bare-minimum query (no assignedBy) returned', tasks.length, 'tasks')
      }
    }

    // Merge and deduplicate: tasks owned by user + tasks where user is step assignee
    if (assignedTo && assignedStepTasks.length > 0) {
      const existingIds = new Set(tasks.map(t => t.id))
      const newTasks = assignedStepTasks.filter(t => !existingIds.has(t.id))
      const allTasks = [...tasks, ...newTasks]
      // Sort by createdAt desc
      allTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return NextResponse.json(allTasks)
    }

    return NextResponse.json(tasks)
  } catch (error: any) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks', detail: String(error?.message || error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title, description, priority, ownerId, dueDate, parentTaskId,
      department, category,
      frequency, weekDays, monthDates,
      assignedById,
    } = body

    if (!title || !ownerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Parse taskSteps from body - simplified, no director approval fields
    const taskStepsData = body.taskSteps || []

    // Create the task WITHOUT a workflow - simple task management
    const task = await db.task.create({
      data: {
        title,
        description: description || null,
        status: WorkflowStatus.IN_PROGRESS,
        priority: priority || TaskPriority.MEDIUM,
        ownerId,
        assignedById: assignedById || null,
        department: department || null,
        category: category || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        workflowId: null,
        parentTaskId: parentTaskId || null,
        directorDependency: null,
        frequency: frequency || null,
        weekDays: weekDays || null,
        monthDates: monthDates || null,
        taskSteps: {
          create: taskStepsData.map((step: { title: string; order: number; assigneeId?: string }) => ({
            title: step.title,
            status: WorkflowStatus.IN_PROGRESS,
            order: step.order || 0,
            assigneeId: step.assigneeId || null,
            needsDirectorApproval: false,
            directorName: null,
            directorNote: null,
          })),
        },
      },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true, department: true } },
        assignedBy: { select: { id: true, name: true, role: true } },
        workflow: { select: { id: true, title: true, status: true } },
        taskSteps: { orderBy: { order: 'asc' } },
      },
    })

    // Notify task owner
    await db.notification.create({
      data: {
        type: 'STATUS_CHANGE',
        title: `New Task Assigned: ${title}`,
        message: `You have been assigned a new task "${title}". It is now in progress.`,
        receiverId: ownerId,
      },
    })

    // ─── Also notify any step assignees (so employees assigned to a specific
    // step also receive a push notification about the new task). We exclude
    // the ownerId since they already got notified above. ──────────────────
    try {
      const stepAssigneeIds = Array.from(new Set(
        (taskStepsData || [])
          .map((s: any) => s.assigneeId)
          .filter((id: string) => id && id !== ownerId)
      )) as string[]
      for (const assigneeId of stepAssigneeIds) {
        await db.notification.create({
          data: {
            type: 'STATUS_CHANGE',
            title: `New Task Assigned: ${title}`,
            message: `You have been assigned a step in task "${title}". Open the task to see your steps.`,
            receiverId: assigneeId,
          },
        })
      }
    } catch (stepNotifErr) {
      console.error('[tasks] Step assignee notification error (non-fatal):', stepNotifErr)
    }

    // ─── Audit log: persist a CREATED entry in TaskActivity ──────────────
    // This NEVER gets cleaned up automatically — gives the user a full history.
    try {
      await db.taskActivity.create({
        data: {
          action: 'CREATED',
          taskId: task.id,
          taskTitle: task.title,
          priority: task.priority || null,
          department: task.department || null,
          category: task.category || null,
          status: task.status,
          actorId: ownerId, // best guess — task creator/owner
          description: `Task "${task.title}" created and assigned to ${task.owner?.name || 'owner'}`,
        },
      })
    } catch (actErr) {
      console.error('TaskActivity CREATED log error (non-fatal):', actErr)
    }

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('Tasks POST error:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
