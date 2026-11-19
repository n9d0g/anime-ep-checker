import * as React from 'react'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Card, in the look of the admin's old `.panel`: the bordered
 * box on the page's background. Changed from shadcn's: the panel's radius
 * and padding, no shadow, and no gap or column layout (pass your own).
 * Only the box for now; the header, title and content parts come with the
 * pages that need them.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-lg border border-border bg-card px-5 py-[1.1rem] text-card-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Card }
