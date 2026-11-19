import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/components/ui/utils'
import { ShowList } from '@/app/components/ListGroup'
import {
  ROW_CLASS,
  ROW_HEADER_CLASS,
  ROW_LEADING_CLASS,
  ROW_TRAILING_CLASS,
} from '@/app/components/ListRow'

const TITLE_CLASS = 'h-[0.88rem] min-w-16 max-w-full'
const META_CLASS = 'h-[0.78rem] w-[3.25rem] shrink-0'

function ShowListSkeletonRow({ titleWidth }: { titleWidth: string }) {
  return (
    <article className={ROW_CLASS}>
      <div className={cn(ROW_HEADER_CLASS, 'pointer-events-none')}>
        <div className={ROW_LEADING_CLASS}>
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <Skeleton className={TITLE_CLASS} style={{ width: titleWidth }} />
        </div>
        <div className={ROW_TRAILING_CLASS}>
          <Skeleton className={META_CLASS} />
          <Skeleton className="size-[0.55rem] shrink-0 rounded-[2px]" />
        </div>
      </div>
    </article>
  )
}

const WATCHING_TITLE_WIDTHS = ['58%', '44%', '65%', '50%', '72%', '47%']

export function ShowListSkeleton() {
  return (
    <ShowList aria-busy="true" aria-label="Loading shows">
      {WATCHING_TITLE_WIDTHS.map((titleWidth, index) => (
        <ShowListSkeletonRow key={index} titleWidth={titleWidth} />
      ))}
    </ShowList>
  )
}

// A plan-to-watch row: the title and its detail stack on a phone.
function PtwSectionSkeleton({ rowCount }: { rowCount: number }) {
  const titleWidths = ['52%', '68%', '41%', '59%', '47%', '63%']

  return (
    <section className="stack">
      <Skeleton className="h-4 w-20" />
      <ShowList>
        {Array.from({ length: rowCount }, (_, index) => (
          <article className={ROW_CLASS} key={index}>
            <div
              className={cn(
                ROW_HEADER_CLASS,
                'pointer-events-none overflow-visible'
              )}
            >
              <div className="flex min-w-0 items-center justify-between gap-3 max-[641px]:flex-col max-[641px]:items-stretch max-[641px]:justify-center max-[641px]:gap-[0.15rem]">
                <div
                  className={cn(
                    ROW_LEADING_CLASS,
                    'max-[641px]:w-full max-[641px]:flex-[0_1_auto]'
                  )}
                >
                  <Skeleton
                    className={TITLE_CLASS}
                    style={{ width: titleWidths[index % titleWidths.length] }}
                  />
                </div>
                <div
                  className={cn(
                    ROW_TRAILING_CLASS,
                    'max-[641px]:justify-start'
                  )}
                >
                  <Skeleton className={META_CLASS} />
                </div>
              </div>
              <Skeleton className="h-8 w-14 shrink-0" />
            </div>
          </article>
        ))}
      </ShowList>
    </section>
  )
}

export function PtwListSkeleton() {
  return (
    <div
      className="stack"
      aria-busy="true"
      aria-label="Loading plan-to-watch list"
    >
      <PtwSectionSkeleton rowCount={3} />
      <PtwSectionSkeleton rowCount={4} />
      <PtwSectionSkeleton rowCount={2} />
    </div>
  )
}
