import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, WorkflowStatusType } from '@/lib/constants'

// POST /api/approval-action - Handle approval actions for workflow steps
// Complete workflow: Employee Steps → EA Review → Director → EA Final Review → Employee (Final Submit) → Complete
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflowId, stepInstanceId, action, comments, approverId } = body

    if (!workflowId || !stepInstanceId || !action || !approverId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const workflow = await db.workflowInstance.findUnique({
      where: { id: workflowId },
      include: {
        steps: { orderBy: { order: 'asc' }, include: { assignee: { select: { id: true, name: true, role: true } } } },
        tasks: true,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const stepInstance = await db.stepInstance.findUnique({
      where: { id: stepInstanceId },
    })

    if (!stepInstance) {
      return NextResponse.json({ error: 'Step instance not found' }, { status: 404 })
    }

    const now = new Date()
    const task = workflow.tasks[0]

    if (action === 'APPROVE') {
      // Mark current step as approved
      await db.stepInstance.update({
        where: { id: stepInstanceId },
        data: {
          status: WorkflowStatus.APPROVED,
          completedAt: now,
        },
      })

      // Create approval record
      await db.approval.create({
        data: {
          stepInstanceId,
          workflowId,
          approverId,
          action: WorkflowStatus.APPROVED,
          comments: comments || 'Approved',
          level: stepInstance.order,
        },
      })

      // Determine next step
      const currentOrder = stepInstance.order
      const nextStep = workflow.steps.find(
        s => s.order > currentOrder && s.status !== WorkflowStatus.APPROVED && s.status !== WorkflowStatus.COMPLETED
      )

      if (nextStep) {
        // Find the right assignee for next step
        let nextAssigneeId = nextStep.assigneeId

        if (nextStep.name.includes('Director')) {
          // Find director based on task's directorDependency
          if (task?.directorDependency) {
            try {
              const dirNames: string[] = JSON.parse(task.directorDependency)
              if (dirNames.length > 0) {
                const matchedDirector = await db.user.findFirst({
                  where: {
                    role: 'DIRECTOR',
                    isActive: true,
                    name: { contains: dirNames[0].replace(' Sir', '').replace(' sir', '') },
                  },
                })
                if (matchedDirector) nextAssigneeId = matchedDirector.id
              }
            } catch {}
          }
          if (!nextAssigneeId) {
            const anyDirector = await db.user.findFirst({ where: { role: 'DIRECTOR', isActive: true } })
            if (anyDirector) nextAssigneeId = anyDirector.id
          }
        } else if (nextStep.name.includes('EA')) {
          const eaUser = await db.user.findFirst({ where: { role: 'EA', isActive: true } })
          if (eaUser) nextAssigneeId = eaUser.id
        } else if (nextStep.name.includes('Employee')) {
          if (task?.ownerId) nextAssigneeId = task.ownerId
        }

        // Update next step
        await db.stepInstance.update({
          where: { id: nextStep.id },
          data: {
            status: nextStep.stepType === 'APPROVAL' ? WorkflowStatus.IN_REVIEW : WorkflowStatus.IN_PROGRESS,
            assigneeId: nextAssigneeId,
            startedAt: now,
          },
        })

        // Update workflow current step
        await db.workflowInstance.update({
          where: { id: workflowId },
          data: { currentStepOrder: nextStep.order, status: WorkflowStatus.IN_REVIEW },
        })

        // Update task status based on what step we're at
        if (task) {
          let newTaskStatus: WorkflowStatusType = WorkflowStatus.IN_REVIEW

          if (nextStep.name.includes('Director')) {
            newTaskStatus = WorkflowStatus.ON_HOLD // Waiting for director
          } else if (nextStep.name.includes('EA Final')) {
            newTaskStatus = WorkflowStatus.IN_REVIEW // Back to EA for final review
          } else if (nextStep.name.includes('Employee')) {
            newTaskStatus = WorkflowStatus.IN_PROGRESS // Back to employee
          }

          await db.task.update({
            where: { id: task.id },
            data: { status: newTaskStatus },
          })
        }

        // Notify next assignee
        if (nextAssigneeId) {
          let notificationMessage = `Step "${nextStep.name}" is ready for your review.`

          if (nextStep.name.includes('Director')) {
            notificationMessage = `Task "${task?.title || workflow.title}" has been verified by EA and requires your approval. Please review and approve or reject.`
          } else if (nextStep.name.includes('EA Final')) {
            notificationMessage = `Director has approved the task. Please do final review and submit. Comments: ${comments || 'No comments'}`
          } else if (nextStep.name.includes('Employee')) {
            notificationMessage = `Your task has been fully approved! Please review and do the final submission.`
          }

          await db.notification.create({
            data: {
              type: 'APPROVAL_REQUIRED',
              title: `Action Required: ${nextStep.name}`,
              message: notificationMessage,
              senderId: approverId,
              receiverId: nextAssigneeId,
              workflowId,
            },
          })
        }

        // Create status history
        await db.statusHistory.create({
          data: {
            workflowId,
            fromStatus: stepInstance.status,
            toStatus: WorkflowStatus.APPROVED,
            changedBy: approverId,
            reason: `Step "${stepInstance.name}" approved, advancing to "${nextStep.name}". ${comments || ''}`,
          },
        })
      } else {
        // No more workflow steps - EA Final has approved
        // Mark workflow as APPROVED and send task back to employee for final submit
        await db.workflowInstance.update({
          where: { id: workflowId },
          data: { status: WorkflowStatus.APPROVED },
        })

        // Set task back to IN_PROGRESS for employee to do final submit
        if (task) {
          await db.task.update({
            where: { id: task.id },
            data: { status: WorkflowStatus.IN_PROGRESS, updatedAt: now },
          })
        }

        // Notify employee to do final submission
        if (task?.ownerId) {
          await db.notification.create({
            data: {
              type: 'APPROVED',
              title: `Task Approved - Ready for Final Submit: ${task.title}`,
              message: `Your task has been approved through all review stages. Please review and do the final submission.`,
              senderId: approverId,
              receiverId: task.ownerId,
              workflowId,
            },
          })
        }

        // Create status history
        await db.statusHistory.create({
          data: {
            workflowId,
            fromStatus: stepInstance.status,
            toStatus: WorkflowStatus.APPROVED,
            changedBy: approverId,
            reason: 'EA Final approved - workflow complete, task sent back to employee for final submission',
          },
        })
      }
    } else if (action === 'REJECT') {
      // Mark current step as rejected
      await db.stepInstance.update({
        where: { id: stepInstanceId },
        data: {
          status: WorkflowStatus.REJECTED,
          completedAt: now,
        },
      })

      // Create approval record
      await db.approval.create({
        data: {
          stepInstanceId,
          workflowId,
          approverId,
          action: WorkflowStatus.REJECTED,
          comments: comments || 'Rejected',
          level: stepInstance.order,
        },
      })

      // Update workflow status
      await db.workflowInstance.update({
        where: { id: workflowId },
        data: { status: WorkflowStatus.REJECTED },
      })

      // Reset employee workflow step so they can redo
      const employeeStep = workflow.steps.find(s => s.order === 1)
      if (employeeStep) {
        await db.stepInstance.update({
          where: { id: employeeStep.id },
          data: { status: WorkflowStatus.PENDING, startedAt: null, completedAt: null },
        })
      }

      // Reset the task step that triggered the approval
      if (task) {
        // Find the task step that needed director approval and reset it
        const directorStepTask = await db.taskStep.findFirst({
          where: { taskId: task.id, needsDirectorApproval: true, status: WorkflowStatus.COMPLETED },
        })
        if (directorStepTask) {
          await db.taskStep.update({
            where: { id: directorStepTask.id },
            data: { status: WorkflowStatus.PENDING, completedAt: null },
          })
        }

        // Update task status - send back to employee as PENDING
        await db.task.update({
          where: { id: task.id },
          data: { status: WorkflowStatus.PENDING },
        })
      }

      // Notify task owner (employee) that their work was rejected
      if (task?.ownerId) {
        await db.notification.create({
          data: {
            type: 'REJECTED',
            title: `Task Returned: ${task.title}`,
            message: `Your task was rejected at step "${stepInstance.name}". Reason: ${comments || 'No reason provided'}. Please redo and resubmit.`,
            senderId: approverId,
            receiverId: task.ownerId,
            workflowId,
          },
        })
      }

      // Create status history
      await db.statusHistory.create({
        data: {
          workflowId,
          fromStatus: stepInstance.status,
          toStatus: WorkflowStatus.REJECTED,
          changedBy: approverId,
          reason: comments || `Step "${stepInstance.name}" rejected - sent back to employee`,
        },
      })
    } else if (action === 'SEND_BACK') {
      // Send back to previous step (e.g., Director sends back to EA)
      const prevOrder = stepInstance.order - 1
      const prevStep = workflow.steps.find(s => s.order === prevOrder)

      if (prevStep) {
        // Reset current step to PENDING
        await db.stepInstance.update({
          where: { id: stepInstanceId },
          data: {
            status: WorkflowStatus.PENDING,
            completedAt: null,
          },
        })

        // Reactivate previous step
        const eaUser = await db.user.findFirst({ where: { role: 'EA', isActive: true } })
        await db.stepInstance.update({
          where: { id: prevStep.id },
          data: {
            status: WorkflowStatus.IN_REVIEW,
            assigneeId: eaUser?.id || prevStep.assigneeId,
            startedAt: now,
          },
        })

        // Update workflow current step
        await db.workflowInstance.update({
          where: { id: workflowId },
          data: { currentStepOrder: prevOrder, status: WorkflowStatus.IN_REVIEW },
        })

        // Update task status back to IN_REVIEW
        if (task) {
          await db.task.update({
            where: { id: task.id },
            data: { status: WorkflowStatus.IN_REVIEW },
          })
        }

        // Notify previous assignee (EA)
        if (prevStep.assigneeId || eaUser?.id) {
          await db.notification.create({
            data: {
              type: 'STATUS_CHANGE',
              title: `Task Returned from Director: ${workflow.title}`,
              message: `Director has sent the task back with comments: ${comments || 'No comments'}. Please review and take action.`,
              senderId: approverId,
              receiverId: prevStep.assigneeId || eaUser?.id || '',
              workflowId,
            },
          })
        }

        // Create status history
        await db.statusHistory.create({
          data: {
            workflowId,
            fromStatus: stepInstance.status,
            toStatus: WorkflowStatus.IN_REVIEW,
            changedBy: approverId,
            reason: `Director sent task back to EA. Comments: ${comments || 'None'}`,
          },
        })
      }
    }

    return NextResponse.json({ success: true, action, workflowId })
  } catch (error) {
    console.error('Approval action error:', error)
    return NextResponse.json({ error: 'Failed to process approval action' }, { status: 500 })
  }
}
