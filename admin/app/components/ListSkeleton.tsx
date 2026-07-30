import type { CSSProperties } from 'react'

function SkeletonBar({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />
}

function ShowListSkeletonRow({
  titleWidth,
}: {
  titleWidth: string
}) {
  return (
    <article className="show-row">
      <div className="show-row-header skeleton-row">
        <div className="show-row-leading">
          <SkeletonBar className="skeleton-dot" />
          <SkeletonBar className="skeleton-title" style={{ width: titleWidth }} />
        </div>
        <div className="show-row-trailing">
          <SkeletonBar className="skeleton-meta" />
          <SkeletonBar className="skeleton-chevron" />
        </div>
      </div>
    </article>
  )
}

const WATCHING_TITLE_WIDTHS = ['58%', '44%', '65%', '50%', '72%', '47%']

export function ShowListSkeleton() {
  return (
    <div
      className="panel show-list"
      aria-busy="true"
      aria-label="Loading shows"
    >
      {WATCHING_TITLE_WIDTHS.map((titleWidth, index) => (
        <ShowListSkeletonRow key={index} titleWidth={titleWidth} />
      ))}
    </div>
  )
}

function PtwSectionSkeleton({ rowCount }: { rowCount: number }) {
  const titleWidths = ['52%', '68%', '41%', '59%', '47%', '63%']

  return (
    <section className="stack">
      <SkeletonBar className="skeleton-heading" />
      <div className="panel show-list">
        {Array.from({ length: rowCount }, (_, index) => (
          <article className="show-row" key={index}>
            <div className="show-row-header skeleton-row">
              <div className="show-row-leading">
                <SkeletonBar
                  className="skeleton-title"
                  style={{ width: titleWidths[index % titleWidths.length] }}
                />
              </div>
              <div className="show-row-trailing">
                <SkeletonBar className="skeleton-meta" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function PtwListSkeleton() {
  return (
    <div
      className="stack ptw-sections"
      aria-busy="true"
      aria-label="Loading plan-to-watch list"
    >
      <PtwSectionSkeleton rowCount={3} />
      <PtwSectionSkeleton rowCount={4} />
      <PtwSectionSkeleton rowCount={2} />
    </div>
  )
}
