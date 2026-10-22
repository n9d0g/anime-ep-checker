'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createHighlightTracker } from '@/lib/hash-highlight'

const HIGHLIGHT_EVENT = 'aec:highlight-hash'
const HIGHLIGHT_MS = 2000

// A hash-only router.push (a search result on the page you're already on)
// doesn't fire `hashchange`, so search asks the page directly.
export function requestHashHighlight(hash: string) {
  window.dispatchEvent(new CustomEvent(HIGHLIGHT_EVENT, { detail: hash }))
}

function flash(element: HTMLElement) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.classList.add('search-highlight')

  window.setTimeout(() => {
    element.classList.remove('search-highlight')
  }, HIGHLIGHT_MS)
}

// Scrolls to and flashes the `#show-<id>` row a search result linked to.
// The request waits until that row is rendered, so it works when the list
// appears only after its data loads. `onTarget` runs as soon as a row is
// requested (e.g. to expand it).
export function useHashScrollHighlight(onTarget?: (elementId: string) => void) {
  const pathname = usePathname()
  const [tracker] = useState(createHighlightTracker)
  const [, setRequests] = useState(0)
  const onTargetRef = useRef(onTarget)
  onTargetRef.current = onTarget

  useEffect(() => {
    function request(hash: string) {
      const id = tracker.request(hash)
      if (id) {
        onTargetRef.current?.(id)
      }
      // Re-render so the effect below looks for the row.
      setRequests((count) => count + 1)
    }

    function onHashChange() {
      request(window.location.hash)
    }

    function onRequest(event: Event) {
      request((event as CustomEvent<string>).detail)
    }

    request(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener(HIGHLIGHT_EVENT, onRequest)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener(HIGHLIGHT_EVENT, onRequest)
    }
  }, [pathname, tracker])

  // After every render while a request is pending: highlight the row once it
  // exists (the list may still be a skeleton).
  useEffect(() => {
    if (tracker.pending() === null) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const id = tracker.take((elementId) =>
        Boolean(document.getElementById(elementId))
      )
      const element = id ? document.getElementById(id) : null
      if (element) {
        flash(element)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  })
}
