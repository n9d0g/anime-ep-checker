// Decides when the floating tab bar shrinks: scrolling down shrinks it,
// scrolling up grows it back, and it stays full size near either end of the
// page so the first and last rows are easy to reach.

/** Scroll distance, in px, in one direction before the bar changes size. */
export const SCROLL_THRESHOLD_PX = 8

/** Within this many px of the top or bottom of the page, the bar is full size. */
export const EDGE_PX = 16

export type TabBarScrollState = {
  compact: boolean
  /** Scroll position the current run of movement is measured from. */
  anchorY: number
}

export type ScrollPosition = {
  scrollY: number
  viewportHeight: number
  pageHeight: number
}

export function initialTabBarScroll(scrollY: number): TabBarScrollState {
  return { compact: false, anchorY: scrollY }
}

export function nextTabBarScroll(
  state: TabBarScrollState,
  { scrollY, viewportHeight, pageHeight }: ScrollPosition
): TabBarScrollState {
  const nearTop = scrollY <= EDGE_PX
  const nearBottom = scrollY + viewportHeight >= pageHeight - EDGE_PX
  if (nearTop || nearBottom) {
    return { compact: false, anchorY: scrollY }
  }

  const delta = scrollY - state.anchorY
  if (delta >= SCROLL_THRESHOLD_PX) {
    return { compact: true, anchorY: scrollY }
  }
  if (delta <= -SCROLL_THRESHOLD_PX) {
    return { compact: false, anchorY: scrollY }
  }

  // Not far enough yet. While compact, follow further downward movement (and
  // while full size, further upward movement) so a reversal is measured from
  // where it began.
  if (state.compact ? delta > 0 : delta < 0) {
    return { ...state, anchorY: scrollY }
  }
  return state
}
