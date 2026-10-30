import type { ReactNode } from 'react'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'

// One show in any list: an optional marker (e.g. the provider dot), title,
// English title, one detail line, and a trailing badge. Tapping it opens the
// show's sheet; rows hold no other buttons.
export function ListRow({
  id,
  title,
  titleEnglish,
  marker,
  meta,
  trailing,
  onOpen,
}: {
  /** The row's element ID, which search results scroll to. */
  id?: string
  title: string
  titleEnglish?: string | null
  marker?: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  onOpen: () => void
}) {
  return (
    <article id={id} className="show-row">
      <button
        type="button"
        className="show-row-header"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <div className="show-row-leading">
          {marker}
          <ShowTitleDisplay
            title={title}
            titleEnglish={titleEnglish}
            belowSubtitle={
              meta ? (
                <span className="show-row-next-episode">{meta}</span>
              ) : null
            }
          />
        </div>
        <div className="show-row-trailing">
          {trailing}
          <span className="chevron chevron-right" aria-hidden="true">
            ›
          </span>
        </div>
      </button>
    </article>
  )
}
