'use client'

import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Label, in the admin's small grey caps. Changed from shadcn's:
 * it keeps the page's line height and wraps anywhere (long field names on a
 * phone). With asChild it titles a field that isn't a single input, e.g. a
 * segmented control.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-[0.72rem] font-medium tracking-[0.06em] wrap-anywhere text-muted-foreground uppercase select-none',
        className
      )}
      {...props}
    />
  )
}

export { Label }
