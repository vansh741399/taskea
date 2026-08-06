import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { LeaveStatus, LeaveStatusType } from '@/lib/constants'

// PATCH /api/leaves/[id] — approve, reject, or cancel a leave
// ONLY ADMIN can approve/reject. Employees can cancel their own leaves.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, approvedById, eaRemark } = body

    if (!action || !['approve', 'reject', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject, or cancel' }, { status: 400 })
    }

    // Verify the approver is an ADMIN for approve/reject actions
    // v25·0806-leave-approval: ALSO allow FOUNDER and DIRECTOR to approve/reject
    // leaves. Previously only ADMIN could. Per business decision, the founder
    // and director (Samarth Sir) need approval authority too.
    if (action === 'approve' || action === 'reject') {
      if (!approvedById) {
        return NextResponse.json({ error: 'approvedById is required for approve/reject actions' }, { status: 400 })
      }

      const approver = await db.user.findUnique({
        where: { id: approvedById },
        select: { id: true, role: true, name: true },
      })

      const canApprove = approver && ['ADMIN', 'FOUNDER', 'DIRECTOR'].includes(approver.role)
      if (!canApprove) {
        return NextResponse.json({ error: 'Only ADMIN, FOUNDER, or DIRECTOR can approve or reject leaves' }, { status: 403 })
      }
    }

    const leave = await db.leave.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!leave) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 })
    }

    let status: LeaveStatusType
    if (action === 'approve') status = LeaveStatus.APPROVED
    else if (action === 'reject') status = LeaveStatus.REJECTED
    else status = LeaveStatus.CANCELLED

    const updated = await db.leave.update({
      where: { id },
      data: {
        status,
        approvedById: action !== 'cancel' ? approvedById : null,
        approvedAt: action !== 'cancel' ? new Date() : null,
        eaRemark: eaRemark || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    })

    // Create notification for the employee when leave is approved/rejected
    if (action === 'approve' || action === 'reject') {
      try {
        const isApproved = action === 'approve'
        const fromDateStr = new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        const toDateStr = new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

        await db.notification.create({
          data: {
            type: isApproved ? 'APPROVED' : 'REJECTED',
            title: isApproved ? 'Leave Approved' : 'Leave Rejected',
            message: `Your ${leave.leaveType} leave (${fromDateStr} → ${toDateStr}, ${leave.totalDays} day${(leave.totalDays || 1) > 1 ? 's' : ''}) has been ${isApproved ? 'approved' : 'rejected'} by ${updated.approvedBy?.name || 'Admin'}.${eaRemark ? ` Remark: ${eaRemark}` : ''}`,
            senderId: approvedById || null,
            receiverId: leave.userId,
          },
        })
      } catch (notifErr) {
        console.error('Failed to create leave notification:', notifErr)
      }
    }

    // Create notification for EA/Admin when an employee cancels their leave
    if (action === 'cancel') {
      try {
        const eaUsers = await db.user.findMany({ where: { role: { in: ['EA', 'ADMIN'] }, isActive: true }, select: { id: true } })
        const fromDateStr = new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        for (const eaUser of eaUsers) {
          await db.notification.create({
            data: {
              type: 'STATUS_CHANGE',
              title: 'Leave Cancelled',
              message: `${leave.user?.name || 'Employee'} cancelled their ${leave.leaveType} leave starting ${fromDateStr}`,
              senderId: leave.userId,
              receiverId: eaUser.id,
            },
          })
        }
      } catch (notifErr) {
        console.error('Failed to create cancel notification:', notifErr)
      }
    }

    return NextResponse.json({ leave: updated })
  } catch (error) {
    console.error('Leave PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update leave' }, { status: 500 })
  }
}
