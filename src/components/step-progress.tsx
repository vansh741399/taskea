'use client'

import { CheckCircle2, Circle, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { WorkflowStatus, WorkflowStatusType } from '@/lib/constants'

interface Step {
  id: string
  name: string
  order: number
  status: WorkflowStatusType
  isEscalated?: boolean
  assignee?: { name: string } | null
}

interface StepProgressProps {
  steps: Step[]
}

function getStepIcon(status: WorkflowStatusType, isEscalated?: boolean) {
  if (isEscalated) return <AlertTriangle className="h-5 w-5 text-rose-500" />
  switch (status) {
    case WorkflowStatus.APPROVED:
    case WorkflowStatus.COMPLETED:
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    case WorkflowStatus.PENDING:
      return <Circle className="h-5 w-5 text-slate-300" />
    case WorkflowStatus.IN_REVIEW:
    case WorkflowStatus.IN_PROGRESS:
      return <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />
    case WorkflowStatus.REJECTED:
      return <AlertTriangle className="h-5 w-5 text-red-500" />
    case WorkflowStatus.ON_HOLD:
    case WorkflowStatus.EXTERNAL_HOLD:
      return <Clock className="h-5 w-5 text-purple-500" />
    case WorkflowStatus.ESCALATED:
      return <AlertTriangle className="h-5 w-5 text-rose-500" />
    default:
      return <Circle className="h-5 w-5 text-slate-300" />
  }
}

function getStepColor(status: WorkflowStatusType, isEscalated?: boolean) {
  if (isEscalated) return 'border-rose-400 bg-rose-50'
  switch (status) {
    case WorkflowStatus.APPROVED:
    case WorkflowStatus.COMPLETED:
      return 'border-emerald-400 bg-emerald-50'
    case WorkflowStatus.PENDING:
      return 'border-slate-200 bg-slate-50'
    case WorkflowStatus.IN_REVIEW:
    case WorkflowStatus.IN_PROGRESS:
      return 'border-cyan-400 bg-cyan-50'
    case WorkflowStatus.REJECTED:
      return 'border-red-400 bg-red-50'
    case WorkflowStatus.ON_HOLD:
    case WorkflowStatus.EXTERNAL_HOLD:
      return 'border-purple-400 bg-purple-50'
    case WorkflowStatus.ESCALATED:
      return 'border-rose-400 bg-rose-50'
    default:
      return 'border-slate-200 bg-slate-50'
  }
}

function getConnectorColor(status: WorkflowStatusType) {
  switch (status) {
    case WorkflowStatus.APPROVED:
    case WorkflowStatus.COMPLETED:
      return 'bg-emerald-400'
    default:
      return 'bg-slate-200'
  }
}

export function StepProgress({ steps }: StepProgressProps) {
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-max pb-2">
        {sortedSteps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1 min-w-[120px]">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${getStepColor(step.status, step.isEscalated)}`}>
                {getStepIcon(step.status, step.isEscalated)}
              </div>
              <span className="text-xs font-medium text-center text-gray-700 max-w-[120px] truncate">
                {step.name}
              </span>
              {step.assignee && (
                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                  {step.assignee.name}
                </span>
              )}
            </div>
            {index < sortedSteps.length - 1 && (
              <div className={`h-0.5 w-12 mx-1 ${getConnectorColor(step.status)}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
