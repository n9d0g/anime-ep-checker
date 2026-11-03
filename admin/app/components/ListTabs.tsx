'use client'

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  OnHoldIcon,
  PlanToWatchIcon,
  WatchedIcon,
  WatchingIcon,
} from '@/app/components/ListIcons'
import { inboxCount } from '@/lib/inbox-store'
import { countByCategory, type SearchCategory } from '@/lib/search'
import { searchIndex } from '@/lib/search-index-store'
import {
  initialTabBarScroll,
  nextTabBarScroll,
  type TabBarScrollState,
} from '@/lib/tab-bar-scroll'

const TABS: {
  href: string
  category: SearchCategory
  label: string
  icon: ReactNode
}[] = [
  {
    href: '/',
    category: 'watching',
    label: 'Watching',
    icon: <WatchingIcon />,
  },
  {
    href: '/on-hold',
    category: 'on_hold',
    label: 'On hold',
    icon: <OnHoldIcon />,
  },
  {
    href: '/ptw',
    category: 'ptw',
    label: 'Plan to watch',
    icon: <PlanToWatchIcon />,
  },
  {
    href: '/watched',
    category: 'watched',
    label: 'Watched',
    icon: <WatchedIcon />,
  },
]

// Counts come from the search index, which already lists all four lists and
// is shared with search. Reloading on navigation picks up a move between
// lists, since moving a show invalidates the index.
function useListCounts(): Record<SearchCategory, number> | null {
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<SearchCategory, number> | null>(
    null
  )

  useEffect(() => {
    let live = true
    searchIndex
      .load()
      .then((items) => {
        if (live) {
          setCounts(countByCategory(items))
        }
      })
      .catch(() => {
        // Tabs work without counts; search reports its own load failure.
      })
    return () => {
      live = false
    }
  }, [pathname])

  return counts
}

// Whether the floating bar should be shrunk, from the direction of scrolling.
function useCompactOnScroll(enabled: boolean): boolean {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }
    let state: TabBarScrollState = initialTabBarScroll(window.scrollY)
    let frame = 0
    const update = () => {
      frame = 0
      state = nextTabBarScroll(state, {
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        pageHeight: document.documentElement.scrollHeight,
      })
      setCompact(state.compact)
    }
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [enabled])

  return compact
}

/**
 * The four lists as tabs: a floating, icon-only bar near the bottom on phones
 * and tablets (`bottom`), or a row inside the header on wider screens (`top`).
 * CSS shows one or the other. The floating bar shrinks while you scroll down.
 */
export function ListTabs({ placement }: { placement: 'top' | 'bottom' }) {
  const pathname = usePathname()
  const counts = useListCounts()
  const needsYou = useSyncExternalStore(
    inboxCount.subscribe,
    inboxCount.get,
    () => null
  )

  const bottom = placement === 'bottom'
  const compact = useCompactOnScroll(bottom)
  const activeIndex = TABS.findIndex((tab) => tab.href === pathname)

  if (bottom) {
    return (
      <nav
        className={`list-tabs-bottom${compact ? ' compact' : ''}`}
        aria-label="Lists"
      >
        {activeIndex >= 0 ? (
          <span
            className="list-tabs-lens"
            aria-hidden="true"
            style={{ '--active-index': activeIndex } as CSSProperties}
          />
        ) : null}
        {TABS.map((tab) => {
          const active = pathname === tab.href
          // Only the inbox badge shows here; the plain counts live in the
          // header tabs on wider screens.
          const alert = tab.category === 'watching' ? needsYou : null
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`list-tab${active ? ' active' : ''}`}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="list-tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
              {alert ? (
                <span
                  className="list-tab-count list-tab-count-alert"
                  aria-label={`${alert} need you`}
                >
                  {alert}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="list-tabs-top" aria-label="Lists">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        // Watching's badge counts the inbox while it has anything in it.
        const alert = tab.category === 'watching' && Boolean(needsYou)
        const count = alert ? needsYou : counts?.[tab.category]
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`list-tab${active ? ' active' : ''}`}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            <span className="list-tab-label">{tab.label}</span>
            {count !== undefined && count !== null ? (
              <span
                className={`list-tab-count${alert ? ' list-tab-count-alert' : ''}`}
                aria-label={alert ? `${count} need you` : undefined}
              >
                {count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
