'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/Modal'

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
    <Modal
      title={`Rate ${label}`}
      subtitle="Mark as completed on MyAnimeList and remove from tracked shows."
      submitting={submitting}
      onCancel={onCancel}
      primaryAction={
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
      }
    >
      <div className="rating-grid" role="group" aria-label="Score from 1 to 10">
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
    </Modal>
  )
}
