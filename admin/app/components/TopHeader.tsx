'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="profile-menu-icon" aria-hidden="true">
      {children}
    </span>
  )
}

function WatchingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="1.5"
        y="3"
        width="13"
        height="8.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M6.25 6.25L10.25 8.25L6.25 10.25V6.25Z"
        fill="currentColor"
      />
      <path
        d="M4.5 13.5H11.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlanToWatchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 2.75H12.5V13.25L8 10.75L3.5 13.25V2.75Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M6 6.25H10"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M6 8.5H9.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 2.75H11.25C11.94 2.75 12.5 3.31 12.5 4V12C12.5 12.69 11.94 13.25 11.25 13.25H6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M9 8H2.75"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M4.75 5.75L2.75 8L4.75 10.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TopHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    if (!profileMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
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

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
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
        <span className="top-header-brand">Anime Episode Checker</span>
        <div className="profile-menu" ref={profileMenuRef}>
          <button
            className="profile-menu-btn"
            type="button"
            aria-label="Account menu"
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <img src="/icon.jpg" alt="" />
          </button>
          {profileMenuOpen ? (
            <div className="profile-menu-dropdown" role="menu">
              <Link
                className={`profile-menu-item profile-menu-link${
                  pathname === '/' ? ' active' : ''
                }`}
                href="/"
                role="menuitem"
                onClick={() => setProfileMenuOpen(false)}
              >
                <MenuIcon>
                  <WatchingIcon />
                </MenuIcon>
                Watching
              </Link>
              <Link
                className={`profile-menu-item profile-menu-link${
                  pathname === '/ptw' ? ' active' : ''
                }`}
                href="/ptw"
                role="menuitem"
                onClick={() => setProfileMenuOpen(false)}
              >
                <MenuIcon>
                  <PlanToWatchIcon />
                </MenuIcon>
                Plan to watch
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
    </header>
  )
}
