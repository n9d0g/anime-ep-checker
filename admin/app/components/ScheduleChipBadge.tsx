import { Badge } from '@/components/ui/badge'
import type { ScheduleChip, ScheduleChipKind } from '@/lib/schedule-chip'

// The tone follows the state: amber needs a look, blue is happening now.
const VARIANTS: Record<ScheduleChipKind, 'default' | 'amber' | 'blue'> = {
  announced_break: 'amber',
  still_waiting: 'amber',
  dropping_now: 'blue',
  provider_lag: 'default',
  break: 'default',
}

/** A Watching show's one schedule state, as a pill. */
export function ScheduleChipBadge({ chip }: { chip: ScheduleChip }) {
  return (
    <Badge variant={VARIANTS[chip.kind]} className="[text-shadow:none]">
      {chip.label}
    </Badge>
  )
}
