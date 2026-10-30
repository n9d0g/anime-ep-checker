'use client'

import { useEffect, useId, type ReactNode } from 'react'

// A modal dialog: backdrop, panel, title, optional subtitle, body and a
// Cancel button beside the primary action. Escape and clicks outside the
// panel cancel, unless the modal is mid-submit. With `onSubmit` the panel is
// a form, so the primary action can be a submit button.
export function Modal({
  title,
  subtitle,
  wide = false,
  submitting,
  onCancel,
  onSubmit,
  primaryAction,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  wide?: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit?: () => void
  primaryAction: ReactNode
  children?: ReactNode
}) {
  const titleId = useId()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && !submitting) {
        onCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, submitting])

  const content = (
    <>
      <h2 id={titleId} className="modal-title">
        {title}
      </h2>
      {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
      {children}
      <div className="modal-actions">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        {primaryAction}
      </div>
    </>
  )
  const panelProps = {
    className: `modal-panel${wide ? ' modal-panel-wide' : ''}`,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
  } as const

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel()
        }
      }}
    >
      {onSubmit ? (
        <form
          {...panelProps}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          {content}
        </form>
      ) : (
        <div {...panelProps}>{content}</div>
      )}
    </div>
  )
}
