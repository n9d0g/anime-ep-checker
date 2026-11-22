import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Button, sized and coloured like the admin's old `.btn`.
 * Changed from shadcn's:
 * - no fixed height: padding and the page's line height size it, and a long
 *   label can wrap;
 * - `outline` is the old secondary button: transparent with grey text;
 * - `destructive-link` is red text that underlines on hover, for "Remove
 *   show" (with size `inline`);
 * - `link` is underlined text that turns the brand colour on hover, for a
 *   small action inside text (with size `text`, which keeps the text's size);
 * - `ghost` is grey text on nothing that fills in on hover, for a bare icon
 *   button (with size `icon`), like the header's search;
 * - disabled keeps its cursor (not-allowed) rather than ignoring the pointer.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-center font-semibold no-underline transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:not-disabled:bg-(--accent-hover)',
        outline:
          'border border-border bg-transparent text-(--text-secondary) hover:not-disabled:bg-accent',
        destructive:
          'bg-destructive text-white hover:not-disabled:bg-[color-mix(in_srgb,var(--danger)_85%,white)]',
        'destructive-link':
          'bg-transparent text-destructive hover:not-disabled:underline',
        ghost:
          'bg-transparent text-(--text-secondary) hover:not-disabled:bg-accent hover:not-disabled:text-foreground',
        link: 'bg-transparent text-foreground underline underline-offset-2 transition-none hover:not-disabled:text-(--accent-hover)',
      },
      size: {
        default: 'px-4 py-2 text-[0.82rem]',
        sm: 'px-[0.7rem] py-[0.38rem] text-[0.78rem]',
        icon: 'size-9 flex-none rounded-full p-0 text-[1.3rem] leading-none font-normal',
        inline: 'p-0 text-[0.78rem]',
        text: 'p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
