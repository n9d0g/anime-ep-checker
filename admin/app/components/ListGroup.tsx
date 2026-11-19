'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/components/ui/utils'

/** The box around a list's rows. */
export function ShowList({ className, ...props }: ComponentProps<'div'>) {
  return <Card className={cn('overflow-hidden p-0', className)} {...props} />
}

// A collapsible group of rows with its count. `forceOpen` shows it while a
// filter is active, without forgetting whether you had it open.
export function ListGroup({
  title,
  count,
  defaultOpen,
  forceOpen = false,
  children,
}: {
  title: string
  count: number
  defaultOpen: boolean
  forceOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shown = open || forceOpen

  return (
    <section className="grid gap-2">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-[0.1rem] py-[0.35rem] text-left text-[0.95rem] font-[650] text-foreground"
        aria-expanded={shown}
        onClick={() => setOpen(!shown)}
      >
        <span>{title}</span>
        <span className="text-[0.82rem] font-medium text-(--muted) tabular-nums">
          {count}
        </span>
        <span
          className={cn(
            'ml-auto text-[1.1rem] leading-none text-(--muted) transition-[transform] duration-150 ease-[ease]',
            shown && 'transform-[rotate(90deg)]'
          )}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {shown ? <ShowList>{children}</ShowList> : null}
    </section>
  )
}
