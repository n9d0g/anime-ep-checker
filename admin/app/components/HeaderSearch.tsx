'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { SearchIcon } from '@/app/components/ListIcons'
import { SearchOverlay } from '@/app/components/SearchOverlay'

// The header's search: a bare icon button and the ⌘K / Ctrl K and `/`
// shortcuts, all opening the search dialog. `onOpen` lets the header close
// anything else that's open (the account menu).
export function HeaderSearch({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const isMac = useIsMac()
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    function openSearch() {
      setOpen(true)
      onOpenRef.current?.()
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearch()
        return
      }

      if (!isTyping && event.key === '/') {
        event.preventDefault()
        openSearch()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="[&_svg]:size-5"
        type="button"
        aria-label="Search shows"
        aria-keyshortcuts="Meta+K Control+K /"
        title={`Search shows (${isMac ? '⌘K' : 'Ctrl K'})`}
        onClick={() => {
          setOpen(true)
          onOpen?.()
        }}
      >
        <SearchIcon />
      </Button>
      <SearchOverlay open={open} onClose={() => setOpen(false)} />
    </>
  )
}

const noopSubscribe = () => () => {}

/** Whether this is an Apple device, where the shortcut is ⌘K; false on the server. */
function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false
  )
}
