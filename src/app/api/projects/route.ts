import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, TaskPriority } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')
    const department = request.nextUrl.searchParams.get('department')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (department) where.department = department

    const projects = await db.project.findMany({
      where,
      include: {
        manager: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        tasks: {
          select: { id: true, status: true, priority: true, dueDate: true, completedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    // Use start-of-day for overdue comparison so today's tasks are NOT counted as overdue.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const projectsWithStats = projects.map(p => {
      const totalTasks = p.tasks.length
      const completedTasks = p.tasks.filter(t => t.status === 'COMPLETED').length
      const overdueTasks = p.tasks.filter(t =>
        t.dueDate && new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status)
      ).length
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        department: p.department,
        status: p.status,
        priority: p.priority,
        startDate: p.startDate?.toISOString(),
        endDate: p.endDate?.toISOString(),
        createdAt: p.createdAt.toISOString(),
        manager: p.manager,
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate,
      }
    })

    // Stats
    const totalProjects = projectsWithStats.length
    const inProgress = projectsWithStats.filter(p => p.status === 'IN_PROGRESS').length
    const completed = projectsWithStats.filter(p => p.status === 'COMPLETED').length
    const onHold = projectsWithStats.filter(p => ['ON_HOLD', 'PENDING'].includes(p.status)).length

    return NextResponse.json({
      projects: projectsWithStats,
      stats: { total: totalProjects, inProgress, completed, onHold },
    })
  } catch (error) {
    console.error('Projects GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, department, managerId, priority, startDate, endDate } = body

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    const project = await db.project.create({
      data: {
        name,
        description: description || null,
        department: department || null,
        managerId: managerId || null,
        priority: priority || TaskPriority.MEDIUM,
        status: WorkflowStatus.PENDING,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Projects POST error:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
