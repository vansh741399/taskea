import { PrismaClient } from '@prisma/client'

// Inline constants for seed file (matching src/lib/constants.ts)
const UserRole = { ADMIN: 'ADMIN', DIRECTOR: 'DIRECTOR', EA: 'EA', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE' }
const WorkflowStatus = { DRAFT: 'DRAFT', PENDING: 'PENDING', IN_REVIEW: 'IN_REVIEW', APPROVED: 'APPROVED', REJECTED: 'REJECTED', RE_OPENED: 'RE_OPENED', IN_PROGRESS: 'IN_PROGRESS', ON_HOLD: 'ON_HOLD', ESCALATED: 'ESCALATED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', EXTERNAL_HOLD: 'EXTERNAL_HOLD' }
const StepType = { APPROVAL: 'APPROVAL', REVIEW: 'REVIEW', NOTIFICATION: 'NOTIFICATION', CONDITION: 'CONDITION', PARALLEL_SPLIT: 'PARALLEL_SPLIT', PARALLEL_JOIN: 'PARALLEL_JOIN', ESCALATION_CHECK: 'ESCALATION_CHECK' }
const TaskPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' }
const NotificationType = { APPROVAL_REQUIRED: 'APPROVAL_REQUIRED', APPROVED: 'APPROVED', REJECTED: 'REJECTED', ESCALATION: 'ESCALATION', REMINDER: 'REMINDER', STATUS_CHANGE: 'STATUS_CHANGE', COMMENT: 'COMMENT', DELEGATION: 'DELEGATION' }

const prisma = new PrismaClient()

async function main() {
  // Clean existing data
  await prisma.taskStep.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.statusHistory.deleteMany()
  await prisma.escalationLog.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.task.deleteMany()
  await prisma.stepInstance.deleteMany()
  await prisma.workflowInstance.deleteMany()
  await prisma.stepTemplate.deleteMany()
  await prisma.workflowTemplate.deleteMany()
  await prisma.project.deleteMany()
  await prisma.department.deleteMany()
  await prisma.category.deleteMany()
  await prisma.delegation.deleteMany()
  await prisma.user.deleteMany()

  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000)

  // ══ DEPARTMENTS (created without headId first, updated after users) ══
  await prisma.department.createMany({
    data: [
      { id: 'dept-sales', name: 'Sales', description: 'Sales and client acquisition' },
      { id: 'dept-backoffice', name: 'Back Office', description: 'Operations, design, coordination and support' },
      { id: 'dept-accounts', name: 'Accounts', description: 'Finance and accounting' },
      { id: 'dept-management', name: 'Management', description: 'Director-level management and strategic oversight' },
    ]
  })

  // ══ CATEGORIES ══
  await prisma.category.createMany({
    data: [
      { id: 'cat-admin', name: 'Admin', color: '#6D28D9', icon: '📁' },
      { id: 'cat-operations', name: 'Operations', color: '#1D4ED8', icon: '⚙️' },
      { id: 'cat-finance', name: 'Finance', color: '#15803D', icon: '💰' },
      { id: 'cat-hr', name: 'HR', color: '#B45309', icon: '👥' },
      { id: 'cat-marketing', name: 'Marketing', color: '#BE123C', icon: '📣' },
      { id: 'cat-it', name: 'IT & Tech', color: '#0F766E', icon: '💻' },
      { id: 'cat-design', name: 'Design', color: '#6D28D9', icon: '🎨' },
      { id: 'cat-roofing', name: 'Roofing', color: '#B45309', icon: '🏠' },
    ]
  })

  // ══ USERS — AJMER STAFF (LAXREE Organization) ══
  // Admin & Leadership
  const admin = await prisma.user.create({
    data: { id: 'user-admin', email: 'arti@laxree.com', name: 'Arti Sharma', role: UserRole.ADMIN, department: 'Back Office', designation: 'Admin & EA', phone: '9982286662', location: 'Ajmer', isActive: true, joinDate: daysAgo(400), loginUsername: 'admin', loginPassword: 'Laxree@2025' }
  })
  const director1 = await prisma.user.create({
    data: { id: 'user-dir1', email: 'sandeep@laxree.com', name: 'Sandeep', role: UserRole.DIRECTOR, department: 'Sales', designation: 'Sales Manager', phone: '9251683662', location: 'Ajmer', isActive: true, joinDate: daysAgo(730) }
  })
  const director2 = await prisma.user.create({
    data: { id: 'user-dir2', email: 'ronak@laxree.com', name: 'Ronak Jain', role: UserRole.DIRECTOR, department: 'Sales', designation: 'Sales Manager', phone: '9251683659', location: 'Ajmer', isActive: true, joinDate: daysAgo(500) }
  })
  const director3 = await prisma.user.create({
    data: { id: 'user-dir3', email: 'ashish@laxree.com', name: 'Ashish Sir', role: UserRole.DIRECTOR, department: 'Management', designation: 'Director', phone: '9251683601', location: 'Ajmer', isActive: true, joinDate: daysAgo(800), loginUsername: 'ashish', loginPassword: 'Ashish@2025' }
  })
  const director4 = await prisma.user.create({
    data: { id: 'user-dir4', email: 'samarth@laxree.com', name: 'Samarth Sir', role: UserRole.DIRECTOR, department: 'Management', designation: 'Director', phone: '9251683602', location: 'Ajmer', isActive: true, joinDate: daysAgo(750), loginUsername: 'samarth', loginPassword: 'Samarth@2025' }
  })

  // EA
  const ea1 = await prisma.user.create({
    data: { id: 'user-ea1', email: 'ea@laxree.com', name: 'Arti Sharma', role: UserRole.EA, department: 'Back Office', designation: 'EA', phone: '9982286662', location: 'Ajmer', isActive: true, joinDate: daysAgo(400), loginUsername: 'ea', loginPassword: 'EA@Laxree' }
  })

  // Managers
  const manager1 = await prisma.user.create({
    data: { id: 'user-mgr1', email: 'khushboo@laxree.com', name: 'Khushboo Manglani', role: UserRole.MANAGER, department: 'Sales', designation: 'Team Lead Roofing', phone: '9251683656', location: 'Ajmer', isActive: true, joinDate: daysAgo(300), loginUsername: 'khushboo', loginPassword: 'Khushboo@2025' }
  })
  const manager2 = await prisma.user.create({
    data: { id: 'user-mgr2', email: 'hr@laxree.com', name: 'Radhika', role: UserRole.MANAGER, department: 'Back Office', designation: 'HR', phone: '9251683663', location: 'Ajmer', isActive: true, joinDate: daysAgo(250), loginUsername: 'radhika', loginPassword: 'Radhika@2025' }
  })
  const manager3 = await prisma.user.create({
    data: { id: 'user-mgr3', email: 'tanuja@laxree.com', name: 'Tanuja Tigaya', role: UserRole.MANAGER, department: 'Back Office', designation: 'Customer Relationship Manager', phone: '9982286667', location: 'Ajmer', isActive: true, joinDate: daysAgo(200), loginUsername: 'tanuja', loginPassword: 'Tanuja@2025' }
  })

  // Employees — Ajmer Staff
  const emp1 = await prisma.user.create({
    data: { id: 'user-emp1', email: 'aditya@laxree.com', name: 'Aditya Sharma', role: UserRole.EMPLOYEE, department: 'Sales', designation: 'Sales Executive', phone: '9982281768', location: 'Ajmer', isActive: true, joinDate: daysAgo(180), loginUsername: 'aditya', loginPassword: 'Aditya@2025' }
  })
  const emp2 = await prisma.user.create({
    data: { id: 'user-emp2', email: 'aakash@laxree.com', name: 'Aakash', role: UserRole.EMPLOYEE, department: 'Sales', designation: 'Sales Executive', phone: '9982220833', location: 'Ajmer', isActive: true, joinDate: daysAgo(150), loginUsername: 'aakash', loginPassword: 'Aakash@2025' }
  })
  const emp3 = await prisma.user.create({
    data: { id: 'user-emp3', email: 'anamika@laxree.com', name: 'Anamika', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Coordinator', phone: '9982261222', location: 'Ajmer', isActive: true, joinDate: daysAgo(120), loginUsername: 'anamika', loginPassword: 'Anamika@2025' }
  })
  const emp4 = await prisma.user.create({
    data: { id: 'user-emp4', email: 'saurabh@laxree.com', name: 'Saurabh', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Designer', phone: '9351000183', location: 'Ajmer', isActive: true, joinDate: daysAgo(100), loginUsername: 'saurabh', loginPassword: 'Saurabh@2025' }
  })
  const emp5 = await prisma.user.create({
    data: { id: 'user-emp5', email: 'ruchi@laxree.com', name: 'Ruchi', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Coordinator', phone: '9251683664', location: 'Ajmer', isActive: true, joinDate: daysAgo(90), loginUsername: 'ruchi', loginPassword: 'Ruchi@2025' }
  })
  const emp6 = await prisma.user.create({
    data: { id: 'user-emp6', email: 'aayush@laxree.com', name: 'Aayush', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'Coordinator', phone: '9982286668', location: 'Ajmer', isActive: true, joinDate: daysAgo(60), loginUsername: 'aayush', loginPassword: 'Aayush@2025' }
  })
  const emp7 = await prisma.user.create({
    data: { id: 'user-emp7', email: 'kamlesh@laxree.com', name: 'Kamlesh', role: UserRole.EMPLOYEE, department: 'Back Office', designation: 'MIS', phone: '9251683660', location: 'Ajmer', isActive: true, joinDate: daysAgo(200), loginUsername: 'kamlesh', loginPassword: 'Kamlesh@2025' }
  })
  const emp8 = await prisma.user.create({
    data: { id: 'user-emp8', email: 'accounts@laxree.com', name: 'Hitesh Tak', role: UserRole.EMPLOYEE, department: 'Accounts', designation: 'Accountant', phone: '9982214555', location: 'Ajmer', isActive: true, joinDate: daysAgo(365), loginUsername: 'hitesh', loginPassword: 'Hitesh@2025' }
  })

  // ══ UPDATE DEPARTMENT HEADS ══
  await prisma.department.update({ where: { id: 'dept-sales' }, data: { headId: director1.id } })
  await prisma.department.update({ where: { id: 'dept-backoffice' }, data: { headId: director2.id } })
  await prisma.department.update({ where: { id: 'dept-accounts' }, data: { headId: emp8.id } })

  // ══ PROJECTS ══
  const proj1 = await prisma.project.create({
    data: { id: 'proj-1', name: 'Website Revamp', description: 'Redesign company website with modern UI', department: 'Sales', managerId: manager1.id, status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, startDate: daysAgo(30), endDate: daysFromNow(30) }
  })
  const proj2 = await prisma.project.create({
    data: { id: 'proj-2', name: 'Mobile Application', description: 'Build mobile app for field team', department: 'Sales', managerId: manager1.id, status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, startDate: daysAgo(10), endDate: daysFromNow(60) }
  })
  const proj3 = await prisma.project.create({
    data: { id: 'proj-3', name: 'CRM Development', description: 'Internal CRM system development', department: 'Sales', managerId: director1.id, status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, startDate: daysAgo(45), endDate: daysFromNow(45) }
  })
  const proj4 = await prisma.project.create({
    data: { id: 'proj-4', name: 'E-Commerce Platform', description: 'Online sales platform for roofing products', department: 'Sales', managerId: director2.id, status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, startDate: daysFromNow(5), endDate: daysFromNow(90) }
  })
  const proj5 = await prisma.project.create({
    data: { id: 'proj-5', name: 'Internal Operations', description: 'Streamline internal operations and processes', department: 'Back Office', managerId: manager2.id, status: WorkflowStatus.COMPLETED, priority: TaskPriority.LOW, startDate: daysAgo(60), endDate: daysAgo(5) }
  })
  const proj6 = await prisma.project.create({
    data: { id: 'proj-6', name: 'Brand Design System', description: 'Create unified design system for LAXREE brand', department: 'Back Office', managerId: manager3.id, status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, startDate: daysAgo(20), endDate: daysFromNow(40) }
  })

  // ══ WORKFLOW TEMPLATES ══
  const taskTemplate = await prisma.workflowTemplate.create({
    data: { id: 'tpl-task', name: 'Task Approval Workflow', description: 'Standard 3-stage task approval: Employee → EA → Director', category: 'Operations', isActive: true }
  })
  const poTemplate = await prisma.workflowTemplate.create({
    data: { id: 'tpl-po', name: 'Purchase Order Approval', description: 'Purchase order approval for procurement', category: 'Finance', isActive: true }
  })
  const leaveTemplate = await prisma.workflowTemplate.create({
    data: { id: 'tpl-leave', name: 'Leave Request', description: 'Employee leave request process', category: 'HR', isActive: true }
  })

  await prisma.stepTemplate.createMany({
    data: [
      { id: 'step-task-1', templateId: taskTemplate.id, name: 'Employee Task Completion', stepType: StepType.NOTIFICATION, order: 1, assigneeRole: UserRole.EMPLOYEE, approvalLevel: 1, slaHours: 72 },
      { id: 'step-task-2', templateId: taskTemplate.id, name: 'EA Review & Verification', stepType: StepType.APPROVAL, order: 2, assigneeRole: UserRole.EA, approvalLevel: 2, slaHours: 48 },
      { id: 'step-task-3', templateId: taskTemplate.id, name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, assigneeRole: UserRole.DIRECTOR, approvalLevel: 3, slaHours: 72 },
      { id: 'step-task-4', templateId: taskTemplate.id, name: 'EA Final Review & Submit', stepType: StepType.APPROVAL, order: 4, assigneeRole: UserRole.EA, approvalLevel: 2, slaHours: 24 },
    ]
  })
  await prisma.stepTemplate.createMany({
    data: [
      { id: 'step-po-1', templateId: poTemplate.id, name: 'Manager Review', stepType: StepType.APPROVAL, order: 1, assigneeRole: UserRole.MANAGER, approvalLevel: 1, slaHours: 24 },
      { id: 'step-po-2', templateId: poTemplate.id, name: 'EA Verification', stepType: StepType.REVIEW, order: 2, assigneeRole: UserRole.EA, approvalLevel: 2, slaHours: 48 },
      { id: 'step-po-3', templateId: poTemplate.id, name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, assigneeRole: UserRole.DIRECTOR, approvalLevel: 3, slaHours: 72 },
    ]
  })
  await prisma.stepTemplate.createMany({
    data: [
      { id: 'step-leave-1', templateId: leaveTemplate.id, name: 'Manager Approval', stepType: StepType.APPROVAL, order: 1, assigneeRole: UserRole.MANAGER, approvalLevel: 1, slaHours: 24 },
      { id: 'step-leave-2', templateId: leaveTemplate.id, name: 'HR Review', stepType: StepType.REVIEW, order: 2, assigneeRole: UserRole.EA, approvalLevel: 1, slaHours: 48 },
      { id: 'step-leave-3', templateId: leaveTemplate.id, name: 'Director Confirmation', stepType: StepType.APPROVAL, order: 3, assigneeRole: UserRole.DIRECTOR, approvalLevel: 1, slaHours: 72 },
    ]
  })

  // ══ WORKFLOW INSTANCES ══
  const wf1 = await prisma.workflowInstance.create({
    data: { id: 'wf-1', templateId: poTemplate.id, title: 'Server Equipment Purchase - Q1', description: 'Request to purchase 5 new server units', status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, currentStepOrder: 1, creatorId: emp1.id, dueDate: daysFromNow(7) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-1-1', workflowId: wf1.id, stepTemplateId: 'step-po-1', name: 'Manager Review', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.PENDING, assigneeId: manager1.id, startedAt: daysAgo(1), slaDeadline: daysFromNow(1) },
      { id: 'si-1-2', workflowId: wf1.id, stepTemplateId: 'step-po-2', name: 'EA Verification', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.PENDING },
      { id: 'si-1-3', workflowId: wf1.id, stepTemplateId: 'step-po-3', name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.PENDING },
    ]
  })

  const wf2 = await prisma.workflowInstance.create({
    data: { id: 'wf-2', templateId: leaveTemplate.id, title: 'Annual Leave - December', description: '5 days annual leave request', status: WorkflowStatus.IN_REVIEW, priority: TaskPriority.MEDIUM, currentStepOrder: 2, creatorId: emp2.id, dueDate: daysFromNow(5) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-2-1', workflowId: wf2.id, stepTemplateId: 'step-leave-1', name: 'Manager Approval', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.APPROVED, assigneeId: manager2.id, startedAt: daysAgo(3), completedAt: daysAgo(2) },
      { id: 'si-2-2', workflowId: wf2.id, stepTemplateId: 'step-leave-2', name: 'HR Review', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.IN_REVIEW, assigneeId: ea1.id, startedAt: daysAgo(2), slaDeadline: daysFromNow(1) },
      { id: 'si-2-3', workflowId: wf2.id, stepTemplateId: 'step-leave-3', name: 'Director Confirmation', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.PENDING, assigneeId: director1.id },
    ]
  })
  await prisma.approval.create({ data: { id: 'appr-2-1', stepInstanceId: 'si-2-1', workflowId: wf2.id, approverId: manager2.id, action: WorkflowStatus.APPROVED, comments: 'Approved', level: 1 } })

  const wf3 = await prisma.workflowInstance.create({
    data: { id: 'wf-3', templateId: poTemplate.id, title: 'Office Supplies Procurement', description: 'Monthly office supplies restock', status: WorkflowStatus.APPROVED, priority: TaskPriority.LOW, currentStepOrder: 3, creatorId: manager3.id, dueDate: daysAgo(2), createdAt: daysAgo(10) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-3-1', workflowId: wf3.id, stepTemplateId: 'step-po-1', name: 'Manager Review', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.APPROVED, assigneeId: manager3.id, startedAt: daysAgo(9), completedAt: daysAgo(8) },
      { id: 'si-3-2', workflowId: wf3.id, stepTemplateId: 'step-po-2', name: 'EA Verification', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.APPROVED, assigneeId: ea1.id, startedAt: daysAgo(8), completedAt: daysAgo(6) },
      { id: 'si-3-3', workflowId: wf3.id, stepTemplateId: 'step-po-3', name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.APPROVED, assigneeId: director1.id, startedAt: daysAgo(6), completedAt: daysAgo(3) },
    ]
  })
  await prisma.approval.createMany({
    data: [
      { id: 'appr-3-1', stepInstanceId: 'si-3-1', workflowId: wf3.id, approverId: manager3.id, action: WorkflowStatus.APPROVED, comments: 'Standard supplies', level: 1 },
      { id: 'appr-3-2', stepInstanceId: 'si-3-2', workflowId: wf3.id, approverId: ea1.id, action: WorkflowStatus.APPROVED, comments: 'Budget verified', level: 2 },
      { id: 'appr-3-3', stepInstanceId: 'si-3-3', workflowId: wf3.id, approverId: director1.id, action: WorkflowStatus.APPROVED, comments: 'Approved', level: 3 },
    ]
  })

  const wf4 = await prisma.workflowInstance.create({
    data: { id: 'wf-4', templateId: leaveTemplate.id, title: 'Sick Leave Extension', description: 'Extend sick leave by 3 days', status: WorkflowStatus.REJECTED, priority: TaskPriority.MEDIUM, currentStepOrder: 1, creatorId: emp3.id, dueDate: daysAgo(5), createdAt: daysAgo(7) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-4-1', workflowId: wf4.id, stepTemplateId: 'step-leave-1', name: 'Manager Approval', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.REJECTED, assigneeId: manager3.id, startedAt: daysAgo(7), completedAt: daysAgo(6) },
      { id: 'si-4-2', workflowId: wf4.id, stepTemplateId: 'step-leave-2', name: 'HR Review', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.PENDING },
      { id: 'si-4-3', workflowId: wf4.id, stepTemplateId: 'step-leave-3', name: 'Director Confirmation', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.PENDING },
    ]
  })
  await prisma.approval.create({ data: { id: 'appr-4-1', stepInstanceId: 'si-4-1', workflowId: wf4.id, approverId: manager3.id, action: WorkflowStatus.REJECTED, comments: 'Insufficient documentation', level: 1 } })

  const wf5 = await prisma.workflowInstance.create({
    data: { id: 'wf-5', templateId: taskTemplate.id, title: 'AI Platform Development Proposal', description: 'Internal AI-powered analytics platform', status: WorkflowStatus.ESCALATED, priority: TaskPriority.CRITICAL, currentStepOrder: 3, creatorId: manager1.id, dueDate: daysFromNow(3), createdAt: daysAgo(5) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-5-1', workflowId: wf5.id, stepTemplateId: 'step-task-1', name: 'Employee Task Completion', stepType: StepType.NOTIFICATION, order: 1, status: WorkflowStatus.APPROVED, assigneeId: emp1.id, startedAt: daysAgo(5), completedAt: daysAgo(4) },
      { id: 'si-5-2', workflowId: wf5.id, stepTemplateId: 'step-task-2', name: 'EA Review & Verification', stepType: StepType.APPROVAL, order: 2, status: WorkflowStatus.APPROVED, assigneeId: ea1.id, startedAt: daysAgo(4), completedAt: daysAgo(2) },
      { id: 'si-5-3', workflowId: wf5.id, stepTemplateId: 'step-task-3', name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.ESCALATED, assigneeId: director2.id, startedAt: daysAgo(2), isEscalated: true, slaDeadline: daysAgo(1) },
    ]
  })
  await prisma.approval.createMany({
    data: [
      { id: 'appr-5-1', stepInstanceId: 'si-5-1', workflowId: wf5.id, approverId: emp1.id, action: WorkflowStatus.APPROVED, comments: 'Task completed', level: 1 },
      { id: 'appr-5-2', stepInstanceId: 'si-5-2', workflowId: wf5.id, approverId: ea1.id, action: WorkflowStatus.APPROVED, comments: 'Budget within range', level: 2 },
    ]
  })

  const wf6 = await prisma.workflowInstance.create({
    data: { id: 'wf-6', templateId: taskTemplate.id, title: 'Customer Portal Redesign', description: 'Modern UX redesign of customer portal', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, currentStepOrder: 3, creatorId: manager2.id, dueDate: daysFromNow(14), createdAt: daysAgo(15) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-6-1', workflowId: wf6.id, stepTemplateId: 'step-task-1', name: 'Employee Task Completion', stepType: StepType.NOTIFICATION, order: 1, status: WorkflowStatus.APPROVED, assigneeId: emp3.id, startedAt: daysAgo(15), completedAt: daysAgo(13) },
      { id: 'si-6-2', workflowId: wf6.id, stepTemplateId: 'step-task-2', name: 'EA Review & Verification', stepType: StepType.APPROVAL, order: 2, status: WorkflowStatus.APPROVED, assigneeId: ea1.id, startedAt: daysAgo(13), completedAt: daysAgo(10) },
      { id: 'si-6-3', workflowId: wf6.id, stepTemplateId: 'step-task-3', name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.APPROVED, assigneeId: director1.id, startedAt: daysAgo(10), completedAt: daysAgo(7) },
    ]
  })
  await prisma.approval.createMany({
    data: [
      { id: 'appr-6-1', stepInstanceId: 'si-6-1', workflowId: wf6.id, approverId: emp3.id, action: WorkflowStatus.APPROVED, comments: 'Design done', level: 1 },
      { id: 'appr-6-2', stepInstanceId: 'si-6-2', workflowId: wf6.id, approverId: ea1.id, action: WorkflowStatus.APPROVED, comments: 'Budget allocated', level: 2 },
      { id: 'appr-6-3', stepInstanceId: 'si-6-3', workflowId: wf6.id, approverId: director1.id, action: WorkflowStatus.APPROVED, comments: 'Strategic alignment confirmed', level: 3 },
    ]
  })

  const wf7 = await prisma.workflowInstance.create({
    data: { id: 'wf-7', templateId: poTemplate.id, title: 'Cloud Infrastructure Upgrade', description: 'Upgrade hosting plan to Enterprise tier', status: WorkflowStatus.ON_HOLD, priority: TaskPriority.HIGH, currentStepOrder: 2, creatorId: manager1.id, dueDate: daysFromNow(10), createdAt: daysAgo(4) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-7-1', workflowId: wf7.id, stepTemplateId: 'step-po-1', name: 'Manager Review', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.APPROVED, assigneeId: manager1.id, startedAt: daysAgo(4), completedAt: daysAgo(3) },
      { id: 'si-7-2', workflowId: wf7.id, stepTemplateId: 'step-po-2', name: 'EA Verification', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.ON_HOLD, assigneeId: ea1.id, startedAt: daysAgo(3), slaDeadline: daysFromNow(2) },
      { id: 'si-7-3', workflowId: wf7.id, stepTemplateId: 'step-po-3', name: 'Director Approval', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.PENDING },
    ]
  })
  await prisma.approval.create({ data: { id: 'appr-7-1', stepInstanceId: 'si-7-1', workflowId: wf7.id, approverId: manager1.id, action: WorkflowStatus.APPROVED, comments: 'Approved, critical for Q2', level: 1 } })

  const wf8 = await prisma.workflowInstance.create({
    data: { id: 'wf-8', templateId: leaveTemplate.id, title: 'Team Building Day Off', description: '1 day off for team building', status: WorkflowStatus.COMPLETED, priority: TaskPriority.LOW, currentStepOrder: 3, creatorId: emp1.id, dueDate: daysAgo(3), createdAt: daysAgo(12) }
  })
  await prisma.stepInstance.createMany({
    data: [
      { id: 'si-8-1', workflowId: wf8.id, stepTemplateId: 'step-leave-1', name: 'Manager Approval', stepType: StepType.APPROVAL, order: 1, status: WorkflowStatus.APPROVED, assigneeId: manager1.id, startedAt: daysAgo(12), completedAt: daysAgo(11) },
      { id: 'si-8-2', workflowId: wf8.id, stepTemplateId: 'step-leave-2', name: 'HR Review', stepType: StepType.REVIEW, order: 2, status: WorkflowStatus.APPROVED, assigneeId: ea1.id, startedAt: daysAgo(11), completedAt: daysAgo(9) },
      { id: 'si-8-3', workflowId: wf8.id, stepTemplateId: 'step-leave-3', name: 'Director Confirmation', stepType: StepType.APPROVAL, order: 3, status: WorkflowStatus.APPROVED, assigneeId: director1.id, startedAt: daysAgo(9), completedAt: daysAgo(7) },
    ]
  })
  await prisma.approval.createMany({
    data: [
      { id: 'appr-8-1', stepInstanceId: 'si-8-1', workflowId: wf8.id, approverId: manager1.id, action: WorkflowStatus.APPROVED, comments: 'Enjoy!', level: 1 },
      { id: 'appr-8-2', stepInstanceId: 'si-8-2', workflowId: wf8.id, approverId: ea1.id, action: WorkflowStatus.APPROVED, comments: 'HR records updated', level: 1 },
      { id: 'appr-8-3', stepInstanceId: 'si-8-3', workflowId: wf8.id, approverId: director1.id, action: WorkflowStatus.APPROVED, comments: 'Confirmed', level: 1 },
    ]
  })

  // ══ STATUS HISTORY ══
  await prisma.statusHistory.createMany({
    data: [
      { id: 'sh-1', workflowId: wf1.id, fromStatus: WorkflowStatus.DRAFT, toStatus: WorkflowStatus.PENDING, changedBy: emp1.id, reason: 'Submitted for approval', createdAt: daysAgo(1) },
      { id: 'sh-2', workflowId: wf2.id, fromStatus: WorkflowStatus.PENDING, toStatus: WorkflowStatus.IN_REVIEW, changedBy: manager2.id, reason: 'Manager approved', createdAt: daysAgo(2) },
      { id: 'sh-3', workflowId: wf3.id, fromStatus: WorkflowStatus.PENDING, toStatus: WorkflowStatus.IN_REVIEW, changedBy: manager3.id, reason: 'Manager approved', createdAt: daysAgo(8) },
      { id: 'sh-4', workflowId: wf3.id, fromStatus: WorkflowStatus.IN_REVIEW, toStatus: WorkflowStatus.APPROVED, changedBy: director1.id, reason: 'All approvals complete', createdAt: daysAgo(3) },
      { id: 'sh-5', workflowId: wf4.id, fromStatus: WorkflowStatus.PENDING, toStatus: WorkflowStatus.REJECTED, changedBy: manager3.id, reason: 'Insufficient documentation', createdAt: daysAgo(6) },
      { id: 'sh-6', workflowId: wf5.id, fromStatus: WorkflowStatus.PENDING, toStatus: WorkflowStatus.IN_REVIEW, changedBy: ea1.id, reason: 'EA review passed', createdAt: daysAgo(4) },
      { id: 'sh-7', workflowId: wf5.id, fromStatus: WorkflowStatus.IN_REVIEW, toStatus: WorkflowStatus.ESCALATED, changedBy: director2.id, reason: 'SLA breached, escalating', createdAt: daysAgo(1) },
      { id: 'sh-8', workflowId: wf6.id, fromStatus: WorkflowStatus.APPROVED, toStatus: WorkflowStatus.IN_PROGRESS, changedBy: admin.id, reason: 'Project kickoff initiated', createdAt: daysAgo(3) },
      { id: 'sh-9', workflowId: wf7.id, fromStatus: WorkflowStatus.PENDING, toStatus: WorkflowStatus.ON_HOLD, changedBy: ea1.id, reason: 'Awaiting budget confirmation', createdAt: daysAgo(2) },
      { id: 'sh-10', workflowId: wf8.id, fromStatus: WorkflowStatus.APPROVED, toStatus: WorkflowStatus.COMPLETED, changedBy: director1.id, reason: 'Leave completed', createdAt: daysAgo(5) },
    ]
  })

  // ══ ESCALATION LOGS ══
  await prisma.escalationLog.createMany({
    data: [
      { id: 'esc-1', workflowId: wf5.id, fromStepOrder: 3, toStepOrder: 4, fromAssigneeId: director2.id, toAssigneeId: director1.id, reason: 'SLA deadline exceeded for Director Approval', slaBreached: true, createdAt: daysAgo(1) },
    ]
  })

  // ══ TASKS with project assignments ══
  const tasks = [
    // Sales department tasks
    { id: 'task-1', title: 'Client Pitch Deck Preparation', description: 'Prepare Q1 pitch deck for enterprise clients', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: emp1.id, department: 'Sales', category: 'Marketing', dueDate: daysFromNow(0), projectId: proj1.id },
    { id: 'task-2', title: 'Monthly Sales Report', description: 'Compile monthly sales figures and KPIs', status: WorkflowStatus.PENDING, priority: TaskPriority.MEDIUM, ownerId: emp2.id, department: 'Sales', category: 'Finance', dueDate: daysFromNow(2), projectId: proj3.id },
    { id: 'task-3', title: 'CRM Data Cleanup', description: 'Clean and update CRM records for Q1', status: WorkflowStatus.COMPLETED, priority: TaskPriority.LOW, ownerId: emp1.id, department: 'Sales', category: 'Admin', dueDate: daysAgo(3), completedAt: daysAgo(3), projectId: proj3.id },
    { id: 'task-4', title: 'New Client Onboarding - Acme Corp', description: 'Complete onboarding process for new client', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: emp2.id, department: 'Sales', category: 'Operations', dueDate: daysFromNow(1), projectId: proj1.id },
    { id: 'task-5', title: 'Quarterly Target Review', description: 'Review and adjust quarterly sales targets', status: WorkflowStatus.COMPLETED, priority: TaskPriority.MEDIUM, ownerId: manager1.id, department: 'Sales', category: 'Finance', dueDate: daysAgo(5), completedAt: daysAgo(5), projectId: proj3.id },

    // Back Office tasks
    { id: 'task-6', title: 'Office Supply Inventory Check', description: 'Monthly inventory verification', status: WorkflowStatus.PENDING, priority: TaskPriority.LOW, ownerId: emp3.id, department: 'Back Office', category: 'Admin', dueDate: daysFromNow(5) },
    { id: 'task-7', title: 'Vendor Contract Renewal', description: 'Renew annual vendor contracts', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: emp5.id, department: 'Back Office', category: 'Operations', dueDate: daysFromNow(0), projectId: proj5.id },
    { id: 'task-8', title: 'Facility Maintenance Schedule', description: 'Schedule Q2 facility maintenance', status: WorkflowStatus.COMPLETED, priority: TaskPriority.MEDIUM, ownerId: emp3.id, department: 'Back Office', category: 'Operations', dueDate: daysAgo(2), completedAt: daysAgo(2), projectId: proj5.id },
    { id: 'task-9', title: 'Security Audit Planning', description: 'Plan and schedule annual security audit', status: WorkflowStatus.PENDING, priority: TaskPriority.CRITICAL, ownerId: emp5.id, department: 'Back Office', category: 'IT & Tech', dueDate: daysFromNow(3) },
    { id: 'task-10', title: 'Employee ID Card Printing', description: 'Print new employee ID cards', status: WorkflowStatus.COMPLETED, priority: TaskPriority.LOW, ownerId: emp3.id, department: 'Back Office', category: 'HR', dueDate: daysAgo(7), completedAt: daysAgo(7) },
    { id: 'task-21', title: 'Brand Guidelines Document', description: 'Create comprehensive brand guidelines PDF', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: emp4.id, department: 'Back Office', category: 'Design', dueDate: daysFromNow(4), projectId: proj6.id },
    { id: 'task-22', title: 'Social Media Templates', description: 'Design social media post templates', status: WorkflowStatus.PENDING, priority: TaskPriority.MEDIUM, ownerId: emp4.id, department: 'Back Office', category: 'Design', dueDate: daysFromNow(8), projectId: proj6.id },

    // Accounts tasks
    { id: 'task-11', title: 'Quarterly Tax Filing', description: 'Prepare and file Q4 tax returns', status: WorkflowStatus.PENDING, priority: TaskPriority.CRITICAL, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysAgo(1) },
    { id: 'task-12', title: 'Payroll Processing - December', description: 'Process December payroll for all employees', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysFromNow(0) },
    { id: 'task-13', title: 'Budget Allocation Q2', description: 'Prepare Q2 budget allocation plan', status: WorkflowStatus.COMPLETED, priority: TaskPriority.HIGH, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysAgo(4), completedAt: daysAgo(4) },
    { id: 'task-14', title: 'Invoice Reconciliation', description: 'Reconcile November invoices', status: WorkflowStatus.PENDING, priority: TaskPriority.MEDIUM, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysFromNow(4) },
    { id: 'task-15', title: 'Annual Financial Report', description: 'Compile annual financial statements', status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysFromNow(7) },
    { id: 'task-16', title: 'Expense Report Review', description: 'Review and approve team expense reports', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysFromNow(2) },
    { id: 'task-17', title: 'Vendor Payment Processing', description: 'Process outstanding vendor payments', status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysFromNow(0) },
    { id: 'task-18', title: 'Audit Preparation Documents', description: 'Prepare documents for external audit', status: WorkflowStatus.COMPLETED, priority: TaskPriority.MEDIUM, ownerId: emp8.id, department: 'Accounts', category: 'Finance', dueDate: daysAgo(6), completedAt: daysAgo(6) },
    { id: 'task-19', title: 'Client Proposal - TechCorp', description: 'Draft proposal for TechCorp partnership', status: WorkflowStatus.PENDING, priority: TaskPriority.HIGH, ownerId: manager1.id, department: 'Sales', category: 'Marketing', dueDate: daysFromNow(6), projectId: proj4.id },
    { id: 'task-20', title: 'IT System Migration Plan', description: 'Plan migration to new cloud infrastructure', status: WorkflowStatus.EXTERNAL_HOLD, priority: TaskPriority.HIGH, ownerId: emp5.id, department: 'Back Office', category: 'IT & Tech', dueDate: daysFromNow(10) },
    { id: 'task-23', title: 'Roofing Catalog Update', description: 'Update product catalog with new roofing items', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, ownerId: manager1.id, department: 'Sales', category: 'Roofing', dueDate: daysFromNow(3), projectId: proj2.id },
    { id: 'task-24', title: 'MIS Report Generation', description: 'Generate monthly MIS reports', status: WorkflowStatus.PENDING, priority: TaskPriority.MEDIUM, ownerId: emp7.id, department: 'Back Office', category: 'Operations', dueDate: daysFromNow(1) },
    { id: 'task-25', title: 'Customer Feedback Analysis', description: 'Analyze customer feedback data from Q4', status: WorkflowStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: manager3.id, department: 'Back Office', category: 'Operations', dueDate: daysFromNow(5) },
  ]

  for (const t of tasks) {
    await prisma.task.create({ data: t })
  }

  // ══ TASK STEPS ══
  const taskStepsData = [
    { taskId: 'task-1', steps: ['Research client requirements', 'Draft pitch content', 'Design slides', 'Internal review', 'Final delivery'] },
    { taskId: 'task-4', steps: ['Send welcome package', 'Setup accounts', 'Initial meeting', 'Document collection', 'System access setup'] },
    { taskId: 'task-7', steps: ['Review current contracts', 'Negotiate terms', 'Legal review', 'Sign renewed contracts'] },
    { taskId: 'task-9', steps: ['Define audit scope', 'Select audit firm', 'Schedule dates', 'Prepare documentation'] },
    { taskId: 'task-12', steps: ['Collect timesheets', 'Verify deductions', 'Calculate payouts', 'Process payments', 'Distribute payslips'] },
    { taskId: 'task-15', steps: ['Gather department data', 'Compile income statement', 'Prepare balance sheet', 'Management review', 'Board presentation'] },
    { taskId: 'task-20', steps: ['Assess current systems', 'Vendor evaluation', 'Migration planning', 'Testing phase', 'Go-live'] },
    { taskId: 'task-21', steps: ['Audit existing brand', 'Draft guidelines', 'Design templates', 'Internal review', 'Final document'] },
  ]

  for (const ts of taskStepsData) {
    for (let i = 0; i < ts.steps.length; i++) {
      const task = await prisma.task.findUnique({ where: { id: ts.taskId } })
      const stepStatus = task?.status === WorkflowStatus.COMPLETED
        ? WorkflowStatus.COMPLETED
        : i === 0 && (task?.status === WorkflowStatus.IN_PROGRESS || task?.status === WorkflowStatus.EXTERNAL_HOLD)
          ? WorkflowStatus.IN_PROGRESS
          : i === 0 && task?.status === WorkflowStatus.PENDING
            ? WorkflowStatus.PENDING
            : WorkflowStatus.PENDING

      await prisma.taskStep.create({
        data: {
          taskId: ts.taskId,
          title: ts.steps[i],
          status: stepStatus,
          order: i + 1,
          assigneeId: task?.ownerId || emp1.id,
          dueDate: task?.dueDate ? new Date(task.dueDate.getTime() + i * 24 * 60 * 60 * 1000) : null,
          completedAt: stepStatus === WorkflowStatus.COMPLETED ? daysAgo(2) : null,
        }
      })
    }
  }

  // ══ TASK DEPENDENCIES ══
  await prisma.taskDependency.createMany({
    data: [
      { id: 'td-1', taskId: 'task-4', dependsOnTaskId: 'task-1', dependencyType: 'FINISH_TO_START' },
      { id: 'td-2', taskId: 'task-14', dependsOnTaskId: 'task-13', dependencyType: 'FINISH_TO_START' },
    ]
  })

  // ══ NOTIFICATIONS ══
  await prisma.notification.createMany({
    data: [
      { id: 'notif-1', type: NotificationType.APPROVAL_REQUIRED, title: 'Approval Required: Server Equipment Purchase', message: 'A new purchase order requires your review.', senderId: emp1.id, receiverId: manager1.id, workflowId: wf1.id, isRead: false, createdAt: daysAgo(1) },
      { id: 'notif-2', type: NotificationType.APPROVED, title: 'Leave Request Approved', message: 'Your leave request has been approved by your manager.', senderId: manager2.id, receiverId: emp2.id, workflowId: wf2.id, isRead: true, readAt: daysAgo(2), createdAt: daysAgo(2) },
      { id: 'notif-3', type: NotificationType.ESCALATION, title: 'ESCALATED: AI Platform Proposal', message: 'This workflow has been escalated due to SLA breach.', senderId: director2.id, receiverId: director1.id, workflowId: wf5.id, isRead: false, createdAt: daysAgo(1) },
      { id: 'notif-4', type: NotificationType.STATUS_CHANGE, title: 'Workflow On Hold', message: 'Cloud Infrastructure Upgrade has been put on hold.', senderId: ea1.id, receiverId: manager1.id, workflowId: wf7.id, isRead: false, createdAt: daysAgo(2) },
      { id: 'notif-5', type: NotificationType.REJECTED, title: 'Leave Request Rejected', message: 'Sick leave extension rejected. Please provide documentation.', senderId: manager3.id, receiverId: emp3.id, workflowId: wf4.id, isRead: true, readAt: daysAgo(5), createdAt: daysAgo(6) },
      { id: 'notif-6', type: NotificationType.APPROVAL_REQUIRED, title: 'HR Review Required', message: 'A leave request is awaiting your HR review.', senderId: manager2.id, receiverId: ea1.id, workflowId: wf2.id, isRead: false, createdAt: daysAgo(2) },
      { id: 'notif-7', type: NotificationType.REMINDER, title: 'SLA Reminder: Server Equipment Purchase', message: 'This approval is approaching its SLA deadline.', senderId: admin.id, receiverId: manager1.id, workflowId: wf1.id, isRead: false, createdAt: daysAgo(0.5) },
      { id: 'notif-8', type: NotificationType.COMMENT, title: 'New Comment on AI Platform Proposal', message: 'Ronak Jain commented: "Need more detailed cost analysis."', senderId: director2.id, receiverId: manager1.id, workflowId: wf5.id, isRead: false, createdAt: daysAgo(0.5) },
      { id: 'notif-9', type: NotificationType.STATUS_CHANGE, title: 'Project Approved', message: 'Customer Portal Redesign is now in progress.', senderId: admin.id, receiverId: manager2.id, workflowId: wf6.id, isRead: true, readAt: daysAgo(3), createdAt: daysAgo(3) },
      { id: 'notif-10', type: NotificationType.DELEGATION, title: 'Approval Delegated', message: 'Arti Sharma has delegated approval authority to you.', senderId: ea1.id, receiverId: manager2.id, isRead: false, createdAt: daysAgo(1) },
      { id: 'notif-11', type: NotificationType.APPROVAL_REQUIRED, title: 'Task Awaiting Approval', message: 'Client Pitch Deck Preparation is ready for EA review.', senderId: emp1.id, receiverId: ea1.id, isRead: false, createdAt: daysAgo(0.2) },
      { id: 'notif-12', type: NotificationType.REMINDER, title: 'Overdue Task Alert', message: 'Quarterly Tax Filing is overdue. Please take action.', senderId: admin.id, receiverId: admin.id, isRead: false, createdAt: daysAgo(0.1) },
    ]
  })

  // ══ COMMENTS ══
  await prisma.comment.createMany({
    data: [
      { id: 'comment-1', workflowId: wf5.id, authorId: director2.id, content: 'This proposal needs more detailed cost-benefit analysis.', createdAt: daysAgo(2) },
      { id: 'comment-2', workflowId: wf5.id, authorId: manager1.id, content: 'Updated with ROI projections. Please review.', createdAt: daysAgo(1.5) },
      { id: 'comment-3', workflowId: wf7.id, authorId: ea1.id, content: 'On hold until CFO confirms budget allocation.', createdAt: daysAgo(2) },
      { id: 'comment-4', workflowId: wf1.id, authorId: emp1.id, content: 'Need these servers urgently for Q2 release.', createdAt: daysAgo(1) },
    ]
  })

  // ══ DELEGATIONS ══
  await prisma.delegation.create({
    data: { id: 'deleg-1', fromUserId: ea1.id, toUserId: manager2.id, startDate: daysAgo(2), endDate: daysFromNow(5), isActive: true, reason: 'Traveling for conference' }
  })

  console.log('LAXREE Organization seed data created successfully with Ajmer Staff!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
