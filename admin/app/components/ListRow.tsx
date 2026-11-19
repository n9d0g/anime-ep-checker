import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/components/ui/utils'
import {
  ROW_TITLE_CLASS,
  ShowTitleDisplay,
} from '@/app/components/ShowTitleDisplay'

/** One row; a hairline separates it from the row above. */
export const ROW_CLASS =
  'grid min-w-0 overflow-hidden border-border [&+&]:border-t'

/** The row's full-width line: leading title block, trailing badge. */
export const ROW_HEADER_CLASS =
  'flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden border-0 bg-transparent px-[1.1rem] py-[0.85rem] text-left text-inherit'

export const ROW_LEADING_CLASS =
  'flex min-w-0 flex-[1_1_0] items-center gap-[0.65rem] overflow-hidden'

export const ROW_TRAILING_CLASS = 'flex shrink-0 items-center gap-2'

// Light text with a shadow, readable over a banner.
const ART_TEXT_CLASS =
  'text-[rgba(255,255,255,0.8)] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]'

/** A provider's coloured dot; `providerClass` is from providerDotClass. */
export function ProviderDot({ providerClass }: { providerClass: string }) {
  return (
    <span
      className={cn('size-2 shrink-0 rounded-full', providerClass)}
      aria-hidden="true"
    />
  )
}

/** Text in a row's detail line, cut off with an ellipsis. */
export function ListRowMetaText({
  className,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span
      className={cn('min-w-0 overflow-hidden text-ellipsis', className)}
      {...props}
    />
  )
}

/** A row's trailing number: episodes (amber while behind) or a score. */
export function ListRowCount({
  tone,
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'behind' | 'malDown' | null }) {
  return (
    <span
      className={cn(
        'shrink-0 pl-[0.35rem] text-[0.82rem] text-(--text-secondary) tabular-nums',
        tone === 'behind' && 'font-semibold text-(--warning)',
        tone === 'malDown' && 'font-semibold text-destructive',
        className
      )}
      {...props}
    />
  )
}

// One show in any list: title, English title, a detail line (plus an
// optional second one), and a trailing badge, over the show's AniList banner
// when it has one. Without a banner the cover stands in, blurred; without
// either the row is plain. The provider shows as a dot, or as a bar along the
// left edge of a banner row. Tapping it opens the show's sheet; rows hold no
// other buttons.
export function ListRow({
  id,
  title,
  titleEnglish,
  providerClass,
  bannerUrl,
  coverUrl,
  meta,
  secondaryMeta,
  trailing,
  onOpen,
}: {
  /** The row's element ID, which search results scroll to. */
  id?: string
  title: string
  titleEnglish?: string | null
  /** From providerDotClass, for Watching and On hold rows. */
  providerClass?: string
  bannerUrl?: string | null
  coverUrl?: string | null
  meta?: ReactNode
  /** A second, muted detail line under `meta`, cut off with an ellipsis. */
  secondaryMeta?: ReactNode
  trailing?: ReactNode
  onOpen: () => void
}) {
  const artUrl = bannerUrl || coverUrl
  const art = Boolean(artUrl)
  const lineClass = cn(
    'mt-[0.2rem] flex max-w-full min-w-0 items-center gap-[0.45rem] text-[0.75rem] leading-[1.3] whitespace-nowrap text-(--text-secondary)',
    art && ART_TEXT_CLASS
  )

  return (
    <article id={id} className={ROW_CLASS}>
      <button
        type="button"
        className={cn(
          ROW_HEADER_CLASS,
          art
            ? 'group relative isolate min-h-[88px] bg-[#0b0b0b]'
            : 'hover:bg-accent'
        )}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        {artUrl ? (
          <>
            <span
              className={cn(
                'absolute inset-0 -z-2 bg-cover transition-[transform] duration-300 ease-[ease] motion-reduce:transition-none',
                bannerUrl
                  ? 'bg-[position:center_30%] group-hover:transform-[scale(1.04)]'
                  : 'bg-[position:center_20%] transform-[scale(1.06)] [filter:blur(1.5px)_saturate(1.05)] group-hover:transform-[scale(1.1)]'
              )}
              style={{ backgroundImage: `url("${artUrl}")` }}
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 -z-1 bg-[linear-gradient(90deg,rgba(10,10,10,0.94)_0%,rgba(10,10,10,0.8)_45%,rgba(10,10,10,0.5)_100%)]"
              aria-hidden="true"
            />
          </>
        ) : null}
        {providerClass && artUrl ? (
          <span
            className={cn('absolute inset-y-0 left-0 w-1', providerClass)}
            aria-hidden="true"
          />
        ) : null}
        <div className={ROW_LEADING_CLASS}>
          {providerClass && !artUrl ? (
            <ProviderDot providerClass={providerClass} />
          ) : null}
          <ShowTitleDisplay
            title={title}
            titleEnglish={titleEnglish}
            className={cn(
              ROW_TITLE_CLASS,
              art &&
                'text-[0.98rem] font-bold [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]'
            )}
            subtitleClassName={art ? ART_TEXT_CLASS : undefined}
            belowSubtitle={
              meta || secondaryMeta ? (
                <>
                  {meta ? <span className={lineClass}>{meta}</span> : null}
                  {secondaryMeta ? (
                    <span
                      className={cn(
                        lineClass,
                        'mt-0',
                        art ? 'text-[rgba(255,255,255,0.65)]' : 'text-(--hint)'
                      )}
                    >
                      <ListRowMetaText>{secondaryMeta}</ListRowMetaText>
                    </span>
                  ) : null}
                </>
              ) : null
            }
          />
        </div>
        <div className={cn(ROW_TRAILING_CLASS, art && ART_TEXT_CLASS)}>
          {trailing}
          <span
            className="shrink-0 text-[1.1rem] leading-none text-(--muted) transition-[transform] duration-150 ease-[ease]"
            aria-hidden="true"
          >
            ›
          </span>
        </div>
      </button>
    </article>
  )
}
