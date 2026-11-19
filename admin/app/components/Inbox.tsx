'use client'

import Link from 'next/link'
import { formatMalDate } from '@/lib/anime-format'
import type { InboxItem } from '@/lib/inbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
    <section className="mb-6" aria-labelledby="inbox-heading">
      <h2
        id="inbox-heading"
        className="m-0 mb-2 flex items-center gap-[0.4rem] text-[0.72rem] leading-none font-[650] tracking-[0.08em] text-(--text-secondary) uppercase"
      >
        Needs you {/* Centred on the heading's line: a fixed-height pill. */}
        <Badge className="inline-grid h-5 min-w-5 place-items-center bg-primary px-[0.35rem] py-0 font-[650] tracking-normal text-primary-foreground tabular-nums">
          {items.length}
        </Badge>
      </h2>
      <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-[rgba(124,140,255,0.35)] bg-[linear-gradient(180deg,rgba(124,140,255,0.08),rgba(124,140,255,0.03))] p-0">
        {items.map((item) => (
          <li
            key={item.key}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[0.35rem] px-[0.95rem] py-[0.85rem] [&+&]:[border-top:1px_solid_rgba(124,140,255,0.18)]"
          >
            <span className="leading-[1.4]" aria-hidden="true">
              {ICONS[item.kind]}
            </span>
            <div className="flex min-w-0 flex-col text-[0.88rem] [&_span]:text-(--text-secondary)">
              <strong>{item.title}</strong>
              <InboxBody item={item} />
            </div>
            <div className="col-start-2 mt-1 flex flex-wrap gap-2">
              {item.kind === 'announced_break' ? (
                <>
                  {item.suggestedWeeks ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => onAddBreak(item.showId)}
                    >
                      Add {item.suggestedWeeks}-week break
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onDismissBreak(item.showId)}
                  >
                    Dismiss
                  </Button>
                </>
              ) : item.kind === 'no_official_source' ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => onOpenSetup(item.showId, 'official-news')}
                >
                  Set URL →
                </Button>
              ) : item.kind === 'mal_unlinked' ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => onOpenSetup(item.showId, 'mal')}
                >
                  Link MAL →
                </Button>
              ) : item.kind === 'return_announced' ? (
                <>
                  <Button asChild size="sm">
                    <Link
                      href={`/on-hold#show-${encodeURIComponent(item.showId)}`}
                    >
                      Open in On hold
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onNotNow(item.key)}
                  >
                    Not now
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => onMoveToWatching(item)}
                  >
                    Move to Watching
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onNotNow(item.key)}
                  >
                    Not now
                  </Button>
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
