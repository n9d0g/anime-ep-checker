import type { ReactNode } from 'react'

// The clickable header of an expandable list row: title on the left, then
// any trailing details and the expand chevron on the right.
export function ExpandableRowHeader({
  open,
  onToggle,
  leading,
  trailing,
  className = 'show-row-header',
}: {
  open: boolean
  onToggle: () => void
  leading: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={className}
      aria-expanded={open}
      onClick={onToggle}
    >
      <div className="show-row-leading">{leading}</div>
      <div className="show-row-trailing">
        {trailing}
        <span className={`chevron ${open ? 'expanded' : ''}`}>▼</span>
      </div>
    </button>
  )
}
