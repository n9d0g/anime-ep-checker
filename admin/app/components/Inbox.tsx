'use client'

import Link from 'next/link'
import { formatMalDate } from '@/lib/anime-format'
import type { InboxItem } from '@/lib/inbox'

const ICONS: Record<InboxItem['kind'], string> = {
  announced_break: '⚠️',
  no_official_source: '📰',
  mal_unlinked: '🔗',
  ptw_airing: '📺',
  return_announced: '▶️',
}

// "Needs you": what only you can resolve, each with its action. Renders
// nothing when there's nothing to do.
export function Inbox({
  items,
  onAddBreak,
  onDismissBreak,
  onOpenSetup,
  onMoveToWatching,
  onNotNow,
}: {
  items: InboxItem[]
  onAddBreak: (showId: string) => void
  onDismissBreak: (showId: string) => void
  onOpenSetup: (showId: string, field: 'official-news' | 'mal') => void
  onMoveToWatching: (item: Extract<InboxItem, { kind: 'ptw_airing' }>) => void
  onNotNow: (key: string) => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="inbox" aria-labelledby="inbox-heading">
      <h2 id="inbox-heading" className="inbox-heading">
        Needs you <span className="inbox-count">{items.length}</span>
      </h2>
      <ul className="inbox-cards">
        {items.map((item) => (
          <li key={item.key} className="inbox-card">
            <span className="inbox-icon" aria-hidden="true">
              {ICONS[item.kind]}
            </span>
            <div className="inbox-text">
              <strong>{item.title}</strong>
              <InboxBody item={item} />
            </div>
            <div className="inbox-actions">
              {item.kind === 'announced_break' ? (
                <>
                  {item.suggestedWeeks ? (
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => onAddBreak(item.showId)}
                    >
                      Add {item.suggestedWeeks}-week break
                    </button>
                  ) : null}
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => onDismissBreak(item.showId)}
                  >
                    Dismiss
                  </button>
                </>
              ) : item.kind === 'no_official_source' ? (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => onOpenSetup(item.showId, 'official-news')}
                >
                  Set URL →
                </button>
              ) : item.kind === 'mal_unlinked' ? (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => onOpenSetup(item.showId, 'mal')}
                >
                  Link MAL →
                </button>
              ) : item.kind === 'return_announced' ? (
                <>
                  <Link
                    className="btn btn-sm"
                    href={`/on-hold#show-${encodeURIComponent(item.showId)}`}
                  >
                    Open in On hold
                  </Link>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => onNotNow(item.key)}
                  >
                    Not now
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => onMoveToWatching(item)}
                  >
                    Move to Watching
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => onNotNow(item.key)}
                  >
                    Not now
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function InboxBody({ item }: { item: InboxItem }) {
  switch (item.kind) {
    case 'announced_break':
      return (
        <span>
          Episode {item.announced.episode} postponed
          {item.announced.newDate
            ? `, new broadcast date ${formatMalDate(item.announced.newDate)} (JST)`
            : ', new date TBA'}
          {item.announced.sourceUrl ? (
            <>
              {' · '}
              <a
                href={item.announced.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </a>
            </>
          ) : null}
        </span>
      )
    case 'no_official_source':
      return (
        <span>
          No official news source. Breaks are only read from Anime News Network.
        </span>
      )
    case 'mal_unlinked':
      return <span>Not linked to MyAnimeList, so progress can’t sync.</span>
    case 'ptw_airing':
      return <span>From Plan to watch: it has started airing.</span>
    case 'return_announced':
      return (
        <span>
          From On hold: {item.label}.
          {item.sourceUrl ? (
            <>
              {' '}
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </a>
            </>
          ) : null}
        </span>
      )
  }
}
