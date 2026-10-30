import { apiFetch } from './api-fetch'
import type { PlanToWatchSnapshotEntry } from '@shared/types'
import type { ShowFormValues } from './types'

/**
 * Moves a Plan to watch show to Watching: adds it to shows.json and marks it
 * watching on MAL. Shared by the Plan to watch page and the Watching inbox.
 */
export async function requestMoveToWatching(
  entry: PlanToWatchSnapshotEntry,
  values: ShowFormValues
): Promise<{ malUpdated?: boolean; workflowTriggered?: boolean }> {
  return apiFetch('/api/ptw/watch', {
    method: 'POST',
    json: {
      malId: entry.malId,
      title: entry.title,
      titleEnglish: entry.titleEnglish,
      provider: values.provider,
      crunchyrollUrl: values.crunchyrollUrl,
      netflixUrl: values.netflixUrl,
      disneyUrl: values.disneyUrl,
      schedule: values.schedule,
    },
    errorMessage: 'Failed to move show to watching',
  })
}

/** The toast after a move, by what the server managed to do. */
export function moveToWatchingMessage(result: {
  malUpdated?: boolean
  workflowTriggered?: boolean
}): string {
  if (!result.malUpdated) {
    return 'Added to watching. MAL status could not be updated — mark it watching there if needed.'
  }
  return result.workflowTriggered
    ? 'Moved to watching. The dashboard will refresh shortly.'
    : 'Moved to watching.'
}
