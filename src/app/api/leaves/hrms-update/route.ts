import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { LeaveStatus, LeaveStatusType } from '@/lib/constants'

/**
 * ERP endpoint: /api/leaves/hrms-update
 *
 * SAFETY:
 * - This is a NEW endpoint (does not modify existing /api/leaves GET/POST/PATCH routes)
 * - Only called by HRMS when HR approves/rejects an ERP-originated leave
 * - Updates the ERP Leave record's status and creates a notification for the employee
 * - Does NOT delete or modify any other ERP record
 *
 * Auth:
 * - Requires `x-integration-key` header matching the shared HRMS_ERP_INTEGRATION_KEY env var
 * - Falls back to a default key if env var is not set (same default as HRMS side)
 *
 * Request body:
 *   {
 *     "leaveId": "<erp-leave-id>",
 *     "status": "approved" | "rejected",
 *     "approvedBy": "HR name" (optional)
 *   }
 *
 * Response:
 *   - 200: { success: true, message: "...", leave: {...} }
 *   - 400: Missing required fields
 *   - 401: Invalid integration key
 *   - 404: Leave not found
 *   - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Auth: verify integration key ───
    const INTEGRATION_KEY =
      process.env.HRMS_ERP_INTEGRATION_KEY || 'laxree-hrms-erp-integration-2026'
    const providedKey = request.headers.get('x-integration-key')
    if (!providedKey || providedKey !== INTEGRATION_KEY) {
      return NextResponse.json({ error: 'Invalid or missing integration key' }, { status: 401 })
    }

    const body = await request.json()
    const { leaveId, status, approvedBy } = body

    // ─── Validate input ───
    if (!leaveId || !status) {
      return NextResponse.json(
        { error: 'leaveId and status are required' },
        { status: 400 }
      )
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "approved" or "rejected"' },
        { status: 400 }
      )
    }

    // ─── Look up the ERP leave ───
    const leave = await db.leave.findUnique({
      where: { id: leaveId },
      include: { user: { select: { id: true, name: true } } },
    })

    if (!leave) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 })
    }

    // ─── Idempotency check: if leave is already in the target status, return success without re-updating ───
    const targetStatus: LeaveStatusType =
      status === 'approved' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED

    if (leave.status === targetStatus) {
      return NextResponse.json({
        success: true,
        message: `Leave already ${targetStatus.toLowerCase()} (idempotent)`,
        leave,
        idempotent: true,
      })
    }

    // ─── Safety: only PENDING leaves can be approved/rejected via HRMS sync ───
    // (Cancelled leaves stay cancelled; already-approved/rejected leaves can't be re-flipped via this route)
    if (leave.status !== LeaveStatus.PENDING) {
      return NextResponse.json(
        {
          error: `Cannot update leave in status ${leave.status} (only PENDING leaves can be synced)`,
        },
        { status: 400 }
      )
    }

    // ─── Update the leave ───
    // approvedById is set to null because the approval came from HRMS (no ERP user ID).
    // The HRMS approver name is stored in eaRemark for traceability.
    const updated = await db.leave.update({
      where: { id: leaveId },
      data: {
        status: targetStatus,
        approvedAt: new Date(),
        eaRemark: approvedBy ? `Approved via HRMS by ${approvedBy}` : 'Approved via HRMS',
        // approvedById is intentionally left null — the approver is an HRMS user, not an ERP user
      },
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
      },
    })

    // ─── Create notification for the employee ───
    try {
      const isApproved = status === 'approved'
      const fromDateStr = new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      const toDateStr = new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

      await db.notification.create({
        data: {
          type: isApproved ? 'APPROVED' : 'REJECTED',
          title: isApproved ? 'Leave Approved (via HRMS)' : 'Leave Rejected (via HRMS)',
          message: `Your ${leave.leaveType} leave (${fromDateStr} → ${toDateStr}, ${leave.totalDays} day${(leave.totalDays || 1) > 1 ? 's' : ''}) has been ${isApproved ? 'approved' : 'rejected'} by HR.${approvedBy ? ` Approved by: ${approvedBy}` : ''}`,
          senderId: null, // No ERP user is the sender — HRMS is the source
          receiverId: leave.userId,
        },
      })
    } catch (notifErr) {
      // Notification failure is non-fatal — leave update already succeeded
      console.error('Failed to create HRMS-sync leave notification:', notifErr)
    }

    return NextResponse.json({
      success: true,
      message: `Leave ${status} via HRMS sync`,
      leave: updated,
    })
  } catch (error) {
    console.error('[hrms-update] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update leave via HRMS sync' },
      { status: 500 }
    )
  }
}
