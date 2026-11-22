'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AccountMenu } from '@/app/components/AccountMenu'
import { ListTabs } from '@/app/components/ListTabs'
import { HeaderSearch } from '@/app/components/HeaderSearch'

export function TopHeader() {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

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
          <HeaderSearch onOpen={() => setAccountMenuOpen(false)} />
          <AccountMenu
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
          />
        </div>
      </div>
    </header>
  )
}
