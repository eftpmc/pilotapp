import { useState, useEffect } from 'react'
import type { KnowledgeDoc } from '@pilot/shared'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  doc?: KnowledgeDoc
  scopeLabel?: string
  rows?: number
  onClose: () => void
  onSave: (body: { title: string; content: string }) => void
  loading: boolean
  error?: string
}

export function KnowledgeDocDialog({
  open, doc, scopeLabel = 'Knowledge', rows = 8, onClose, onSave, loading, error,
}: Props) {
  const [title,   setTitle]   = useState(doc?.title   ?? '')
  const [content, setContent] = useState(doc?.content ?? '')

  useEffect(() => {
    if (open) {
      setTitle(doc?.title   ?? '')
      setContent(doc?.content ?? '')
    }
  }, [open, doc?.id])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc ? 'Edit document' : `Add to ${scopeLabel}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Coding Standards, Architecture Overview"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={rows}
              placeholder="Markdown — included verbatim in the agent's prompt context."
              className="font-mono text-xs resize-y"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={!title.trim() || loading}
              onClick={() => onSave({ title: title.trim(), content })}
            >
              {loading ? '…' : doc ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
