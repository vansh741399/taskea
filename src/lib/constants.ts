// Workflow Status enum values (for SQLite compatibility)
export const WorkflowStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RE_OPENED: 'RE_OPENED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  ESCALATED: 'ESCALATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXTERNAL_HOLD: 'EXTERNAL_HOLD',
} as const

export type WorkflowStatusType = typeof WorkflowStatus[keyof typeof WorkflowStatus]

// Task Priority enum values
export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const

export type TaskPriorityType = typeof TaskPriority[keyof typeof TaskPriority]

// User Role enum values
export const UserRole = {
  ADMIN: 'ADMIN',
  DIRECTOR: 'DIRECTOR',
  EA: 'EA',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
} as const

export type UserRoleType = typeof UserRole[keyof typeof UserRole]

// Leave Status enum values
export const LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const

export type LeaveStatusType = typeof LeaveStatus[keyof typeof LeaveStatus]

// Leave Type enum values
export const LeaveType = {
  CASUAL: 'CASUAL',
  SICK: 'SICK',
  EARNED: 'EARNED',
  HALF_DAY: 'HALF_DAY',
} as const

export type LeaveTypeType = typeof LeaveType[keyof typeof LeaveType]

// Notification Type enum values
export const NotificationType = {
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATION: 'ESCALATION',
  REMINDER: 'REMINDER',
  STATUS_CHANGE: 'STATUS_CHANGE',
  COMMENT: 'COMMENT',
  DELEGATION: 'DELEGATION',
} as const

// Step Type enum values
export const StepType = {
  APPROVAL: 'APPROVAL',
  REVIEW: 'REVIEW',
  NOTIFICATION: 'NOTIFICATION',
  CONDITION: 'CONDITION',
  PARALLEL_SPLIT: 'PARALLEL_SPLIT',
  PARALLEL_JOIN: 'PARALLEL_JOIN',
  ESCALATION_CHECK: 'ESCALATION_CHECK',
} as const
