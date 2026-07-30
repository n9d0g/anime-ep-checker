'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

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
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
