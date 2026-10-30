'use client'

import { ListRow } from '@/app/components/ListRow'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

// One show in the Watching list: the shared row with the provider dot, the
// schedule chip and next drop, and the episode badge.
export function ShowRow({
  displayRow,
  onOpen,
}: {
  displayRow: DisplayRow
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
      marker={
        <span
          className={`provider-dot ${view.providerDotClass}`}
          aria-hidden="true"
        />
      }
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
