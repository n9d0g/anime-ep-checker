'use client'

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { sheetDragOffset, shouldDismissSheet } from '@/lib/sheet-swipe'

// Matches the 900px breakpoint where the sheet becomes a right-hand panel.
const PHONE_QUERY = '(max-width: 899px)'
// Finger travel before a touch counts as a drag or a scroll.
const SLOP_PX = 6
// A finger resting longer than this before letting go isn't a flick.
const FLICK_WINDOW_MS = 100

// On phones, dragging the sheet down closes it: from anywhere on it, once
// its content is scrolled to the top. Letting go past the threshold calls
// `onClose` and puts the sheet straight back, so a "Discard changes?" the
// parent shows instead sits over a fully open sheet.
function useSwipeToClose(
  panelRef: RefObject<HTMLDivElement | null>,
  scrollRef: RefObject<HTMLDivElement | null>,
  onCloseRef: RefObject<() => void>
) {
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    let mode: 'idle' | 'pending' | 'drag' | 'ignore' = 'idle'
    let startX = 0
    let startY = 0
    let prev = { y: 0, t: 0 }
    let last = { y: 0, t: 0 }

    function setOffset(offset: number, animate: boolean) {
      if (!panel) return
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches
      panel.style.transition =
        animate && !reduced
          ? 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
          : ''
      panel.style.transform = offset ? `translateY(${offset}px)` : ''
    }

    function onTouchStart(event: TouchEvent) {
      if (
        event.touches.length !== 1 ||
        !window.matchMedia(PHONE_QUERY).matches ||
        document.querySelector('.modal-overlay')
      ) {
        mode = 'ignore'
        return
      }
      const touch = event.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      last = prev = { y: startY, t: event.timeStamp }
      mode = 'pending'
    }

    function onTouchMove(event: TouchEvent) {
      if (mode === 'idle' || mode === 'ignore') return
      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY

      if (mode === 'pending') {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP_PX) return
        const scroll = scrollRef.current
        const atTop =
          !scroll ||
          !scroll.contains(event.target as Node) ||
          scroll.scrollTop <= 0
        // Only a mostly-vertical pull downward from the top is a drag;
        // anything else belongs to the browser for the rest of the touch.
        mode =
          dy > 0 && Math.abs(dy) > Math.abs(dx) && atTop ? 'drag' : 'ignore'
        if (mode === 'ignore') return
      }

      event.preventDefault()
      prev = last
      last = { y: touch.clientY, t: event.timeStamp }
      setOffset(sheetDragOffset(dy), false)
    }

    function onTouchEnd(event: TouchEvent) {
      const wasDrag = mode === 'drag'
      mode = 'idle'
      if (!wasDrag || !panel) return

      const resting = event.timeStamp - last.t > FLICK_WINDOW_MS
      const dt = last.t - prev.t
      const velocity = resting || dt <= 0 ? 0 : (last.y - prev.y) / dt
      const dismiss =
        event.type === 'touchend' &&
        shouldDismissSheet({
          distance: last.y - startY,
          height: panel.offsetHeight,
          velocity,
        })

      if (dismiss) {
        setOffset(0, false)
        onCloseRef.current()
      } else {
        setOffset(0, true)
      }
    }

    panel.addEventListener('touchstart', onTouchStart, { passive: true })
    panel.addEventListener('touchmove', onTouchMove, { passive: false })
    panel.addEventListener('touchend', onTouchEnd)
    panel.addEventListener('touchcancel', onTouchEnd)
    return () => {
      panel.removeEventListener('touchstart', onTouchStart)
      panel.removeEventListener('touchmove', onTouchMove)
      panel.removeEventListener('touchend', onTouchEnd)
      panel.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [panelRef, scrollRef, onCloseRef])
}

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
  const scrollRef = useRef<HTMLDivElement>(null)
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

  useSwipeToClose(panelRef, scrollRef, onCloseRef)

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
        <div ref={scrollRef} className="sheet-scroll">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

/** A titled section of a sheet, e.g. Watch or Manage. */
export function SheetSection({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section className="sheet-section">
      <h3 className="sheet-section-title">{title}</h3>
      {children}
    </section>
  )
}
