import * as React from 'react'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Input, sized and coloured like the admin's old input rule.
 * Changed from shadcn's: always 16px text (stops iOS zooming in on focus),
 * the old padding and darker fill, a long value ends in an ellipsis, and a
 * date-and-time box drops the browser's own styling so it fits on a phone.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full max-w-full min-w-0 overflow-hidden rounded-md border border-input bg-(--input-bg) px-[0.7rem] py-[0.55rem] text-base text-ellipsis text-foreground transition-[border-color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        '[&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left [&[type=datetime-local]]:block [&[type=datetime-local]]:appearance-none',
        className
      )}
      {...props}
    />
  )
}

export { Input }
