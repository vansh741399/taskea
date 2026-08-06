import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, WorkflowStatusType } from '@/lib/constants'

const VALID_TRANSITIONS: Record<WorkflowStatusType, WorkflowStatusType[]> = {
  DRAFT: [WorkflowStatus.PENDING],
  PENDING: [WorkflowStatus.IN_REVIEW, WorkflowStatus.CANCELLED],
  IN_REVIEW: [WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.ESCALATED, WorkflowStatus.ON_HOLD],
  REJECTED: [WorkflowStatus.RE_OPENED],
  RE_OPENED: [WorkflowStatus.IN_REVIEW],
  APPROVED: [WorkflowStatus.IN_PROGRESS],
  IN_PROGRESS: [WorkflowStatus.COMPLETED, WorkflowStatus.ON_HOLD, WorkflowStatus.EXTERNAL_HOLD],
  ON_HOLD: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.CANCELLED],
  EXTERNAL_HOLD: [WorkflowStatus.IN_PROGRESS],
  ESCALATED: [WorkflowStatus.IN_REVIEW, WorkflowStatus.APPROVED, WorkflowStatus.REJECTED],
  COMPLETED: [],
  CANCELLED: [],
}

function validateTransition(from: WorkflowStatusType, to: WorkflowStatusType): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const workflow = await db.workflowInstance.findUnique({
      where: { id },
      include: {
        template: { select: { id: true, name: true, category: true, description: true } },
        creator: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        steps: {
          orderBy: { order: 'asc' },
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true, avatar: true } },
            approvals: {
              include: {
                approver: { select: { id: true, name: true, email: true, role: true } },
              },
            },
          },
        },
        approvals: {
          include: {
            approver: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        escalationLogs: { orderBy: { createdAt: 'desc' } },
        comments: {
          include: {
            author: { select: { id: true, name: true, email: true, role: true, avatar: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        tasks: true,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error('Workflow GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, changedBy, reason } = body

    const workflow = await db.workflowInstance.findUnique({
      where: { id },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    if (status && !validateTransition(workflow.status as WorkflowStatusType, status as WorkflowStatusType)) {
      return NextResponse.json(
        { error: `Invalid transition from ${workflow.status} to ${status}` },
        { status: 400 }
      )
    }

    const updatedWorkflow = await db.workflowInstance.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      },
    })

    // Log status change
    if (status) {
      await db.statusHistory.create({
        data: {
          workflowId: id,
          fromStatus: workflow.status,
          toStatus: status,
          changedBy: changedBy || null,
          reason: reason || null,
        },
      })

      // Create notification for creator about status change
      if (workflow.creatorId && changedBy !== workflow.creatorId) {
        await db.notification.create({
          data: {
            type: 'STATUS_CHANGE',
            title: `Workflow ${status.replace('_', ' ')}`,
            message: `Your workflow "${workflow.title}" has been updated to ${status.replace('_', ' ')}.`,
            senderId: changedBy || null,
            receiverId: workflow.creatorId,
            workflowId: id,
          },
        })
      }
    }

    return NextResponse.json(updatedWorkflow)
  } catch (error) {
    console.error('Workflow PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}
