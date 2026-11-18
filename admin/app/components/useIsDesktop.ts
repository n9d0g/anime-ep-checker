'use client'

import { useSyncExternalStore } from 'react'

// From 900px up is a computer: the tab bar sits in the header, menus drop
// down and sheets open from the right. Below it is a phone or tablet.
const DESKTOP_QUERY = '(min-width: 900px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window is computer-wide (900px up); false on the server. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  )
}
