import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { UserRole } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const department = request.nextUrl.searchParams.get('department')
    const role = request.nextUrl.searchParams.get('role')
    const status = request.nextUrl.searchParams.get('status')
    const search = request.nextUrl.searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (department) where.department = department
    if (role) where.role = role
    if (status === 'active') where.isActive = true
    else if (status === 'inactive') where.isActive = false

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { designation: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const employees = await db.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, department: true,
        designation: true, phone: true, location: true, avatar: true,
        isActive: true, joinDate: true, createdAt: true,
        tasks: {
          select: { id: true, status: true, priority: true, dueDate: true, completedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const now = new Date()
    // Use start-of-day for overdue comparison so today's tasks are NOT counted as overdue.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const employeesWithStats = employees.map(emp => {
      const totalTasks = emp.tasks.length
      const completedTasks = emp.tasks.filter(t => t.status === 'COMPLETED').length
      const inProgressTasks = emp.tasks.filter(t => t.status === 'IN_PROGRESS').length
      const overdueTasks = emp.tasks.filter(t =>
        t.dueDate && new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status)
      ).length
      const performanceScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100 - overdueTasks * 5) : 0

      return {
        id: emp.id,
        email: emp.email,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        designation: emp.designation,
        phone: emp.phone,
        location: emp.location,
        avatar: emp.avatar,
        isActive: emp.isActive,
        joinDate: emp.joinDate?.toISOString(),
        createdAt: emp.createdAt.toISOString(),
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        performanceScore: Math.max(0, performanceScore),
      }
    })

    // Summary stats
    const totalEmployees = employeesWithStats.length
    const activeEmployees = employeesWithStats.filter(e => e.isActive).length
    const departments = [...new Set(employeesWithStats.map(e => e.department).filter(Boolean))].length
    const onLeave = totalEmployees - activeEmployees

    return NextResponse.json({
      employees: Array.isArray(employeesWithStats) ? employeesWithStats : [],
      stats: { total: totalEmployees, active: activeEmployees, departments, onLeave },
    })
  } catch (error) {
    console.error('Employees GET error:', error)
    // Return safe default structure instead of error object to prevent .filter() crashes
    return NextResponse.json({ employees: [], stats: { total: 0, active: 0, departments: 0, onLeave: 0 } })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, role, department, designation, phone, location } = body

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    // Check for duplicate email
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'An employee with this email already exists' }, { status: 400 })
    }

    // Only the owner can be ADMIN - prevent others from getting ADMIN role
    const requestedRole = role || UserRole.EMPLOYEE
    if (requestedRole === UserRole.ADMIN) {
      const existingAdmins = await db.user.findMany({ where: { role: UserRole.ADMIN } })
      if (existingAdmins.length > 0) {
        return NextResponse.json({ error: 'Admin role is reserved for the owner only.' }, { status: 403 })
      }
    }

    const employee = await db.user.create({
      data: {
        name,
        email,
        role: requestedRole,
        department: department || null,
        designation: designation || null,
        phone: phone || null,
        location: location || null,
        isActive: true,
      },
    })

    // Notify HR/admin
    const admins = await db.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          type: 'STATUS_CHANGE',
          title: `New Employee Added: ${name}`,
          message: `${name} has joined as ${designation || role} in ${department || 'Unassigned'}.`,
          receiverId: admin.id,
        },
      })
    }

    return NextResponse.json(employee, { status: 201 })
  } catch (error) {
    console.error('Employees POST error:', error)
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, isActive, name, department, designation, phone, location, role } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (isActive !== undefined) updateData.isActive = isActive
    if (name !== undefined) updateData.name = name
    if (department !== undefined) updateData.department = department
    if (designation !== undefined) updateData.designation = designation
    if (phone !== undefined) updateData.phone = phone
    if (location !== undefined) updateData.location = location
    if (role !== undefined) updateData.role = role

    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
    })

    // If deactivating (employee left), create notification
    if (isActive === false && user.isActive) {
      const admins = await db.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } })
      for (const admin of admins) {
        await db.notification.create({
          data: {
            type: 'STATUS_CHANGE',
            title: `Employee Deactivated: ${user.name}`,
            message: `${user.name} has been removed from the active team. Their tasks remain in the system.`,
            receiverId: admin.id,
          },
        })
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Employees PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        tasks: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
        assignedTaskSteps: { where: { status: { notIn: ['COMPLETED'] } } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Don't allow deleting the last admin
    if (user.role === UserRole.ADMIN) {
      const adminCount = await db.user.count({ where: { role: UserRole.ADMIN, isActive: true } })
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 403 })
      }
    }

    // Instead of hard deleting, deactivate the employee (soft delete)
    // This preserves their task history and data
    await db.user.update({
      where: { id: userId },
      data: { isActive: false },
    })

    // Notify admins
    const admins = await db.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          type: 'STATUS_CHANGE',
          title: `Employee Removed: ${user.name}`,
          message: `${user.name} (${user.role}) has been removed from the team. Their existing tasks remain in the system.`,
          receiverId: admin.id,
        },
      })
    }

    return NextResponse.json({ success: true, message: `${user.name} has been removed from the team` })
  } catch (error) {
    console.error('Employees DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove employee' }, { status: 500 })
  }
}
