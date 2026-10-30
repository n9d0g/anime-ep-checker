'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LogOutIcon,
  MalSetupIcon,
  SearchIcon,
} from '@/app/components/ListIcons'
import { ListTabs } from '@/app/components/ListTabs'
import { SearchOverlay } from '@/app/components/SearchOverlay'

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="profile-menu-icon" aria-hidden="true">
      {children}
    </span>
  )
}

export function TopHeader() {
  const router = useRouter()
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
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
        setProfileMenuOpen(false)
        return
      }

      if (!isTyping && event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // The menu closes on Esc and on a click or tap anywhere outside it.
  useEffect(() => {
    if (!profileMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileMenuOpen])

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="top-header">
      <div className="top-header-inner">
        <Link
          href="/"
          className="top-header-brand"
          onClick={() => setProfileMenuOpen(false)}
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
              setProfileMenuOpen(false)
            }}
          >
            <SearchIcon />
          </button>
          <div className="profile-menu" ref={profileMenuRef}>
            <button
              className="profile-menu-btn"
              type="button"
              aria-label="Account menu"
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <img src="/icons/icon-192.png" alt="" />
            </button>
            {profileMenuOpen ? (
              <div className="profile-menu-dropdown" role="menu">
                <Link
                  className="profile-menu-item profile-menu-link"
                  href="/mal"
                  role="menuitem"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  <MenuIcon>
                    <MalSetupIcon />
                  </MenuIcon>
                  MAL setup
                </Link>
                <div className="profile-menu-divider" role="separator" />
                <button
                  className="profile-menu-item profile-menu-danger"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    void logout()
                  }}
                >
                  <MenuIcon>
                    <LogOutIcon />
                  </MenuIcon>
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
