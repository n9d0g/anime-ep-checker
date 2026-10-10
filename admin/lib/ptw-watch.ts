import { normalizeBroadcastTime, RELEASE_BUFFER_MS } from './broadcast'
import { slugify } from './slugify'
import { fromDatetimeLocalValue, toDatetimeLocalValue } from './time'
import {
  emptyShowForm,
  type PlanToWatchSnapshotEntry,
  type ShowFormValues,
} from './types'

export type UnknownWatchField = 'provider' | 'startAt' | 'episodeCount'

const FULL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function suggestStartAt(entry: PlanToWatchSnapshotEntry): string {
  const startDate = entry.startDate?.trim() ?? ''
  if (!FULL_DATE_PATTERN.test(startDate)) {
    return ''
  }

  const time = entry.broadcast?.startTime
    ? normalizeBroadcastTime(entry.broadcast.startTime)
    : null
  if (!time) {
    return ''
  }

  const broadcastAt = fromDatetimeLocalValue(`${startDate}T${time}`)
  if (!broadcastAt) {
    return ''
  }

  return toDatetimeLocalValue(
    new Date(new Date(broadcastAt).getTime() + RELEASE_BUFFER_MS).toISOString()
  )
}

export function hasKnownStartAt(entry: PlanToWatchSnapshotEntry): boolean {
  return Boolean(suggestStartAt(entry))
}

export function hasKnownEpisodeCount(entry: PlanToWatchSnapshotEntry): boolean {
  return typeof entry.numEpisodes === 'number' && entry.numEpisodes > 0
}

export function unknownWatchFields(
  entry: PlanToWatchSnapshotEntry
): UnknownWatchField[] {
  const fields: UnknownWatchField[] = ['provider']

  if (!hasKnownStartAt(entry)) {
    fields.push('startAt')
  }

  if (!hasKnownEpisodeCount(entry)) {
    fields.push('episodeCount')
  }

  return fields
}

export function unknownWatchFieldLabels(
  entry: PlanToWatchSnapshotEntry
): string[] {
  return unknownWatchFields(entry).map((field) => {
    if (field === 'provider') {
      return 'streaming service and URL'
    }
    if (field === 'startAt') {
      return 'start date and time'
    }
    return 'number of episodes'
  })
}

export function watchFormDefaults(
  entry: PlanToWatchSnapshotEntry
): ShowFormValues {
  const form = emptyShowForm()
  const episodeCountKnown = hasKnownEpisodeCount(entry)

  return {
    ...form,
    title: entry.title,
    malId: String(entry.malId),
    schedule: {
      ...form.schedule,
      startAt: suggestStartAt(entry),
      episodeCount: episodeCountKnown ? String(entry.numEpisodes) : '',
      startEpisode: '1',
      premiereBatchSize: '1',
    },
  }
}

export function uniqueShowId(
  title: string,
  malId: number,
  existingIds: Iterable<string>
): string {
  const taken = new Set(existingIds)
  const base = slugify(title) || `mal-${malId}`
  if (!taken.has(base)) {
    return base
  }

  const withMal = slugify(`${title}-${malId}`) || `mal-${malId}`
  if (!taken.has(withMal)) {
    return withMal
  }

  let suffix = 2
  while (taken.has(`${withMal}-${suffix}`)) {
    suffix += 1
  }
  return `${withMal}-${suffix}`
}
