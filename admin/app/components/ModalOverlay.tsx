'use client'

import { useEffect, type ReactNode } from 'react'

// Backdrop for a modal panel. Escape and clicks outside the panel cancel,
// unless the modal is mid-submit.
export function ModalOverlay({
  submitting,
  onCancel,
  children,
}: {
  submitting: boolean
  onCancel: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, submitting])

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel()
        }
      }}
    >
      {children}
    </div>
  )
}
