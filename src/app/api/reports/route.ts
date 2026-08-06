import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'employee'

    const now = new Date()
    // Use start-of-day for overdue comparison so today's tasks are NOT counted as overdue.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const allUsers = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, email: true, role: true, department: true,
        designation: true, phone: true, location: true, joinDate: true, createdAt: true,
        tasks: { select: { id: true, status: true, priority: true, dueDate: true, completedAt: true, category: true } },
      },
      orderBy: { name: 'asc' },
    })

    const allTasks = await db.task.findMany({
      include: {
        owner: { select: { id: true, name: true, department: true, role: true } },
      },
    })

    const allProjects = await db.project.findMany({
      include: {
        manager: { select: { id: true, name: true } },
        tasks: { select: { id: true, status: true } },
      },
    })

    // Employee report
    if (type === 'employee') {
      const report = allUsers.map(u => {
        const totalTasks = u.tasks.length
        const completed = u.tasks.filter(t => t.status === 'COMPLETED').length
        const inProgress = u.tasks.filter(t => t.status === 'IN_PROGRESS').length
        const overdue = u.tasks.filter(t =>
          t.dueDate && new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status)
        ).length
        const score = totalTasks > 0 ? Math.round((completed / totalTasks) * 100 - overdue * 5) : 0

        return {
          name: u.name, email: u.email, role: u.role, department: u.department,
          designation: u.designation, phone: u.phone, location: u.location,
          joinDate: u.joinDate?.toISOString().split('T')[0],
          totalTasks, completed, inProgress, overdue,
          performanceScore: Math.max(0, score),
          completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
        }
      })
      return NextResponse.json({ type: 'employee', data: report, generatedAt: now.toISOString() })
    }

    // Task report
    if (type === 'task') {
      const report = allTasks.map(t => ({
        title: t.title, description: t.description, status: t.status, priority: t.priority,
        department: t.department, category: t.category,
        owner: t.owner?.name, ownerDepartment: t.owner?.department,
        dueDate: t.dueDate?.toISOString().split('T')[0],
        completedAt: t.completedAt?.toISOString().split('T')[0],
        createdAt: t.createdAt.toISOString().split('T')[0],
        isOverdue: t.dueDate ? new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status) : false,
      }))
      return NextResponse.json({ type: 'task', data: report, generatedAt: now.toISOString() })
    }

    // Department report
    if (type === 'department') {
      const deptMap: Record<string, { total: number; completed: number; inProgress: number; overdue: number; members: number }> = {}
      allTasks.forEach(t => {
        const dept = t.department || 'Unassigned'
        if (!deptMap[dept]) deptMap[dept] = { total: 0, completed: 0, inProgress: 0, overdue: 0, members: 0 }
        deptMap[dept].total++
        if (t.status === 'COMPLETED') deptMap[dept].completed++
        if (t.status === 'IN_PROGRESS') deptMap[dept].inProgress++
        if (t.dueDate && new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status)) deptMap[dept].overdue++
      })
      allUsers.forEach(u => {
        const dept = u.department || 'Unassigned'
        if (deptMap[dept]) deptMap[dept].members++
      })
      const report = Object.entries(deptMap).map(([name, v]) => ({
        department: name,
        ...v,
        completionRate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
        efficiency: v.total > 0 ? Math.round(((v.completed + v.inProgress) / v.total) * 100) : 0,
      }))
      return NextResponse.json({ type: 'department', data: report, generatedAt: now.toISOString() })
    }

    // Project report
    if (type === 'project') {
      const report = allProjects.map(p => {
        const totalTasks = p.tasks.length
        const completed = p.tasks.filter(t => t.status === 'COMPLETED').length
        return {
          name: p.name, description: p.description, department: p.department,
          status: p.status, priority: p.priority,
          manager: p.manager?.name,
          startDate: p.startDate?.toISOString().split('T')[0],
          endDate: p.endDate?.toISOString().split('T')[0],
          totalTasks, completed,
          completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
        }
      })
      return NextResponse.json({ type: 'project', data: report, generatedAt: now.toISOString() })
    }

    // Performance report
    if (type === 'performance') {
      const report = allUsers.map(u => {
        const totalTasks = u.tasks.length
        const completed = u.tasks.filter(t => t.status === 'COMPLETED').length
        const overdue = u.tasks.filter(t =>
          t.dueDate && new Date(t.dueDate) < todayStart && !['COMPLETED', 'CANCELLED'].includes(t.status)
        ).length
        const score = totalTasks > 0 ? Math.round((completed / totalTasks) * 100 - overdue * 5) : 0
        const categories: Record<string, number> = {}
        u.tasks.forEach(t => {
          const cat = t.category || 'Other'
          categories[cat] = (categories[cat] || 0) + 1
        })

        return {
          name: u.name, role: u.role, department: u.department, designation: u.designation,
          totalTasks, completed, overdue,
          performanceScore: Math.max(0, score),
          completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
          categoryBreakdown: categories,
          rating: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Needs Improvement',
        }
      }).sort((a, b) => b.performanceScore - a.performanceScore)
      return NextResponse.json({ type: 'performance', data: report, generatedAt: now.toISOString() })
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  } catch (error) {
    console.error('Reports GET error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
