import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/leaves — list leaves, optional filters: userId, status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    const where: any = {}
    if (userId) where.userId = userId
    if (status) where.status = status

    const leaves = await db.leave.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true, designation: true, phone: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ leaves: Array.isArray(leaves) ? leaves : [] })
  } catch (error) {
    console.error('Leaves GET error:', error)
    // Return safe default structure instead of error object to prevent .filter() crashes
    return NextResponse.json({ leaves: [] })
  }
}

// POST /api/leaves — apply for leave
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Leave POST body:', JSON.stringify(body))
    const { userId, leaveType, fromDate, toDate, reason } = body

    if (!userId || !fromDate || !toDate || !reason) {
      console.error('Leave POST missing fields:', { userId, fromDate, toDate, reason: reason ? 'provided' : 'missing' })
      return NextResponse.json({ error: 'userId, fromDate, toDate, and reason are required' }, { status: 400 })
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      console.error('Leave POST user not found:', userId)
      return NextResponse.json({ error: 'User not found. Please log in again.' }, { status: 400 })
    }

    const from = new Date(fromDate)
    const to = new Date(toDate)

    // Validate dates
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      console.error('Leave POST invalid dates:', { fromDate, toDate })
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    if (to < from) {
      console.error('Leave POST toDate before fromDate:', { fromDate, toDate })
      return NextResponse.json({ error: 'To Date must be same or after From Date' }, { status: 400 })
    }

    // Calculate total days (inclusive)
    const diffMs = to.getTime() - from.getTime()
    const totalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1)

    // AL/LA logic: AL = Applied on time (1+ day before), LA = Late Application (same day)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const fromDayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const daysBeforeLeave = Math.ceil((fromDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
    const applicationTag = daysBeforeLeave >= 1 ? 'AL' : 'LA'

    const leave = await db.leave.create({
      data: {
        userId,
        leaveType: leaveType || 'CASUAL',
        fromDate: from,
        toDate: to,
        reason,
        applicationTag,
        totalDays,
      },
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
      },
    })

    console.log('Leave created successfully:', leave.id, 'for user:', userId, 'tag:', applicationTag)

    // Notify ALL EA/Admin users about the new leave application
    try {
      const eaUsers = await db.user.findMany({ where: { role: { in: ['EA', 'ADMIN'] }, isActive: true }, select: { id: true } })
      const fromDateStr = from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      for (const eaUser of eaUsers) {
        await db.notification.create({
          data: {
            type: 'LEAVE_APPLIED',
            title: 'New Leave Application',
            message: `${user.name} applied for ${leaveType || 'Casual'} leave (${fromDateStr}, ${totalDays} day${totalDays > 1 ? 's' : ''}). Tag: ${applicationTag}`,
            senderId: userId,
            receiverId: eaUser.id,
          },
        })
      }
    } catch (notifErr) {
      console.error('Failed to create leave application notification:', notifErr)
    }

    return NextResponse.json({ leave }, { status: 201 })
  } catch (error) {
    console.error('Leave POST error:', error)
    return NextResponse.json({ error: 'Failed to apply leave: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 })
  }
}
