'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow-store'

interface ApprovalActionDialogProps {
  stepInstanceId: string
  workflowId: string
  workflowTitle: string
  stepName: string
  onClose: () => void
  onSuccess: () => void
}

export function ApprovalActionDialog({
  stepInstanceId,
  workflowId,
  workflowTitle,
  stepName,
  onClose,
  onSuccess,
}: ApprovalActionDialogProps) {
  const { currentUserId } = useWorkflowStore()
  const [action, setAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [comments, setComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepInstanceId,
          workflowId,
          approverId: currentUserId,
          action,
          comments: comments.trim() || null,
        }),
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to submit approval')
      }
    } catch (error) {
      console.error('Approval error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            {action === 'APPROVED' ? 'Approve' : 'Reject'} Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm font-medium text-gray-900">{workflowTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5">Step: {stepName}</p>
          </div>

          <div className="space-y-2">
            <Label>Action</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={action === 'APPROVED' ? 'default' : 'outline'}
                className={`flex-1 ${
                  action === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'hover:bg-emerald-50'
                }`}
                onClick={() => setAction('APPROVED')}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                type="button"
                variant={action === 'REJECTED' ? 'default' : 'outline'}
                className={`flex-1 ${
                  action === 'REJECTED'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'hover:bg-red-50'
                }`}
                onClick={() => setAction('REJECTED')}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Comments {action === 'REJECTED' && '(Required)'}</Label>
            <Textarea
              placeholder={
                action === 'APPROVED'
                  ? 'Optional: Add approval comments...'
                  : 'Required: Please provide rejection reason...'
              }
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={
              action === 'APPROVED'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }
            onClick={handleSubmit}
            disabled={isSubmitting || (action === 'REJECTED' && !comments.trim())}
          >
            {isSubmitting
              ? 'Submitting...'
              : action === 'APPROVED'
              ? 'Confirm Approval'
              : 'Confirm Rejection'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
