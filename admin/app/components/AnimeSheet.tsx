'use client'

import { useState, type ReactNode } from 'react'
import {
  SHEET_HERO_CLASS,
  SHEET_HERO_META_CLASS,
  SHEET_HERO_TITLE_CLASS,
  SHEET_LINKS_CLASS,
  Sheet,
} from '@/app/components/Sheet'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/utils'

export type AnimeFact = [label: string, value: string | null]

/** Roughly four clamped lines at sheet width; shorter synopses show in full. */
const SYNOPSIS_CLAMP_CHARS = 280

// A MAL show in a sheet (On hold, Plan to watch, Watched): the cover and
// titles up top, then the sections the list needs.
export function AnimeSheet({
  title,
  titleEnglish,
  coverUrl,
  meta,
  onClose,
  children,
}: {
  title: string
  titleEnglish?: string | null
  coverUrl: string | null
  meta?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div
        className={cn(
          SHEET_HERO_CLASS,
          coverUrl && 'grid-cols-[auto_minmax(0,1fr)] items-end gap-4'
        )}
      >
        {coverUrl ? (
          <img
            className="h-[124px] w-[88px] rounded-[10px] bg-accent object-cover"
            src={coverUrl}
            alt=""
          />
        ) : null}
        <div className="grid min-w-0 gap-[0.4rem]">
          <ShowTitleDisplay
            title={title}
            titleEnglish={titleEnglish}
            className={SHEET_HERO_TITLE_CLASS}
          />
          {meta ? (
            <p
              className={cn(
                SHEET_HERO_META_CLASS,
                'flex flex-wrap items-center gap-[0.45rem]'
              )}
            >
              {meta}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </Sheet>
  )
}

/** Labelled facts in two columns; missing ones are left out. */
export function AnimeFactList({ facts }: { facts: AnimeFact[] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-[0.45rem] text-[0.85rem]">
      {facts
        .filter((fact): fact is [string, string] => Boolean(fact[1]))
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-(--muted)">{label}</dt>
            <dd className="m-0 text-foreground">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/** "Loading details from MAL…" and the like, in a sheet. */
export function AnimeLoadingNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[0.82rem] text-(--hint)">{children}</p>
}

// A show's facts (missing ones left out), its synopsis and links out.
export function AnimeFacts({
  malId,
  title,
  facts,
  synopsis = null,
  footer = null,
}: {
  malId: number
  title: string
  facts: AnimeFact[]
  synopsis?: string | null
  footer?: ReactNode
}) {
  const [synopsisOpen, setSynopsisOpen] = useState(false)
  const clampable =
    Boolean(synopsis) &&
    (synopsis!.length > SYNOPSIS_CLAMP_CHARS || synopsis!.includes('\n'))

  return (
    <>
      <AnimeFactList facts={facts} />
      {synopsis ? (
        <div className="grid justify-items-start gap-[0.3rem]">
          <p
            className={cn(
              'm-0 text-[0.84rem] leading-[1.55] whitespace-pre-line text-(--text-secondary)',
              clampable && !synopsisOpen && 'line-clamp-4'
            )}
          >
            {synopsis}
          </p>
          {clampable ? (
            <Button
              variant="link"
              size="text"
              className="text-[0.8rem]"
              type="button"
              onClick={() => setSynopsisOpen((open) => !open)}
            >
              {synopsisOpen ? 'Show less' : 'Read more'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {footer}
      <div className={SHEET_LINKS_CLASS}>
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://myanimelist.net/anime/${malId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            MyAnimeList ↗
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://anilist.co/search/anime?search=${encodeURIComponent(title)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            AniList ↗
          </a>
        </Button>
      </div>
    </>
  )
}
