'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * One choice of a few, as joined buttons (a single-choice ToggleGroup). The
 * arrow keys move between them; choosing the current one again keeps it.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix clears the value when the chosen button is pressed again.
        if (next) {
          onChange(next as T)
        }
      }}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
