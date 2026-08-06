import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const status = request.nextUrl.searchParams.get('status')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const where: Record<string, unknown> = {
      assigneeId: userId,
      status: status ? status : { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_REVIEW] },
    }

    const pendingSteps = await db.stepInstance.findMany({
      where,
      include: {
        workflow: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            creator: { select: { id: true, name: true, email: true, role: true } },
            dueDate: true,
            createdAt: true,
          },
        },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        approvals: {
          include: {
            approver: { select: { id: true, name: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Also get completed approvals for history
    const completedApprovals = await db.approval.findMany({
      where: { approverId: userId },
      include: {
        workflow: {
          select: { id: true, title: true, status: true, priority: true },
        },
        stepInstance: {
          select: { id: true, name: true, order: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ pending: pendingSteps, history: completedApprovals })
  } catch (error) {
    console.error('Approvals GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { stepInstanceId, workflowId, approverId, action, comments, isDelegated, originalApproverId } = body

    if (!stepInstanceId || !workflowId || !approverId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return NextResponse.json({ error: 'Action must be APPROVED or REJECTED' }, { status: 400 })
    }

    // Validate the user is assigned to the step
    const stepInstance = await db.stepInstance.findUnique({
      where: { id: stepInstanceId },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
      },
    })

    if (!stepInstance) {
      return NextResponse.json({ error: 'Step instance not found' }, { status: 404 })
    }

    if (stepInstance.assigneeId !== approverId) {
      return NextResponse.json({ error: 'You are not assigned to this step' }, { status: 403 })
    }

    const now = new Date()

    // Create approval record
    const approval = await db.approval.create({
      data: {
        stepInstanceId,
        workflowId,
        approverId,
        action: action,
        comments: comments || null,
        level: (stepInstance as any).stepTemplate?.approvalLevel ?? 1,
        isDelegated: isDelegated || false,
        originalApproverId: originalApproverId || null,
      },
    })

    if (action === 'APPROVED') {
      // Complete current step
      await db.stepInstance.update({
        where: { id: stepInstanceId },
        data: { status: WorkflowStatus.APPROVED, completedAt: now },
      })

      // Find next step
      const currentOrder = stepInstance.order
      const nextStep = stepInstance.workflow.steps.find((s) => s.order > currentOrder && s.status === WorkflowStatus.PENDING)

      if (nextStep) {
        // Advance to next step
        let nextAssigneeId: string | null = null
        const nextStepTemplate = await db.stepTemplate.findUnique({ where: { id: nextStep.stepTemplateId } })
        if (nextStepTemplate?.assigneeRole) {
          const assignee = await db.user.findFirst({
            where: { role: nextStepTemplate.assigneeRole, isActive: true },
          })
          nextAssigneeId = assignee?.id ?? null
        }

        const slaDeadline = nextStepTemplate?.slaHours
          ? new Date(now.getTime() + nextStepTemplate.slaHours * 60 * 60 * 1000)
          : null

        await db.stepInstance.update({
          where: { id: nextStep.id },
          data: {
            status: WorkflowStatus.PENDING,
            assigneeId: nextAssigneeId,
            startedAt: now,
            slaDeadline,
          },
        })

        // Update workflow current step
        await db.workflowInstance.update({
          where: { id: workflowId },
          data: {
            currentStepOrder: nextStep.order,
            status: WorkflowStatus.IN_REVIEW,
          },
        })

        // Log status change
        await db.statusHistory.create({
          data: {
            workflowId,
            fromStatus: stepInstance.workflow.status,
            toStatus: WorkflowStatus.IN_REVIEW,
            changedBy: approverId,
            reason: `Step "${stepInstance.name}" approved, advancing to "${nextStep.name}"`,
          },
        })

        // Notify next assignee
        if (nextAssigneeId) {
          await db.notification.create({
            data: {
              type: 'APPROVAL_REQUIRED',
              title: `Approval Required: ${stepInstance.workflow.title}`,
              message: `Step "${nextStep.name}" requires your review.`,
              senderId: approverId,
              receiverId: nextAssigneeId,
              workflowId,
            },
          })
        }
      } else {
        // No more steps - mark workflow as APPROVED
        await db.workflowInstance.update({
          where: { id: workflowId },
          data: { status: WorkflowStatus.APPROVED },
        })

        await db.statusHistory.create({
          data: {
            workflowId,
            fromStatus: stepInstance.workflow.status,
            toStatus: WorkflowStatus.APPROVED,
            changedBy: approverId,
            reason: 'All steps approved - workflow complete',
          },
        })

        // Notify creator
        await db.notification.create({
          data: {
            type: 'APPROVED',
            title: `Workflow Approved: ${stepInstance.workflow.title}`,
            message: 'Your workflow has been fully approved.',
            senderId: approverId,
            receiverId: stepInstance.workflow.creatorId,
            workflowId,
          },
        })
      }
    } else {
      // REJECTED - mark step and workflow as rejected
      await db.stepInstance.update({
        where: { id: stepInstanceId },
        data: { status: WorkflowStatus.REJECTED, completedAt: now },
      })

      await db.workflowInstance.update({
        where: { id: workflowId },
        data: { status: WorkflowStatus.REJECTED },
      })

      await db.statusHistory.create({
        data: {
          workflowId,
          fromStatus: stepInstance.workflow.status,
          toStatus: WorkflowStatus.REJECTED,
          changedBy: approverId,
          reason: comments || `Step "${stepInstance.name}" rejected`,
        },
      })

      // Notify creator
      await db.notification.create({
        data: {
          type: 'REJECTED',
          title: `Workflow Rejected: ${stepInstance.workflow.title}`,
          message: `Your workflow was rejected at step "${stepInstance.name}". ${comments || ''}`,
          senderId: approverId,
          receiverId: stepInstance.workflow.creatorId,
          workflowId,
        },
      })
    }

    return NextResponse.json(approval, { status: 201 })
  } catch (error) {
    console.error('Approvals POST error:', error)
    return NextResponse.json({ error: 'Failed to submit approval' }, { status: 500 })
  }
}
