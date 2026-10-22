'use client'

import { useEffect, useState } from 'react'
import { ModalOverlay } from '@/app/components/ModalOverlay'

export interface CompletePrompt {
  showId: string
  malId: number
  title: string
  pendingEpisodeAtMax?: number
}

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

  return (
    <ModalOverlay submitting={submitting} onCancel={onCancel}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-modal-title"
      >
        <h2 id="complete-modal-title" className="modal-title">
          Rate {label}
        </h2>
        <p className="modal-subtitle">
          Mark as completed on MyAnimeList and remove from tracked shows.
        </p>
        <div
          className="rating-grid"
          role="group"
          aria-label="Score from 1 to 10"
        >
          {Array.from({ length: 10 }, (_, index) => {
            const value = index + 1
            return (
              <button
                key={value}
                type="button"
                className={`rating-btn${score === value ? ' active' : ''}`}
                aria-pressed={score === value}
                disabled={submitting}
                onClick={() => setScore(value)}
              >
                {value}
              </button>
            )
          })}
        </div>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            disabled={submitting || score === null}
            onClick={() => {
              if (score !== null) {
                onConfirm(score)
              }
            }}
          >
            {submitting ? 'Saving…' : 'Mark completed'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
