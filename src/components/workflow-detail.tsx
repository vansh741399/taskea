'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import { StepProgress } from '@/components/step-progress'
import { useWorkflowStore } from '@/stores/workflow-store'
import {
  X,
  Clock,
  MessageSquare,
  Send,
  History,
  AlertTriangle,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { WorkflowStatus, WorkflowStatusType } from '@/lib/constants'

interface WorkflowDetailProps {
  workflowId: string
  onClose: () => void
}

interface WorkflowDetailData {
  id: string
  title: string
  description: string | null
  status: WorkflowStatusType
  priority: string
  currentStepOrder: number
  dueDate: string | null
  createdAt: string
  template: { id: string; name: string; category: string; description: string | null }
  creator: { id: string; name: string; email: string; role: string }
  steps: {
    id: string
    name: string
    order: number
    status: WorkflowStatusType
    stepType: string
    isEscalated: boolean
    startedAt: string | null
    completedAt: string | null
    slaDeadline: string | null
    remarks: string | null
    assignee: { id: string; name: string; email: string; role: string } | null
    approvals: {
      id: string
      action: WorkflowStatusType
      comments: string | null
      level: number
      isDelegated: boolean
      createdAt: string
      approver: { id: string; name: string; role: string }
    }[]
  }[]
  approvals: {
    id: string
    action: WorkflowStatusType
    comments: string | null
    level: number
    isDelegated: boolean
    createdAt: string
    approver: { id: string; name: string; role: string }
  }[]
  statusHistory: {
    id: string
    fromStatus: WorkflowStatusType
    toStatus: WorkflowStatusType
    changedBy: string | null
    reason: string | null
    createdAt: string
  }[]
  escalationLogs: {
    id: string
    fromStepOrder: number
    toStepOrder: number
    reason: string
    slaBreached: boolean
    createdAt: string
  }[]
  comments: {
    id: string
    content: string
    createdAt: string
    author: { id: string; name: string; role: string }
  }[]
}

export function WorkflowDetail({ workflowId, onClose }: WorkflowDetailProps) {
  const { currentUserId } = useWorkflowStore()
  const [commentText, setCommentText] = useState('')
  const queryClient = useQueryClient()

  const { data: workflow, isLoading } = useQuery<WorkflowDetailData>({
    queryKey: ['workflow-detail', workflowId],
    queryFn: () => fetch(`/api/workflows/${workflowId}`).then((r) => r.json()),
    enabled: !!workflowId,
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          authorId: currentUserId,
          content,
        }),
      }),
    onSuccess: () => {
      setCommentText('')
      queryClient.invalidateQueries({ queryKey: ['workflow-detail', workflowId] })
    },
  })

  const escalationMutation = useMutation({
    mutationFn: (reason: string) =>
      fetch('/api/escalations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          reason,
          escalatedBy: currentUserId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-detail', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Sheet open={true} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        <SheetHeader className="p-4 sm:p-6 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <SheetTitle className="text-lg font-semibold">{workflow?.title}</SheetTitle>
              {workflow && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <StatusBadge status={workflow.status} />
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">{workflow.template.name}</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : workflow ? (
          <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="p-4 sm:p-6 space-y-6">
              {/* Description */}
              {workflow.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                  <p className="text-sm text-gray-700">{workflow.description}</p>
                </div>
              )}

              {/* Info Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Creator</p>
                  <p className="text-sm font-medium text-gray-900">{workflow.creator.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Created</p>
                  <p className="text-sm text-gray-700">
                    {format(new Date(workflow.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Due Date</p>
                  <p className={`text-sm ${workflow.dueDate && new Date(workflow.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                    {workflow.dueDate ? format(new Date(workflow.dueDate), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Category</p>
                  <p className="text-sm text-gray-700">{workflow.template.category}</p>
                </div>
              </div>

              <Separator />

              {/* Step Progress */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Workflow Progress</h3>
                <StepProgress steps={workflow.steps} />
              </div>

              <Separator />

              {/* Step Details */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step Details</h3>
                <div className="space-y-2">
                  {workflow.steps.map((step) => (
                    <div
                      key={step.id}
                      className={`p-3 rounded-lg border ${
                        step.isEscalated ? 'border-rose-200 bg-rose-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-400">
                            Step {step.order}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{step.name}</span>
                          {step.isEscalated && (
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                          )}
                        </div>
                        <StatusBadge status={step.status} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                        {step.assignee && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {step.assignee.name}
                          </span>
                        )}
                        {step.slaDeadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            SLA: {format(new Date(step.slaDeadline), 'MMM d, HH:mm')}
                          </span>
                        )}
                      </div>
                      {step.approvals.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-emerald-200">
                          {step.approvals.map((appr) => (
                            <div key={appr.id} className="text-xs text-gray-500">
                              <span className="font-medium">{appr.approver.name}</span>
                              {' → '}
                              <StatusBadge status={appr.action} />
                              {appr.comments && <span className="ml-1">: {appr.comments}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Status History */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Status History
                </h3>
                <div className="space-y-2">
                  {workflow.statusHistory.map((sh) => (
                    <div key={sh.id} className="flex items-center gap-2 text-xs">
                      <StatusBadge status={sh.fromStatus} />
                      <span className="text-gray-400">→</span>
                      <StatusBadge status={sh.toStatus} />
                      {sh.reason && <span className="text-gray-500 flex-1 truncate">: {sh.reason}</span>}
                      <span className="text-gray-300 whitespace-nowrap">
                        {formatDistanceToNow(new Date(sh.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Escalation Logs */}
              {workflow.escalationLogs.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium text-rose-700 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Escalation Logs
                    </h3>
                    <div className="space-y-2">
                      {workflow.escalationLogs.map((esc) => (
                        <div key={esc.id} className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                          <p className="text-sm text-rose-800">{esc.reason}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-rose-600">
                            <span>Step {esc.fromStepOrder} → Step {esc.toStepOrder}</span>
                            {esc.slaBreached && (
                              <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                SLA Breached
                              </Badge>
                            )}
                            <span className="ml-auto">
                              {formatDistanceToNow(new Date(esc.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Comments */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comments ({workflow.comments.length})
                </h3>
                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {workflow.comments.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                  ) : (
                    workflow.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <Avatar className="h-7 w-7 mt-0.5">
                          <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700">
                            {getInitials(comment.author.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-900">
                              {comment.author.name}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-0.5">{comment.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add comment */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[60px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                        e.preventDefault()
                        commentMutation.mutate(commentText.trim())
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                    disabled={!commentText.trim() || commentMutation.isPending}
                    onClick={() => commentText.trim() && commentMutation.mutate(commentText.trim())}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Escalate button */}
              {workflow.status !== WorkflowStatus.COMPLETED &&
                workflow.status !== WorkflowStatus.CANCELLED &&
                workflow.status !== WorkflowStatus.ESCALATED && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full border-rose-300 text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      const reason = prompt('Enter reason for escalation:')
                      if (reason) escalationMutation.mutate(reason)
                    }}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Escalate Workflow
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
