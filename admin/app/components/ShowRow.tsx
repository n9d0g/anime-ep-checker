'use client'

import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

// One show in the Watching list: title, English title, the schedule chip and
// next drop, and the episode badge. Tapping it opens the show's sheet.
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
    <article id={show.id ? `show-${show.id}` : undefined} className="show-row">
      <button
        type="button"
        className="show-row-header"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <div className="show-row-leading">
          <span
            className={`provider-dot ${view.providerDotClass}`}
            aria-hidden="true"
          />
          <ShowTitleDisplay
            title={show.title || `Show ${index + 1}`}
            titleEnglish={show.titleEnglish}
            belowSubtitle={
              view.nextDropLine || view.chip ? (
                <span className="show-row-next-episode">
                  {view.chip ? (
                    <span className={`chip chip-${view.chip.kind}`}>
                      {view.chip.label}
                    </span>
                  ) : null}
                  {view.nextDropLine ? (
                    <span className="show-row-next-drop">
                      {view.nextDropLine}
                    </span>
                  ) : null}
                </span>
              ) : null
            }
          />
        </div>
        <div className="show-row-trailing">
          <span
            className={`ep-count${badge.behind ? ' ep-count-behind' : ''}${
              badge.malDown ? ' ep-count-mal-down' : ''
            }`}
            title={badge.malDown ? MAL_DOWN_MESSAGE : undefined}
          >
            {badge.label}
          </span>
          <span className="chevron chevron-right" aria-hidden="true">
            ›
          </span>
        </div>
      </button>
    </article>
  )
}
