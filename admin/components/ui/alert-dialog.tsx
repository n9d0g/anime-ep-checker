'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/utils'

/*
 * shadcn/ui's Alert dialog, for "are you sure?" before something that can't
 * easily be undone, looking like the admin's Dialog. Changed from shadcn's:
 * - the panel is the Dialog's: 22rem wide, centred, in the panel colour,
 *   above the show sheet;
 * - `onOverlayClick` lets a click on the backdrop cancel, as the admin's old
 *   modal did (radix's alert dialog otherwise ignores it);
 * - the header and footer don't add a gap; the description spaces itself;
 * - focus goes back to whatever had it when the dialog opened;
 * - no open/close animations (they need tw-animate-css, which we don't load).
 */

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>
) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
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

function AlertDialogContent({
  className,
  onOverlayClick,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  onOverlayClick?: () => void
}) {
  const returnFocus = useReturnFocus(onCloseAutoFocus)
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay onClick={onOverlayClick} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        onCloseAutoFocus={returnFocus}
        className={cn(
          'fixed top-1/2 left-1/2 z-900 max-h-[calc(100dvh-2.5rem)] w-[min(22rem,calc(100%-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-card p-5 text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,0.45)] outline-none',
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col', className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-wrap justify-end gap-2', className)}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-[1.05rem] font-semibold tracking-[-0.01em] text-foreground',
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        'mt-[0.45rem] mb-4 text-[0.82rem] leading-[1.45] text-(--text-secondary)',
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
