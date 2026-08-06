import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { WorkflowStatus, TaskPriority, UserRole } from '@/lib/constants'

export async function POST() {
  try {
    // Clean existing data first
    await db.taskStep.deleteMany()
    await db.notification.deleteMany()
    await db.approval.deleteMany()
    await db.task.deleteMany()
    await db.leave.deleteMany()
    await db.mondayMeeting.deleteMany()
    await db.department.deleteMany()
    await db.category.deleteMany()
    await db.user.deleteMany()

    // Create users with SPECIFIC IDs matching the client-side login credentials
    const members = [
      { id: 'user-admin', email: 'admin@laxree.com', name: 'Samarth Sir', role: UserRole.ADMIN, department: 'Management', designation: 'Owner & CEO', phone: '9982286662', location: 'Ajmer', isActive: true },
      { id: 'user-ea1', email: 'ea@laxree.com', name: 'Arti Sharma', role: UserRole.EA, department: 'Back Office', designation: 'Executive Assistant', phone: '9982286662', location: 'Ajmer', isActive: true },
      { id: 'user-dir3', email: 'ashish@laxree.com', name: 'Ashish Sir', role: UserRole.DIRECTOR, department: 'Management', designation: 'Director', isActive: true },
      { id: 'user-dir4', email: 'samarth@laxree.com', name: 'Samarth Sir', role: UserRole.DIRECTOR, department: 'Management', designation: 'Director', isActive: true },
      { id: 'user-mgr1', email: 'khushboo@laxree.com', name: 'Khushboo Manglani', role: UserRole.MANAGER, department: 'Sales', designation: 'Sales Manager', isActive: true },
      { id: 'user-emp1', email: 'aditya@laxree.com', name: 'Aditya Sharma', role: UserRole.EMPLOYEE, department: 'Sales', designation: 'Sales Executive', isActive: true },
      { id: 'user-emp2', email: 'aakash@laxree.com', name: 'Aakash', role: UserRole.EMPLOYEE, department: 'Sales', designation: 'Sales Executive', isActive: true },
      { id: 'user-emp3', email: 'anamika@laxree.com', name: 'Anamika', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Operations', isActive: true },
      { id: 'user-emp4', email: 'saurabh@laxree.com', name: 'Saurabh', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Operations', isActive: true },
      { id: 'user-emp5', email: 'ruchi@laxree.com', name: 'Ruchi', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Operations', isActive: true },
      { id: 'user-emp6', email: 'aayush@laxree.com', name: 'Aayush', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Operations', isActive: true },
      { id: 'user-emp7', email: 'kamlesh@laxree.com', name: 'Kamlesh', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Operations', isActive: true },
      { id: 'user-emp8', email: 'hitesh@laxree.com', name: 'Hitesh Tak', role: UserRole.EMPLOYEE, department: 'Accounts', designation: 'Accountant', isActive: true },
      { id: 'user-mgr2', email: 'radhika@laxree.com', name: 'Radhika', role: UserRole.MANAGER, department: 'Back Office', designation: 'Operations Manager', isActive: true },
      { id: 'user-mgr3', email: 'tanuja@laxree.com', name: 'Tanuja Tigaya', role: UserRole.MANAGER, department: 'Back Office', designation: 'Team Lead', isActive: true },
    ]

    const createdUsers: any[] = []
    for (const m of members) {
      const user = await db.user.create({ data: m })
      createdUsers.push(user)
    }

    // Create departments
    const departments = [
      { id: 'dept-sales', name: 'Sales', description: 'Sales and client acquisition' },
      { id: 'dept-backoffice', name: 'Back Office', description: 'Operations and support' },
      { id: 'dept-accounts', name: 'Accounts', description: 'Finance and accounting' },
      { id: 'dept-management', name: 'Management', description: 'Strategic oversight' },
    ]
    for (const dept of departments) {
      await db.department.create({ data: dept })
    }

    // Create categories
    const categories = [
      { id: 'cat-admin', name: 'Admin', color: '#6D28D9' },
      { id: 'cat-operations', name: 'Operations', color: '#1D4ED8' },
      { id: 'cat-finance', name: 'Finance', color: '#15803D' },
      { id: 'cat-routine', name: 'Routine Work', color: '#B45309' },
      { id: 'cat-onetime', name: 'One Time Work', color: '#BE123C' },
      { id: 'cat-recon', name: 'Reconciliation', color: '#0F766E' },
    ]
    for (const cat of categories) {
      await db.category.create({ data: cat })
    }

    // Assignees (non-admin, non-director)
    const assignees = createdUsers.filter(u => u.role !== UserRole.ADMIN && u.role !== UserRole.DIRECTOR && u.role !== UserRole.EA)

    // Create tasks with proper assignments
    const now = new Date()
    const taskData = [
      { title: 'Daily Operations Checklist', description: 'Complete daily operations checklist', priority: TaskPriority.LOW, status: WorkflowStatus.COMPLETED, frequency: 'Daily', category: 'Routine Work', dept: 'Back Office' },
      { title: 'Monthly Sales Report', description: 'Prepare and submit the monthly sales report', priority: TaskPriority.HIGH, status: WorkflowStatus.IN_PROGRESS, frequency: 'Monthly', monthDates: '[1]', category: 'Routine Work', dept: 'Sales' },
      { title: 'Client Follow-up - ABC Corp', description: 'Follow up with ABC Corp regarding pending proposal', priority: TaskPriority.HIGH, status: WorkflowStatus.PENDING, frequency: 'One Time', category: 'One Time Work', dept: 'Sales' },
      { title: 'Weekly Reconciliation', description: 'Complete weekly bank reconciliation', priority: TaskPriority.MEDIUM, status: WorkflowStatus.IN_PROGRESS, frequency: 'Weekly', weekDays: '["Monday"]', category: 'Reconciliation', dept: 'Accounts' },
      { title: 'Update CRM Records', description: 'Update all client records in the CRM system', priority: TaskPriority.LOW, status: WorkflowStatus.COMPLETED, frequency: 'One Time', category: 'Operations', dept: 'Sales' },
      { title: 'Design Review - Hotel Brochure', description: 'Review and approve the hotel brochure design', priority: TaskPriority.MEDIUM, status: WorkflowStatus.PENDING, frequency: 'One Time', category: 'One Time Work', dept: 'Back Office' },
      { title: 'Procurement - Office Supplies', description: 'Order office supplies for the quarter', priority: TaskPriority.LOW, status: WorkflowStatus.COMPLETED, frequency: 'One Time', category: 'Operations', dept: 'Back Office' },
      { title: 'Compliance Audit Preparation', description: 'Prepare documentation for upcoming compliance audit', priority: TaskPriority.CRITICAL, status: WorkflowStatus.ON_HOLD, frequency: 'One Time', category: 'Operations', dept: 'Back Office' },
      { title: 'Team Performance Review', description: 'Conduct quarterly team performance reviews', priority: TaskPriority.HIGH, status: WorkflowStatus.PENDING, frequency: 'Monthly', monthDates: '[28]', category: 'Routine Work', dept: 'Back Office' },
      { title: 'Invoice Processing - Vendor Payments', description: 'Process pending vendor invoices', priority: TaskPriority.MEDIUM, status: WorkflowStatus.IN_PROGRESS, frequency: 'Weekly', weekDays: '["Friday"]', category: 'Reconciliation', dept: 'Accounts' },
      { title: 'Roofing Project Status Update', description: 'Update roofing project status and timeline', priority: TaskPriority.HIGH, status: WorkflowStatus.EXTERNAL_HOLD, frequency: 'One Time', category: 'Operations', dept: 'Back Office' },
      { title: 'HR Policy Update', description: 'Review and update HR policies', priority: TaskPriority.MEDIUM, status: WorkflowStatus.PENDING, frequency: 'One Time', category: 'Operations', dept: 'Back Office' },
      { title: 'Interior Procurement - Material Sourcing', description: 'Source materials for interior procurement project', priority: TaskPriority.MEDIUM, status: WorkflowStatus.ESCALATED, frequency: 'One Time', category: 'Operations', dept: 'Back Office' },
      { title: 'MIS Report Generation', description: 'Generate monthly MIS reports', priority: TaskPriority.MEDIUM, status: WorkflowStatus.IN_PROGRESS, frequency: 'Monthly', monthDates: '[5]', category: 'Routine Work', dept: 'Back Office' },
      { title: 'Client Presentation - Q1 Results', description: 'Prepare Q1 results presentation for client', priority: TaskPriority.HIGH, status: WorkflowStatus.PENDING, frequency: 'One Time', category: 'One Time Work', dept: 'Sales' },
      { title: 'Daily Standup Notes', description: 'Prepare and distribute daily standup meeting notes', priority: TaskPriority.LOW, status: WorkflowStatus.PENDING, frequency: 'Daily', category: 'Routine Work', dept: 'Back Office' },
      { title: 'Monthly Account Reconciliation', description: 'Complete full monthly account reconciliation', priority: TaskPriority.HIGH, status: WorkflowStatus.IN_PROGRESS, frequency: 'Monthly', monthDates: '[28]', category: 'Reconciliation', dept: 'Accounts' },
    ]

    for (let i = 0; i < taskData.length; i++) {
      const assignee = assignees[i % assignees.length]
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (i % 7) - 2)

      await db.task.create({
        data: {
          title: taskData[i].title,
          description: taskData[i].description,
          priority: taskData[i].priority,
          status: taskData[i].status,
          ownerId: assignee.id,
          dueDate,
          department: taskData[i].dept,
          category: taskData[i].category,
          frequency: taskData[i].frequency,
          weekDays: (taskData[i] as any).weekDays || null,
          monthDates: (taskData[i] as any).monthDates || null,
          taskSteps: {
            create: i < 5 ? [
              { title: `${taskData[i].title} - Step 1`, status: WorkflowStatus.COMPLETED, order: 0, assigneeId: assignee.id },
              { title: `${taskData[i].title} - Step 2`, status: i % 3 === 0 ? WorkflowStatus.IN_PROGRESS : WorkflowStatus.COMPLETED, order: 1, assigneeId: assignee.id },
              { title: `${taskData[i].title} - Step 3`, status: i % 2 === 0 ? WorkflowStatus.PENDING : WorkflowStatus.COMPLETED, order: 2, assigneeId: assignee.id },
            ] : [],
          },
        },
      })
    }

    // Create sample leaves
    const emp1 = createdUsers.find(u => u.id === 'user-emp1')
    const emp3 = createdUsers.find(u => u.id === 'user-emp3')
    if (emp1) {
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() + 3)
      const toDate = new Date(fromDate)
      toDate.setDate(toDate.getDate() + 2)
      await db.leave.create({
        data: { userId: emp1.id, leaveType: 'CASUAL', fromDate, toDate, reason: 'Family function out of station', applicationTag: 'AL', totalDays: 3, status: 'PENDING' },
      })
    }
    if (emp3) {
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() + 1)
      const toDate = new Date(fromDate)
      toDate.setDate(toDate.getDate() + 1)
      await db.leave.create({
        data: { userId: emp3.id, leaveType: 'SICK', fromDate, toDate, reason: 'Not feeling well', applicationTag: 'LA', totalDays: 2, status: 'PENDING' },
      })
    }

    // Create notifications for admin
    const admin = createdUsers.find(u => u.id === 'user-admin')
    if (admin) {
      await db.notification.createMany({
        data: [
          { type: 'APPROVAL_REQUIRED', title: 'New approval required', message: 'Task "Monthly Sales Report" needs your review', receiverId: admin.id, senderId: admin.id },
          { type: 'ESCALATION', title: 'Task escalated', message: 'Overdue task has been escalated to director', receiverId: admin.id },
          { type: 'REMINDER', title: 'Daily reminder', message: '3 tasks due today', receiverId: admin.id },
        ],
      })
    }

    return NextResponse.json({ message: 'Seed completed', users: createdUsers.length, tasks: taskData.length })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
