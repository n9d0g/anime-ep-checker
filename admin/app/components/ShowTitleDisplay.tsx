import type { ReactNode } from 'react'
import { cn } from '@/components/ui/utils'
import { shouldShowEnglishSubtitle } from '@/lib/show-title'

/** A list row's title: one line, cut off with an ellipsis. */
export const ROW_TITLE_CLASS =
  'max-w-full min-w-0 truncate text-[0.92rem] font-semibold'

// A show's title, with its English title under it when that differs, and
// anything else (a row's detail lines) below.
export function ShowTitleDisplay({
  title,
  titleEnglish,
  className = ROW_TITLE_CLASS,
  subtitleClassName,
  belowSubtitle = null,
}: {
  title: string
  titleEnglish?: string | null
  /** The title's classes, in place of a list row's. */
  className?: string
  /** Added to the English title's classes. */
  subtitleClassName?: string
  belowSubtitle?: ReactNode
}) {
  const showSubtitle = shouldShowEnglishSubtitle(title, titleEnglish)

  return (
    <span className="flex min-w-0 flex-col gap-[0.12rem]">
      <span className={className}>{title}</span>
      {showSubtitle ? (
        <span
          className={cn(
            'max-w-full truncate text-[0.78rem] leading-[1.25] text-(--hint) italic',
            subtitleClassName
          )}
        >
          {titleEnglish}
        </span>
      ) : null}
      {belowSubtitle}
    </span>
  )
}
