'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Dialog, sized and coloured like the admin's old modal.
 * Changed from shadcn's:
 * - the panel is 22rem wide (less on a phone, with 1.25rem either side),
 *   centred, in the panel colour, and scrolls inside if taller than the
 *   screen; it sits above the show sheet;
 * - no close (X) button: each dialog has its own Cancel;
 * - the header and footer don't add a gap; the description spaces itself;
 * - focus goes back to whatever had it when the dialog opened;
 * - no open/close animations (they need tw-animate-css, which we don't load).
 */

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>
) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-900 bg-black/55', className)}
      {...props}
    />
  )
}

// Radix hands focus back to the Trigger on close; these dialogs mostly open
// without one (from a sheet or a list row), so focus goes back to whatever
// had it when the dialog opened, if that's still on the page.
function useReturnFocus(
  onCloseAutoFocus: ((event: Event) => void) | undefined
) {
  const [opener] = React.useState(() =>
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement | null)
  )
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented || !opener?.isConnected) return
    if (opener === document.body) return
    event.preventDefault()
    opener.focus()
  }
}

function DialogContent({
  className,
  children,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const returnFocus = useReturnFocus(onCloseAutoFocus)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-900 max-h-[calc(100dvh-2.5rem)] w-[min(22rem,calc(100%-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-card p-5 text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,0.45)] outline-none',
          className
        )}
        onCloseAutoFocus={returnFocus}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-wrap justify-end gap-2', className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'text-[1.05rem] font-semibold tracking-[-0.01em] text-foreground',
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'mt-[0.45rem] mb-4 text-[0.82rem] leading-[1.45] text-(--text-secondary)',
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
