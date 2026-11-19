'use client'

import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import {
  Sheet as SheetRoot,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsDesktop } from '@/app/components/useIsDesktop'
import { cn } from '@/components/ui/utils'

// The panel leaves out shadcn's data-slot: the scoped preflight resets
// everything inside a data-slot, and links and hints in the sheets'
// contents still take globals.css's look.
const NO_SLOT = { 'data-slot': undefined }

const CLOSE_CLASS =
  'absolute top-[0.6rem] right-3 size-9 rounded-full border-0 bg-transparent text-(--text-secondary) hover:bg-accent hover:text-foreground'

const SCROLL_CLASS =
  'overflow-y-auto overscroll-contain px-[1.1rem] pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'

// A show's details over the list: a bottom drawer on a phone or tablet,
// which a swipe down closes (from anywhere on it, once its content is
// scrolled to the top), and a panel on the right on a computer. Esc, the
// close button, the backdrop and the swipe all call `onClose`, which may
// keep the sheet open (e.g. to ask "Discard changes?" over it); a dialog
// opened over the sheet takes Esc first. Focus moves into the sheet and
// back to whatever opened it.
export function Sheet({
  title,
  onClose,
  onOpenAutoFocus,
  children,
}: {
  title: string
  onClose: () => void
  /** Moves focus somewhere in the sheet as it opens; call preventDefault. */
  onOpenAutoFocus?: (event: Event) => void
  children: ReactNode
}) {
  const isDesktop = useIsDesktop()
  const contentRef = useRef<HTMLDivElement>(null)
  const [opener] = useState(() =>
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement | null)
  )

  const contentProps = {
    ...NO_SLOT,
    ref: contentRef,
    'aria-describedby': undefined,
    onOpenAutoFocus: (event: Event) => {
      onOpenAutoFocus?.(event)
      if (event.defaultPrevented) return
      event.preventDefault()
      contentRef.current?.focus()
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (opener?.isConnected && opener !== document.body) opener.focus()
    },
  }

  const body = (
    <>
      <button
        className={CLOSE_CLASS}
        type="button"
        aria-label="Close"
        onClick={onClose}
      >
        ✕
      </button>
      <div className={SCROLL_CLASS}>{children}</div>
    </>
  )

  if (isDesktop) {
    return (
      <SheetRoot open onOpenChange={(open) => open || onClose()}>
        <SheetContent
          {...contentProps}
          className="w-[440px] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] sm:max-w-none"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {body}
        </SheetContent>
      </SheetRoot>
    )
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (open) return
        onClose()
        // A swipe that closes leaves the drawer where the finger let go; if
        // it's still open (the parent asks "Discard changes?" first), it
        // springs back up under the question.
        requestAnimationFrame(() => {
          const content = contentRef.current
          if (!content?.isConnected) return
          content.style.transform = ''
          content.style.transition = ''
          const overlay = content.previousElementSibling
          if (overlay instanceof HTMLElement) overlay.style.opacity = ''
        })
      }}
      repositionInputs={false}
    >
      <DrawerContent
        {...contentProps}
        overlayClassName="bg-black/55 motion-reduce:animate-none!"
        className="border-border bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.5)] outline-none motion-reduce:animate-none! motion-reduce:transition-none! data-[vaul-drawer-direction=bottom]:max-h-[92vh] data-[vaul-drawer-direction=bottom]:rounded-t-[18px]"
      >
        <div
          className="mx-auto mt-[0.55rem] h-[0.28rem] w-10 flex-none rounded-full bg-border"
          aria-hidden="true"
        />
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  )
}

/** A sheet's header: the show's titles and a line about it. */
export const SHEET_HERO_CLASS = 'grid gap-[0.4rem] pt-2 pr-10 pb-4 pl-0'

export const SHEET_HERO_TITLE_CLASS =
  'text-[1.15rem] leading-[1.3] font-[650] tracking-[-0.01em]'

/** The small grey line(s) under a sheet's titles. */
export const SHEET_HERO_META_CLASS = 'm-0 text-[0.8rem] text-(--text-secondary)'

/** A row of link buttons sharing the sheet's width. */
export const SHEET_LINKS_CLASS = 'flex w-full gap-2'

/** A sheet section's box: a hairline above, its parts stacked. */
export const SHEET_SECTION_CLASS = 'grid gap-3 border-t border-border px-0 py-4'

/** A sheet section's small uppercase title. */
export const SHEET_SECTION_TITLE_CLASS =
  'm-0 text-[0.72rem] font-[650] tracking-[0.08em] text-(--text-secondary) uppercase'

/** A form's fields in a sheet, stacked. */
export const SHEET_FIELDS_CLASS = 'mt-3 grid gap-[14px]'

/** A titled section of a sheet, e.g. Watch or Manage. */
export function SheetSection({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section className={SHEET_SECTION_CLASS}>
      <h3 className={SHEET_SECTION_TITLE_CLASS}>{title}</h3>
      {children}
    </section>
  )
}

/**
 * A row of a sheet's buttons, wrapping as needed. `sticky` keeps it at the
 * sheet's bottom, so Save stays in reach under a long Setup.
 */
export function SheetActions({
  sticky = false,
  className,
  ...props
}: ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-start gap-3',
        sticky &&
          'sticky bottom-[calc(-1.5rem-env(safe-area-inset-bottom))] bg-card px-0 py-3',
        className
      )}
      {...props}
    />
  )
}
