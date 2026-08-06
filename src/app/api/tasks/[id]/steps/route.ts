import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { stepId, action } = body

    if (!stepId) {
      return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
    }

    const step = await db.taskStep.findUnique({
      where: { id: stepId },
    })

    if (!step || step.taskId !== taskId) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    const now = new Date()

    if (action === 'complete') {
      // Auto-start the task if it's still PENDING
      const currentTask = await db.task.findUnique({ where: { id: taskId } })
      if (currentTask?.status === WorkflowStatus.PENDING) {
        await db.task.update({
          where: { id: taskId },
          data: { status: WorkflowStatus.IN_PROGRESS },
        })
      }

      // Complete this step
      const updatedStep = await db.taskStep.update({
        where: { id: stepId },
        data: {
          status: WorkflowStatus.COMPLETED,
          completedAt: now,
        },
      })

      // Simplified: No director approval routing - just check if all steps are done
      const allSteps = await db.taskStep.findMany({ where: { taskId } })
      const allDone = allSteps.every(s => s.status === WorkflowStatus.COMPLETED)

      if (allDone) {
        // All steps done - complete the task directly
        await db.task.update({
          where: { id: taskId },
          data: { status: WorkflowStatus.COMPLETED, completedAt: now },
        })

        // If task has a workflow, mark it completed too
        const task = await db.task.findUnique({ where: { id: taskId } })
        if (task?.workflowId) {
          await db.workflowInstance.update({
            where: { id: task.workflowId },
            data: { status: WorkflowStatus.COMPLETED },
          }).catch(() => {})
        }
      }

      return NextResponse.json({ step: updatedStep, allDone })
    }

    if (action === 'reopen') {
      const updatedStep = await db.taskStep.update({
        where: { id: stepId },
        data: {
          status: WorkflowStatus.PENDING,
          completedAt: null,
        },
      })

      // If task was completed, move it back to in progress
      const task = await db.task.findUnique({ where: { id: taskId } })
      if (task?.status === WorkflowStatus.COMPLETED) {
        await db.task.update({
          where: { id: taskId },
          data: { status: WorkflowStatus.IN_PROGRESS, completedAt: null },
        })
      }

      return NextResponse.json({ step: updatedStep })
    }

    return NextResponse.json({ error: 'Invalid action. Use "complete" or "reopen"' }, { status: 400 })
  } catch (error) {
    console.error('Task step PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })
  }
}
