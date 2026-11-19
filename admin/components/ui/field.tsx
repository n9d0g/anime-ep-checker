import * as React from 'react'
import { cn } from '@/components/ui/utils'

/*
 * A form field's layout and its hint, after shadcn/ui's Field and
 * FieldDescription.
 */

/** A label, its control and any hints, stacked. */
function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('grid min-w-0 gap-[0.35rem]', className)}
      {...props}
    />
  )
}

/** Small grey help text, under a field or on its own. */
function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'mt-[0.2rem] text-[0.78rem] leading-[1.4] font-normal tracking-normal text-(--hint) normal-case [&_strong]:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldDescription }
