'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Toggle, in the look of the admin's old segmented control.
 * Changed from shadcn's:
 * - no fixed height: padding and the page's line height size it, and a long
 *   label can wrap;
 * - grey semibold text that turns white on hover; "on" is the raised panel
 *   with a hairline inset border (as the old `.segmented button.active`);
 * - the focus ring is drawn inside, so a joined group's edge doesn't clip it.
 */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 text-center font-semibold text-muted-foreground transition-all duration-100 ease-[ease] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:inset-ring-2 focus-visible:inset-ring-ring disabled:cursor-not-allowed disabled:opacity-60 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-border data-[state=on]:focus-visible:inset-ring-2 data-[state=on]:focus-visible:inset-ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
      },
      size: {
        default: 'px-3 py-[0.45rem] text-[0.8rem]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
