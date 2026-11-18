'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface CompletePrompt {
  showId: string
  malId: number
  title: string
  pendingEpisodeAtMax?: number
}

// Asks for a score before marking a show completed. Esc, a click on the
// backdrop and Cancel all cancel, unless it's mid-submit.
export function CompleteRatingModal({
  prompt,
  submitting,
  onCancel,
  onConfirm,
}: {
  prompt: CompletePrompt
  submitting: boolean
  onCancel: () => void
  onConfirm: (score: number) => void
}) {
  const [score, setScore] = useState<number | null>(null)

  useEffect(() => {
    setScore(null)
  }, [prompt.showId])

  const label = prompt.title || prompt.showId
  const blockWhileSubmitting = (event: Event) => {
    if (submitting) {
      event.preventDefault()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onCancel()
        }
      }}
    >
      <DialogContent
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader>
          <DialogTitle>{`Rate ${label}`}</DialogTitle>
          <DialogDescription>
            Mark as completed on MyAnimeList and remove from Watching.
          </DialogDescription>
        </DialogHeader>
        <div
          className="mb-[1.15rem] grid grid-cols-5 gap-[0.45rem]"
          role="group"
          aria-label="Score from 1 to 10"
        >
          {Array.from({ length: 10 }, (_, index) => {
            const value = index + 1
            return (
              <button
                key={value}
                type="button"
                className="min-h-10 cursor-pointer rounded-md border border-border bg-(--panel-raised) text-[0.88rem] font-semibold text-foreground transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--text-secondary) disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-raised))] aria-pressed:hover:not-disabled:border-primary"
                aria-pressed={score === value}
                disabled={submitting}
                onClick={() => setScore(value)}
              >
                {value}
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting || score === null}
            onClick={() => {
              if (score !== null) {
                onConfirm(score)
              }
            }}
          >
            {submitting ? 'Saving…' : 'Mark completed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
