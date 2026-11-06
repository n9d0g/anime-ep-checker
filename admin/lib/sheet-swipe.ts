// Swipe-to-close for the phone bottom sheet: how far it moves under the
// finger, and whether letting go closes it or springs it back.

/** Share of the sheet's height a slow drag must pass to close it. */
export const SHEET_DISMISS_FRACTION = 0.25

/** Downward speed (px/ms) at which a flick closes the sheet regardless. */
export const SHEET_DISMISS_VELOCITY = 0.5

/** Upward drags move the sheet this fraction of the finger's travel. */
const UPWARD_RESISTANCE = 0.2

/** Where the sheet sits for a finger `dy` px below where the drag began. */
export function sheetDragOffset(dy: number): number {
  return dy >= 0 ? dy : dy * UPWARD_RESISTANCE
}

/**
 * Whether letting go closes the sheet: a quick downward flick, or a drag
 * past a quarter of its height that isn't heading back up.
 */
export function shouldDismissSheet({
  distance,
  height,
  velocity,
}: {
  distance: number
  height: number
  velocity: number
}): boolean {
  if (velocity >= SHEET_DISMISS_VELOCITY) return true
  if (velocity <= -SHEET_DISMISS_VELOCITY) return false
  return distance > height * SHEET_DISMISS_FRACTION
}
