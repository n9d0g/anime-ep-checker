'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SearchIcon } from '@/app/components/ListIcons'
import { AccountMenu } from '@/app/components/AccountMenu'
import { ListTabs } from '@/app/components/ListTabs'
import { SearchOverlay } from '@/app/components/SearchOverlay'

export function TopHeader() {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
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
        setSearchOpen(true)
        setAccountMenuOpen(false)
        return
      }

      if (!isTyping && event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
        setAccountMenuOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[rgba(17,17,17,0.92)] pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur-[10px]">
      <div className="mx-auto flex h-(--top-header-h) w-[min(var(--container-width),100%)] min-w-0 items-center justify-between gap-4">
        <Link
          href="/"
          className="min-w-0 overflow-hidden text-[0.88rem] font-semibold tracking-[-0.01em] text-ellipsis whitespace-nowrap text-foreground no-underline hover:opacity-85 focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          onClick={() => setAccountMenuOpen(false)}
        >
          Anime Episode Checker
        </Link>
        <ListTabs placement="top" />
        <div className="flex shrink-0 items-center gap-[0.35rem]">
          <button
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-[0.45rem] border border-border bg-card p-0 text-(--muted) hover:border-ring hover:text-foreground [&_svg]:size-[1.35rem]"
            type="button"
            aria-label="Search shows"
            onClick={() => {
              setSearchOpen(true)
              setAccountMenuOpen(false)
            }}
          >
            <SearchIcon />
          </button>
          <AccountMenu
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
          />
        </div>
      </div>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
