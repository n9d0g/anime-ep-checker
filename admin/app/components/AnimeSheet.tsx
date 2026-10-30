'use client'

import { useState, type ReactNode } from 'react'
import { Sheet } from '@/app/components/Sheet'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'

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
      <div className={`sheet-hero${coverUrl ? ' sheet-hero-cover' : ''}`}>
        {coverUrl ? (
          <img className="sheet-cover" src={coverUrl} alt="" />
        ) : null}
        <div className="sheet-hero-text">
          <ShowTitleDisplay
            title={title}
            titleEnglish={titleEnglish}
            className="sheet-hero-title"
          />
          {meta ? <p className="sheet-hero-meta">{meta}</p> : null}
        </div>
      </div>
      {children}
    </Sheet>
  )
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
      <dl className="anime-facts">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {synopsis ? (
        <div className="anime-details-synopsis">
          <p className={clampable && !synopsisOpen ? 'clamped' : undefined}>
            {synopsis}
          </p>
          {clampable ? (
            <button
              className="text-btn"
              type="button"
              onClick={() => setSynopsisOpen((open) => !open)}
            >
              {synopsisOpen ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : null}
      {footer}
      <div className="quick-links">
        <a
          className="btn btn-secondary btn-sm"
          href={`https://myanimelist.net/anime/${malId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          MyAnimeList ↗
        </a>
        <a
          className="btn btn-secondary btn-sm"
          href={`https://anilist.co/search/anime?search=${encodeURIComponent(title)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          AniList ↗
        </a>
      </div>
    </>
  )
}
