'use client'

import * as React from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Sheet: a dialog that slides in from an edge. Changed from
 * shadcn's:
 * - no close (X) button: each sheet brings its own;
 * - it slides in and the overlay fades in with CSS transitions from
 *   @starting-style (shadcn's animations need tw-animate-css, which we don't
 *   load), and stays still when reduced motion is asked for;
 * - the overlay is lighter and the panel uses the panel colour.
 */

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal(
  props: React.ComponentProps<typeof SheetPrimitive.Portal>
) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  )
}

const SIDE_CLASSES = {
  right:
    'inset-y-0 right-0 h-full w-3/4 border-l starting:translate-x-full sm:max-w-sm',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r starting:-translate-x-full sm:max-w-sm',
  top: 'inset-x-0 top-0 h-auto border-b starting:-translate-y-full',
  bottom: 'inset-x-0 bottom-0 h-auto border-t starting:translate-y-full',
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDE_CLASSES
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col border-border bg-card text-card-foreground shadow-lg outline-none transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
          SIDE_CLASSES[side],
          className
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
