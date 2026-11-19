import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Badge, in the look of the admin's old `.chip`: a small pill
 * for a Watching row's schedule state, or the running Release.
 * Changed from shadcn's:
 * - no border, a soft tinted fill and 1-line-high text;
 * - `default` is grey, `amber` a warning (announced break, still waiting),
 *   `blue` an active state (dropping now), `accent` the brand tint;
 * - long text may wrap, as the old chip's did.
 */
const badgeVariants = cva(
  'inline-flex flex-none items-center rounded-full px-2 py-1 text-[0.7rem] leading-none font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-(--chip-grey-soft) text-(--text-secondary)',
        amber: 'bg-(--chip-amber-soft) text-(--chip-amber)',
        blue: 'bg-(--chip-blue-soft) text-(--chip-blue)',
        accent: 'bg-(--accent-soft) text-(--accent-hover)',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
