// Search results link to `/<list>#show-<id>`; the list page scrolls to and
// flashes that row. The row may not exist yet (the list renders after its
// data loads), so a request stays pending until the row can be found.

const SHOW_HASH_PREFIX = '#show-'

/** The element id a `#show-<id>` hash points at, or null for any other hash. */
export function targetIdFromHash(hash: string): string | null {
  if (!hash.startsWith(SHOW_HASH_PREFIX) || hash === SHOW_HASH_PREFIX) {
    return null
  }
  return hash.slice(1)
}

/** The MAL id of a plan-to-watch or watched row's element id (`show-<malId>`). */
export function malIdFromElementId(elementId: string): number | null {
  const match = /^show-(\d+)$/.exec(elementId)
  return match ? Number(match[1]) : null
}

export function pathOf(href: string): string {
  const index = href.indexOf('#')
  return index === -1 ? href : href.slice(0, index)
}

export function hashOf(href: string): string {
  const index = href.indexOf('#')
  return index === -1 ? '' : href.slice(index)
}

/**
 * How long a highlight request waits for its row. A row that never renders
 * (stale search index, hidden by a filter) shouldn't flash much later.
 */
export const HIGHLIGHT_REQUEST_TTL_MS = 10_000

export function createHighlightTracker() {
  let pendingId: string | null = null
  let requestedAt = 0

  return {
    /** Ask for the row a hash points at to be highlighted. */
    request(hash: string, now = Date.now()): string | null {
      pendingId = targetIdFromHash(hash)
      requestedAt = now
      return pendingId
    },
    pending(): string | null {
      return pendingId
    },
    /** The id to highlight now, if its row exists; each request is taken once. */
    take(exists: (id: string) => boolean, now = Date.now()): string | null {
      if (pendingId !== null && now - requestedAt > HIGHLIGHT_REQUEST_TTL_MS) {
        pendingId = null
      }
      if (pendingId === null || !exists(pendingId)) {
        return null
      }
      const id = pendingId
      pendingId = null
      return id
    },
  }
}
