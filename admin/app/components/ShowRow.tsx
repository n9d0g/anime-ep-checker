'use client'

import { ListRow } from '@/app/components/ListRow'
import type { AniListMedia } from '@/lib/anilist'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

// One show in the Watching list: the shared row with the provider dot, the
// schedule chip and next drop, and the episode badge.
export function ShowRow({
  displayRow,
  art,
  onOpen,
}: {
  displayRow: DisplayRow
  /** The show's AniList banner and cover, once known. */
  art: AniListMedia | null
  onOpen: () => void
}) {
  const { row, index, view } = displayRow
  const show = row.values
  const { badge } = view

  return (
    <ListRow
      id={show.id ? `show-${show.id}` : undefined}
      title={show.title || `Show ${index + 1}`}
      titleEnglish={show.titleEnglish}
      providerClass={view.providerDotClass}
      bannerUrl={art?.bannerUrl}
      coverUrl={art?.coverUrl}
      meta={
        view.nextDropLine || view.chip ? (
          <>
            {view.chip ? (
              <span className={`chip chip-${view.chip.kind}`}>
                {view.chip.label}
              </span>
            ) : null}
            {view.nextDropLine ? (
              <span className="show-row-next-drop">{view.nextDropLine}</span>
            ) : null}
          </>
        ) : null
      }
      trailing={
        <span
          className={`ep-count${badge.behind ? ' ep-count-behind' : ''}${
            badge.malDown ? ' ep-count-mal-down' : ''
          }`}
          title={badge.malDown ? MAL_DOWN_MESSAGE : undefined}
        >
          {badge.label}
        </span>
      }
      onOpen={onOpen}
    />
  )
}
