'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/components/ui/utils'
import { requestHashHighlight } from '@/app/components/useHashScrollHighlight'
import { hashOf, pathOf } from '@/lib/hash-highlight'
import { searchIndex } from '@/lib/search-index-store'
import {
  filterSearchIndex,
  type SearchCategory,
  type SearchIndexItem,
} from '@/lib/search'

const CATEGORY_LABELS: Record<SearchCategory, string> = {
  watching: 'Watching',
  ptw: 'Plan to watch',
  on_hold: 'On hold',
  watched: 'Watched',
}

const CATEGORY_ORDER: SearchCategory[] = [
  'watching',
  'ptw',
  'on_hold',
  'watched',
]

interface SearchOverlayProps {
  open: boolean
  onClose: () => void
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  // null until the index has loaded once this session.
  const [items, setItems] = useState<SearchIndexItem[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const loading = items === null

  const results = useMemo(
    () => filterSearchIndex(items ?? [], query),
    [items, query]
  )

  const grouped = useMemo(() => {
    const map = new Map<SearchCategory, SearchIndexItem[]>()
    for (const category of CATEGORY_ORDER) {
      map.set(category, [])
    }
    for (const item of results) {
      map.get(item.category)?.push(item)
    }
    return map
  }, [results])

  const flatResults = useMemo(() => {
    const list: SearchIndexItem[] = []
    for (const category of CATEGORY_ORDER) {
      list.push(...(grouped.get(category) ?? []))
    }
    return list
  }, [grouped])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }

    // Loaded once per session (the header stays mounted across pages); a
    // move between lists invalidates it so this picks up a fresh copy.
    let active = true
    searchIndex
      .load()
      .then((loaded) => {
        if (active) {
          setItems(loaded)
        }
      })
      .catch(() => {
        if (active) {
          setItems((current) => current ?? [])
        }
      })
    return () => {
      active = false
    }
  }, [open])

  const selectItem = useCallback(
    (item: SearchIndexItem) => {
      onClose()
      router.push(item.href)
      // Already on that list: no remount and no hashchange, so ask the page
      // to highlight the row itself.
      if (pathOf(item.href) === pathname) {
        requestHashHighlight(hashOf(item.href))
      }
    },
    [onClose, router, pathname]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    // Esc is the dialog's own; arrows and Enter move through the results
    // while typing.
    function onKeyDown(event: KeyboardEvent) {
      if (flatResults.length === 0) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % flatResults.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) =>
          index === 0 ? flatResults.length - 1 : index - 1
        )
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = flatResults[activeIndex]
        if (item) {
          selectItem(item)
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, flatResults, activeIndex, onClose, selectItem])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  return (
    <Dialog open={open} onOpenChange={(next) => next || onClose()}>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="z-200 bg-black/60"
        className="z-200 flex max-h-[min(28rem,70vh)] w-[min(32rem,calc(100%-2rem))] flex-col gap-2 overflow-visible rounded-[0.65rem] p-3 shadow-[0_12px_40px_rgb(0_0_0/0.25)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <input
          ref={inputRef}
          className="w-full max-w-full min-w-0 overflow-hidden rounded-[0.45rem] border border-border bg-background px-[0.65rem] py-[0.55rem] text-base text-ellipsis text-foreground transition-[border-color] outline-none focus:border-ring"
          type="search"
          placeholder="Search watching, plan to watch, on hold…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search shows"
        />

        <div className="min-h-0 overflow-auto">
          {loading ? (
            <SearchMessage>Loading…</SearchMessage>
          ) : query.trim() === '' ? (
            <SearchMessage>Type to search all lists.</SearchMessage>
          ) : flatResults.length === 0 ? (
            <SearchMessage>No matches.</SearchMessage>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const section = grouped.get(category) ?? []
              if (section.length === 0) {
                return null
              }

              return (
                <section className="mb-2" key={category}>
                  <h3 className="m-0 mb-1 px-1 text-[0.72rem] font-semibold tracking-[0.04em] text-(--hint) uppercase">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <ul className="m-0 list-none p-0">
                    {section.map((item) => {
                      const index = flatResults.indexOf(item)
                      return (
                        <li key={`${category}-${item.id}`}>
                          <button
                            type="button"
                            className={cn(
                              'block w-full cursor-pointer rounded-[0.4rem] border-none bg-transparent px-2 py-[0.45rem] text-left text-foreground hover:bg-accent',
                              index === activeIndex && 'bg-accent'
                            )}
                            data-active={index === activeIndex || undefined}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectItem(item)}
                          >
                            <ShowTitleDisplay
                              title={item.title}
                              titleEnglish={item.titleEnglish}
                              className=""
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          )}
        </div>
        <DialogTitle className="sr-only">Search shows</DialogTitle>
      </DialogContent>
    </Dialog>
  )
}

function SearchMessage({ children }: { children: string }) {
  return (
    <p className="mx-0 my-2 text-center text-[0.85rem] text-(--hint)">
      {children}
    </p>
  )
}
