import type {
  OnHoldSnapshotEntry,
  ReturnAnnouncement,
  StateFile,
} from '@shared/types'

/** An On hold show awaiting return whose return the checker has alerted. */
export interface ReturningShow {
  entry: OnHoldSnapshotEntry
  announcement: ReturnAnnouncement
}

/**
 * Marks or unmarks an On hold show as awaiting return. Marking clears the
 * last daily return check, so the next run reads its news straight away.
 */
export function setAwaitingReturn(
  state: StateFile,
  showId: string,
  {
    awaiting,
    officialNewsUrl,
  }: { awaiting: boolean; officialNewsUrl?: string | null },
  now: Date
): StateFile {
  const entries = state.meta?.onHold?.entries ?? []
  const entry = entries.find((item) => item.show.id === showId)
  if (!entry) {
    throw new Error(`On-hold entry not found: ${showId}`)
  }

  const url = officialNewsUrl?.trim() || null
  if (url && !/^https?:\/\/\S+$/.test(url)) {
    throw new Error('Official news URL must start with http:// or https://')
  }

  const awaitingReturn = awaiting
    ? {
        officialNewsUrl: url,
        markedAt: entry.awaitingReturn?.markedAt ?? now.toISOString(),
      }
    : null

  return {
    ...state,
    meta: {
      ...state.meta,
      ...(awaiting ? { returnCheckedAt: null } : {}),
      onHold: {
        updatedAt: now.toISOString(),
        entries: entries.map((item) =>
          item.show.id === showId ? { ...item, awaitingReturn } : item
        ),
      },
    },
  }
}

/** Shows awaiting return with an alerted return announcement (for the inbox). */
export function getReturningShows(state: StateFile): ReturningShow[] {
  const announcements = state.meta?.returnAnnouncements ?? {}
  return (state.meta?.onHold?.entries ?? []).flatMap((entry) => {
    const announcement = announcements[entry.show.id]
    return entry.awaitingReturn && announcement ? [{ entry, announcement }] : []
  })
}

/** "Returns Jul 5, 2027", "Returns July 2027" or "Return announced, date TBA". */
export function formatReturn(announcement: ReturnAnnouncement): string {
  if (announcement.returnsOn) {
    const label = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${announcement.returnsOn}T00:00:00Z`))
    return `Returns ${label} (JST)`
  }
  if (announcement.returnsIn) {
    return `Returns ${announcement.returnsIn}`
  }
  return 'Return announced, date TBA'
}
