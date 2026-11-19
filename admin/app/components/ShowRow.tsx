'use client'

import {
  ListRow,
  ListRowCount,
  ListRowMetaText,
} from '@/app/components/ListRow'
import { ScheduleChipBadge } from '@/app/components/ScheduleChipBadge'
import type { AniListMedia } from '@/lib/anilist'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

// One show in the Watching list: the shared row with the provider dot, the
// schedule chip and next drop, the latest episode's title while behind, and
// the episode badge.
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
            {view.chip ? <ScheduleChipBadge chip={view.chip} /> : null}
            {view.nextDropLine ? (
              <ListRowMetaText>{view.nextDropLine}</ListRowMetaText>
            ) : null}
          </>
        ) : null
      }
      secondaryMeta={view.behindEpisodeLine}
      trailing={
        <ListRowCount
          tone={badge.malDown ? 'malDown' : badge.behind ? 'behind' : null}
          title={badge.malDown ? MAL_DOWN_MESSAGE : undefined}
        >
          {badge.label}
        </ListRowCount>
      }
      onOpen={onOpen}
    />
  )
}
