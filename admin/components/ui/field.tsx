import * as React from 'react'
import { cn } from '@/components/ui/utils'

/*
 * A form field's layout and its hint, after shadcn/ui's Field and
 * FieldDescription. Unlike the other parts here they set no data-slot yet:
 * the scoped reset in styles.css would also reach what's inside them, and a
 * field still holds parts styled by globals.css (text buttons in a hint). Add data-slot when Tailwind's full reset is on (#94).
 */

/** A label, its control and any hints, stacked. */
function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('grid min-w-0 gap-[0.35rem]', className)} {...props} />
  )
}

/** Small grey help text, under a field or on its own. */
function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'mt-[0.2rem] mb-0 text-[0.78rem] leading-[1.4] font-normal tracking-normal text-(--hint) normal-case [&_strong]:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldDescription }
