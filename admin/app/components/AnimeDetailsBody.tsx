'use client'

import { useState, type ReactNode } from 'react'

/** Roughly four clamped lines at panel width; shorter synopses show in full. */
const SYNOPSIS_CLAMP_CHARS = 280

export type AnimeFact = [label: string, value: string | null]

export function AnimeDetailsBody({
  malId,
  coverUrl,
  facts,
  synopsis = null,
  footer = null,
}: {
  malId: number
  coverUrl: string | null
  facts: AnimeFact[]
  synopsis?: string | null
  footer?: ReactNode
}) {
  const [synopsisOpen, setSynopsisOpen] = useState(false)
  const clampable =
    Boolean(synopsis) &&
    (synopsis!.length > SYNOPSIS_CLAMP_CHARS || synopsis!.includes('\n'))

  return (
    <div className="show-row-body anime-details-body">
      {coverUrl ? (
        <img
          className="anime-details-cover"
          src={coverUrl}
          alt=""
          loading="lazy"
        />
      ) : null}
      <div className="anime-details">
        <dl className="anime-details-facts">
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
        <a
          className="anime-details-mal-link"
          href={`https://myanimelist.net/anime/${malId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on MyAnimeList
        </a>
      </div>
    </div>
  )
}
