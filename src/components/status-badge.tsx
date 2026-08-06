'use client'

import { Badge } from '@/components/ui/badge'
import { WorkflowStatus, WorkflowStatusType } from '@/lib/constants'

const statusConfig: Record<WorkflowStatusType, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  DRAFT: { label: 'Draft', variant: 'outline', className: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-100' },
  PENDING: { label: 'Pending', variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100' },
  IN_REVIEW: { label: 'In Review', variant: 'outline', className: 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-100' },
  APPROVED: { label: 'Approved', variant: 'outline', className: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100' },
  REJECTED: { label: 'Rejected', variant: 'outline', className: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-100' },
  RE_OPENED: { label: 'Re-Opened', variant: 'outline', className: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100' },
  IN_PROGRESS: { label: 'In Progress', variant: 'outline', className: 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-100' },
  ON_HOLD: { label: 'On Hold', variant: 'outline', className: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-100' },
  ESCALATED: { label: 'Escalated', variant: 'outline', className: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100' },
  COMPLETED: { label: 'Completed', variant: 'outline', className: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100' },
  CANCELLED: { label: 'Cancelled', variant: 'outline', className: 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-100' },
  EXTERNAL_HOLD: { label: 'External Hold', variant: 'outline', className: 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-100' },
}

interface StatusBadgeProps {
  status: WorkflowStatusType
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.DRAFT
  return (
    <Badge variant={config.variant} className={`${config.className} ${className} text-xs font-medium`}>
      {config.label}
    </Badge>
  )
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  MEDIUM: { label: 'Medium', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  HIGH: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-300' },
  CRITICAL: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-300' },
}

interface PriorityBadgeProps {
  priority: string
  className?: string
}

export function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.MEDIUM
  return (
    <Badge variant="outline" className={`${config.className} ${className} text-xs font-medium`}>
      {config.label}
    </Badge>
  )
}
