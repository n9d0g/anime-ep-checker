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
import { cn } from '@/components/ui/utils'
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

// Shared by both placements: the tab, its count and the inbox badge.
const TAB =
  'relative inline-flex items-center gap-[0.4rem] whitespace-nowrap text-(--text-secondary) no-underline'
const TAB_IDLE = 'hover:text-foreground'
const COUNT = 'font-semibold text-muted-foreground tabular-nums'
const ALERT =
  'inline-grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-primary px-[0.3rem] text-primary-foreground'

/**
 * The four lists as tabs: a floating, icon-only bar near the bottom on phones
 * and tablets (`bottom`), or a row inside the header on wider screens (`top`).
 * CSS shows one or the other. The floating bar shrinks while you scroll down.
 *
 * The bar's height and its gap above the screen's edge are `--tab-bar-h` and
 * `--tab-bar-offset` (globals.css), which also keep the page's end and the
 * toasts clear of it; `data-tab-bar` is what the toasts look for.
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
        data-slot="list-tabs"
        data-tab-bar=""
        className={cn(
          'fixed inset-x-0 bottom-(--tab-bar-offset) z-30 mx-auto flex h-(--tab-bar-h) w-max p-(--tab-pad) [--tab-pad:0.3rem] [--tab-w:3.5rem] min-[900px]:hidden',
          'rounded-full border border-white/12',
          // Liquid glass: mostly see-through, blurred and saturated, lit from
          // above. Without backdrop blur it's a near-solid dark bar instead.
          'bg-[rgba(28,28,30,0.42)] bg-[image:linear-gradient(rgba(255,255,255,0.08),rgba(255,255,255,0.03))] backdrop-blur-[20px] backdrop-saturate-180',
          'supports-[not_((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-[rgba(17,17,17,0.94)] supports-[not_((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-none',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.3)]',
          'origin-bottom transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          compact && 'motion-safe:translate-y-1 motion-safe:scale-85'
        )}
        aria-label="Lists"
      >
        {activeIndex >= 0 ? (
          // The active tab's glass lens; slides to whichever tab is current.
          <span
            className="pointer-events-none absolute inset-y-(--tab-pad) left-(--tab-pad) w-(--tab-w) translate-x-[calc(var(--active-index)*var(--tab-w))] rounded-full bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-transform duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
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
              className={cn(
                TAB,
                'w-(--tab-w) justify-center rounded-full [-webkit-tap-highlight-color:transparent]',
                active ? 'text-primary' : TAB_IDLE
              )}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className="inline-flex [&_svg]:size-[1.4rem]"
                aria-hidden="true"
              >
                {tab.icon}
              </span>
              {alert ? (
                <span
                  className={cn(
                    COUNT,
                    ALERT,
                    'absolute top-[0.2rem] left-[calc(50%+0.45rem)] text-[0.6rem]'
                  )}
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
    <nav
      data-slot="list-tabs"
      className="mr-auto ml-3 hidden items-center gap-[0.2rem] min-[900px]:flex"
      aria-label="Lists"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href
        // Watching's badge counts the inbox while it has anything in it.
        const alert = tab.category === 'watching' && Boolean(needsYou)
        const count = alert ? needsYou : counts?.[tab.category]
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              TAB,
              'rounded-full px-[0.7rem] py-[0.4rem] text-[0.85rem] font-medium',
              active ? 'bg-(--accent-soft) text-foreground' : TAB_IDLE
            )}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            <span>{tab.label}</span>
            {count !== undefined && count !== null ? (
              <span
                className={cn(COUNT, 'text-[0.72rem]', alert && ALERT)}
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
