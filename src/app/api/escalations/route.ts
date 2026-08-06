import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

export async function GET() {
  try {
    const escalations = await db.escalationLog.findMany({
      include: {
        workflow: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(escalations)
  } catch (error) {
    console.error('Escalations GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch escalations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflowId, reason, escalatedBy } = body

    if (!workflowId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const workflow = await db.workflowInstance.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' }, include: { assignee: true } } },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Find current active step
    const currentStep = workflow.steps.find(
      (s) => s.status === WorkflowStatus.PENDING || s.status === WorkflowStatus.IN_REVIEW
    )

    if (!currentStep) {
      return NextResponse.json({ error: 'No active step to escalate' }, { status: 400 })
    }

    // Find next step or Director for escalation
    const nextStep = workflow.steps.find(
      (s) => s.order > currentStep.order
    )

    const director = await db.user.findFirst({
      where: { role: 'DIRECTOR', isActive: true },
    })

    const toAssigneeId = director?.id || nextStep?.assigneeId || null
    const toStepOrder = nextStep?.order || currentStep.order + 1

    // Update current step as escalated
    await db.stepInstance.update({
      where: { id: currentStep.id },
      data: { isEscalated: true, status: WorkflowStatus.ESCALATED },
    })

    // Update workflow status
    await db.workflowInstance.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.ESCALATED, currentStepOrder: toStepOrder },
    })

    // Create escalation log
    const escalationLog = await db.escalationLog.create({
      data: {
        workflowId,
        fromStepOrder: currentStep.order,
        toStepOrder,
        fromAssigneeId: currentStep.assigneeId,
        toAssigneeId,
        reason,
        slaBreached: currentStep.slaDeadline ? new Date() > currentStep.slaDeadline : false,
      },
    })

    // Log status change
    await db.statusHistory.create({
      data: {
        workflowId,
        fromStatus: workflow.status,
        toStatus: WorkflowStatus.ESCALATED,
        changedBy: escalatedBy || null,
        reason,
      },
    })

    // Notify escalated assignee
    if (toAssigneeId) {
      await db.notification.create({
        data: {
          type: 'ESCALATION',
          title: `ESCALATED: ${workflow.title}`,
          message: `This workflow has been escalated. Your immediate attention is required. Reason: ${reason}`,
          senderId: escalatedBy || null,
          receiverId: toAssigneeId,
          workflowId,
        },
      })
    }

    return NextResponse.json(escalationLog, { status: 201 })
  } catch (error) {
    console.error('Escalations POST error:', error)
    return NextResponse.json({ error: 'Failed to create escalation' }, { status: 500 })
  }
}
