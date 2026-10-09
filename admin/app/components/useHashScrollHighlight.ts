'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function highlightFromHash() {
  const hash = window.location.hash
  if (!hash.startsWith('#show-')) {
    return
  }

  const id = hash.slice(1)
  const element = document.getElementById(id)
  if (!element) {
    return
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.classList.add('search-highlight')

  window.setTimeout(() => {
    element.classList.remove('search-highlight')
  }, 2000)
}

/** Pass `ready` when rows render after an async load so the hash target exists. */
export function useHashScrollHighlight(ready = true) {
  const pathname = usePathname()

  useEffect(() => {
    if (!ready) {
      return
    }

    const run = () => {
      window.requestAnimationFrame(() => {
        highlightFromHash()
      })
    }

    run()
    window.addEventListener('hashchange', run)
    return () => {
      window.removeEventListener('hashchange', run)
    }
  }, [pathname, ready])
}
