'use client'

import { useState, type ReactNode } from 'react'

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
    <section className="list-group">
      <button
        type="button"
        className="list-group-header"
        aria-expanded={shown}
        onClick={() => setOpen(!shown)}
      >
        <span>{title}</span>
        <span className="list-group-count">{count}</span>
        <span
          className={`list-group-chevron${shown ? ' open' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {shown ? <div className="panel show-list">{children}</div> : null}
    </section>
  )
}
