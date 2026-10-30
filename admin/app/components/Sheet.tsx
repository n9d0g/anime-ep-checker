'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// A show's details over the list: a bottom sheet on phones, a panel on the
// right from 900px up. Esc, the close button and the backdrop all call
// `onClose`; a modal opened from inside the sheet (e.g. the completion
// rating) takes Esc first. Focus moves into the sheet and back to whatever
// opened it.
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('.modal-overlay')
      ) {
        return
      }
      // Handled: a modal this opens (e.g. "Discard changes?") mounts before
      // the same keypress reaches its listener, and must not take it too.
      event.preventDefault()
      onCloseRef.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <button
          className="sheet-close"
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>,
    document.body
  )
}
