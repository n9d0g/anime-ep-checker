const DISMISSED_KEY = 'aec-admin-inbox-dismissed-v1'

/**
 * The Watching inbox's item count, for the Watching tab's badge: the page
 * publishes it and the tabs, in the shared layout, subscribe. Null until the
 * Watching page has worked it out this session.
 */
function createInboxCountStore() {
  let count: number | null = null
  const listeners = new Set<() => void>()

  return {
    get: (): number | null => count,
    set(next: number | null) {
      if (next === count) {
        return
      }
      count = next
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const inboxCount = createInboxCountStore()

/** Inbox items put off with "Not now", kept in this browser. */
export function readDismissedInboxKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function writeDismissedInboxKeys(keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys]))
  } catch {
    // Without storage, "Not now" lasts until the page reloads.
  }
}
