import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, TaskPriority } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')
    const userId = request.nextUrl.searchParams.get('userId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (userId) where.creatorId = userId

    const workflows = await db.workflowInstance.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, category: true } },
        creator: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        steps: {
          orderBy: { order: 'asc' },
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        _count: { select: { approvals: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error('Workflows GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { templateId, title, description, priority, creatorId, dueDate } = body

    if (!templateId || !title || !creatorId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get template with steps
    const template = await db.workflowTemplate.findUnique({
      where: { id: templateId },
      include: { steps: { orderBy: { order: 'asc' } } },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Find first assignee for the first step
    const firstStep = template.steps[0]
    let firstAssigneeId: string | null = null
    if (firstStep?.assigneeRole) {
      const assignee = await db.user.findFirst({
        where: { role: firstStep.assigneeRole, isActive: true },
      })
      firstAssigneeId = assignee?.id ?? null
    }

    const now = new Date()
    const slaDeadline = firstStep?.slaHours
      ? new Date(now.getTime() + firstStep.slaHours * 60 * 60 * 1000)
      : null

    // Create workflow with step instances
    const workflow = await db.workflowInstance.create({
      data: {
        templateId,
        title,
        description,
        status: WorkflowStatus.PENDING,
        priority: priority || TaskPriority.MEDIUM,
        currentStepOrder: 1,
        creatorId,
        dueDate: dueDate ? new Date(dueDate) : null,
        steps: {
          create: template.steps.map((step, index) => ({
            stepTemplateId: step.id,
            name: step.name,
            stepType: step.stepType,
            order: step.order,
            status: index === 0 ? WorkflowStatus.PENDING : WorkflowStatus.PENDING,
            assigneeId: index === 0 ? firstAssigneeId : null,
            startedAt: index === 0 ? now : null,
            slaDeadline: index === 0 ? slaDeadline : null,
          })),
        },
      },
      include: {
        template: true,
        creator: true,
        steps: { include: { assignee: true } },
      },
    })

    // Create status history entry
    await db.statusHistory.create({
      data: {
        workflowId: workflow.id,
        fromStatus: WorkflowStatus.DRAFT,
        toStatus: WorkflowStatus.PENDING,
        changedBy: creatorId,
        reason: 'Workflow submitted for approval',
      },
    })

    // Create notification for first step assignee
    if (firstAssigneeId) {
      await db.notification.create({
        data: {
          type: 'APPROVAL_REQUIRED',
          title: `Approval Required: ${title}`,
          message: `A new workflow requires your review and approval.`,
          senderId: creatorId,
          receiverId: firstAssigneeId,
          workflowId: workflow.id,
        },
      })
    }

    return NextResponse.json(workflow, { status: 201 })
  } catch (error) {
    console.error('Workflows POST error:', error)
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 })
  }
}
