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
    <header className="top-header">
      <div className="top-header-inner">
        <Link
          href="/"
          className="top-header-brand"
          onClick={() => setAccountMenuOpen(false)}
        >
          Anime Episode Checker
        </Link>
        <ListTabs placement="top" />
        <div className="top-header-actions">
          <button
            className="header-icon-btn"
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
