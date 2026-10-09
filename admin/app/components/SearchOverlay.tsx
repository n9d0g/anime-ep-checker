'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
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

const CATEGORY_ORDER: SearchCategory[] = ['watching', 'ptw', 'on_hold', 'watched']

interface SearchOverlayProps {
  open: boolean
  onClose: () => void
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchIndexItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const loadedRef = useRef(false)

  const results = useMemo(
    () => filterSearchIndex(items, query),
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

    inputRef.current?.focus()

    if (loadedRef.current) {
      return
    }

    setLoading(true)
    void fetch('/api/search-index', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string
          items?: SearchIndexItem[]
        }
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load search index')
        }
        setItems(data.items ?? [])
        loadedRef.current = true
      })
      .catch(() => {
        setItems([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open])

  const selectItem = useCallback(
    (item: SearchIndexItem) => {
      onClose()
      router.push(item.href)
    },
    [onClose, router]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

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

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="search-overlay-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="search-overlay" role="dialog" aria-label="Search shows">
        <input
          ref={inputRef}
          className="search-overlay-input"
          type="search"
          placeholder="Search watching, plan to watch, on hold…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search shows"
        />

        <div className="search-overlay-results">
          {loading ? (
            <p className="search-overlay-empty">Loading…</p>
          ) : query.trim() === '' ? (
            <p className="search-overlay-empty">Type to search all lists.</p>
          ) : flatResults.length === 0 ? (
            <p className="search-overlay-empty">No matches.</p>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const section = grouped.get(category) ?? []
              if (section.length === 0) {
                return null
              }

              return (
                <section className="search-overlay-group" key={category}>
                  <h3 className="search-overlay-group-title">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <ul className="search-overlay-list">
                    {section.map((item) => {
                      const index = flatResults.indexOf(item)
                      return (
                        <li key={`${category}-${item.id}`}>
                          <button
                            type="button"
                            className={`search-overlay-item${
                              index === activeIndex ? ' active' : ''
                            }`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectItem(item)}
                          >
                            <ShowTitleDisplay
                              title={item.title}
                              titleEnglish={item.titleEnglish}
                              className="search-overlay-item-title"
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
      </div>
    </div>,
    document.body
  )
}
