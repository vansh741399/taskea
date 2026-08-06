'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

interface CreateWorkflowDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Template {
  id: string
  name: string
  description: string | null
  category: string | null
  steps: {
    id: string
    name: string
    stepType: string
    order: number
    assigneeRole: string | null
    slaHours: number | null
  }[]
}

export function CreateWorkflowDialog({ open, onClose, onSuccess }: CreateWorkflowDialogProps) {
  const { currentUserId } = useWorkflowStore()
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['workflow-templates'],
    queryFn: () => fetch('/api/workflow-templates').then((r) => r.json()),
  })

  const handleSubmit = async () => {
    if (!selectedTemplate || !title.trim()) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          creatorId: currentUserId,
          dueDate: dueDate || null,
        }),
      })

      if (res.ok) {
        resetForm()
        onSuccess()
      }
    } catch (error) {
      console.error('Failed to create workflow:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedTemplate('')
    setTitle('')
    setDescription('')
    setPriority('MEDIUM')
    setDueDate('')
  }

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate)

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Workflow Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplateData && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Template Steps:</p>
              <div className="space-y-1">
                {selectedTemplateData.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2 text-xs">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-medium">
                      {step.order}
                    </span>
                    <span className="text-gray-700">{step.name}</span>
                    <span className="text-gray-400 ml-auto">
                      {step.assigneeRole || 'Auto'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="Enter workflow title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe the workflow purpose"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleSubmit}
            disabled={!selectedTemplate || !title.trim() || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Workflow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
