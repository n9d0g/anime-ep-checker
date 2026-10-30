'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  OnHoldIcon,
  PlanToWatchIcon,
  WatchedIcon,
  WatchingIcon,
} from '@/app/components/ListIcons'
import { countByCategory, type SearchCategory } from '@/lib/search'
import { searchIndex } from '@/lib/search-index-store'

const TABS: {
  href: string
  category: SearchCategory
  label: string
  shortLabel: string
  icon: ReactNode
}[] = [
  {
    href: '/',
    category: 'watching',
    label: 'Watching',
    shortLabel: 'Watching',
    icon: <WatchingIcon />,
  },
  {
    href: '/on-hold',
    category: 'on_hold',
    label: 'On hold',
    shortLabel: 'On hold',
    icon: <OnHoldIcon />,
  },
  {
    href: '/ptw',
    category: 'ptw',
    label: 'Plan to watch',
    shortLabel: 'PTW',
    icon: <PlanToWatchIcon />,
  },
  {
    href: '/watched',
    category: 'watched',
    label: 'Watched',
    shortLabel: 'Watched',
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

/**
 * The four lists as tabs: a bar along the bottom on phones (`bottom`), or a
 * row inside the header on wider screens (`top`). CSS shows one or the other.
 */
export function ListTabs({ placement }: { placement: 'top' | 'bottom' }) {
  const pathname = usePathname()
  const counts = useListCounts()

  return (
    <nav
      className={placement === 'top' ? 'list-tabs-top' : 'list-tabs-bottom'}
      aria-label="Lists"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href
        const count = counts?.[tab.category]
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`list-tab${active ? ' active' : ''}`}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            {placement === 'bottom' ? (
              <span className="list-tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
            ) : null}
            <span className="list-tab-label">{tab.label}</span>
            <span className="list-tab-label-short" aria-hidden="true">
              {tab.shortLabel}
            </span>
            {count !== undefined ? (
              <span className="list-tab-count">{count}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
