'use client'

import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/*
 * shadcn/ui's Toaster, on sonner: short messages that go away on their own.
 * Changed from shadcn's: no next-themes (the admin is always dark), and the
 * colours are the admin's tokens (styles.css), so success and error toasts look as they
 * did. Bottom right on a computer; on a phone or tablet, along the bottom and
 * above the floating tab bar (--toast-offset-bottom, styles.css).
 */
function Toaster(props: ToasterProps) {
  const offset = { bottom: 'var(--toast-offset-bottom)' }
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={offset}
      mobileOffset={offset}
      duration={3500}
      richColors
      toastOptions={{
        classNames: {
          actionButton: 'bg-primary! text-primary-foreground! font-semibold!',
        },
      }}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--panel)',
          '--normal-text': 'var(--text)',
          '--normal-border': 'var(--border)',
          '--success-bg':
            'color-mix(in srgb, var(--success) 32%, var(--panel-raised))',
          '--success-border':
            'color-mix(in srgb, var(--success) 55%, var(--border))',
          '--success-text': 'var(--text)',
          '--error-bg': 'var(--panel)',
          '--error-border':
            'color-mix(in srgb, var(--danger) 45%, var(--border))',
          '--error-text': 'var(--danger)',
          '--border-radius': '0.5rem',
          fontFamily: 'var(--font-sans)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
