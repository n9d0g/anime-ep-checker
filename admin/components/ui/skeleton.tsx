import type { ComponentProps } from 'react'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Skeleton, in the look of the admin's old `.skeleton`: the
 * raised panel colour, pulsing between 45% and 85% opacity every 1.4s
 * (still, at 65%, for reduced motion).
 */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'block animate-skeleton-pulse rounded-md bg-accent motion-reduce:animate-none motion-reduce:opacity-65',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
