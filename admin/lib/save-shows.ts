import { updateRepoFiles } from './github'
import type { Show } from '@shared/types'

/** The shows list changed since the editor loaded it. */
export class ShowsChangedError extends Error {
  constructor() {
    super('Shows changed elsewhere, reload')
    this.name = 'ShowsChangedError'
  }
}

/**
 * Replaces the whole shows list, but only if shows.json is still at
 * `expectedVersion` (the version the editor loaded), so a save never erases
 * shows added elsewhere in the meantime.
 */
export async function saveShowsList(
  shows: Show[],
  expectedVersion: string
): Promise<{ version: string | null; removedIds: string[] }> {
  let removedIds: string[] = []
  const { versions } = await updateRepoFiles(
    ['shows.json'],
    ({ 'shows.json': showsFile }, current) => {
      if (current['shows.json'] !== expectedVersion) {
        throw new ShowsChangedError()
      }

      const newIds = new Set(shows.map((show) => show.id))
      removedIds = (showsFile.shows ?? [])
        .map((show) => show.id)
        .filter((id) => !newIds.has(id))
      return { 'shows.json': { ...showsFile, shows } }
    },
    'chore: 🧹 update shows from admin CMS'
  )

  return { version: versions['shows.json'], removedIds }
}
