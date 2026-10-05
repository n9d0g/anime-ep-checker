import type { ReactNode } from 'react'
import { shouldShowEnglishSubtitle } from '@/lib/show-title'

export function ShowTitleDisplay({
  title,
  titleEnglish,
  className = 'show-row-title',
  belowSubtitle = null,
}: {
  title: string
  titleEnglish?: string | null
  className?: string
  belowSubtitle?: ReactNode
}) {
  const showSubtitle = shouldShowEnglishSubtitle(title, titleEnglish)

  return (
    <span className="show-row-title-block">
      <span className={className}>{title}</span>
      {showSubtitle ? (
        <span className="show-row-subtitle">{titleEnglish}</span>
      ) : null}
      {belowSubtitle}
    </span>
  )
}
