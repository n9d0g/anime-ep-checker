import type { ReactNode } from 'react'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'

// One show in any list: title, English title, one detail line, and a trailing
// badge, over the show's AniList banner when it has one. Without a banner the
// cover stands in, blurred; without either the row is plain. The provider
// shows as a dot, or as a bar along the left edge of a banner row. Tapping it
// opens the show's sheet; rows hold no other buttons.
export function ListRow({
  id,
  title,
  titleEnglish,
  providerClass,
  bannerUrl,
  coverUrl,
  meta,
  trailing,
  onOpen,
}: {
  /** The row's element ID, which search results scroll to. */
  id?: string
  title: string
  titleEnglish?: string | null
  /** e.g. provider-cr, for Watching and On hold rows. */
  providerClass?: string
  bannerUrl?: string | null
  coverUrl?: string | null
  meta?: ReactNode
  trailing?: ReactNode
  onOpen: () => void
}) {
  const artUrl = bannerUrl || coverUrl

  return (
    <article id={id} className={`show-row${artUrl ? ' show-row-art' : ''}`}>
      <button
        type="button"
        className="show-row-header"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        {artUrl ? (
          <>
            <span
              className={`show-row-art-image${bannerUrl ? '' : ' show-row-art-cover'}`}
              style={{ backgroundImage: `url("${artUrl}")` }}
              aria-hidden="true"
            />
            <span className="show-row-art-shade" aria-hidden="true" />
          </>
        ) : null}
        {providerClass && artUrl ? (
          <span
            className={`provider-bar ${providerClass}`}
            aria-hidden="true"
          />
        ) : null}
        <div className="show-row-leading">
          {providerClass && !artUrl ? (
            <span
              className={`provider-dot ${providerClass}`}
              aria-hidden="true"
            />
          ) : null}
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
