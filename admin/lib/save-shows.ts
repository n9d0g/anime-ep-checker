import { updateRepoFiles } from './github'
import { showToForm } from './show-form'
import type { Show } from '@shared/types'
import type { ShowFormValues } from './types'

/** The show was changed or removed elsewhere since the editor loaded it. */
export class ShowChangedError extends Error {
  constructor() {
    super('This show changed elsewhere; reload to see the latest')
    this.name = 'ShowChangedError'
  }
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))
        )
      : entry
  )
}

/** Whether a stored show still reads as the form the editor loaded. */
function matchesLoaded(stored: Show, loaded: ShowFormValues): boolean {
  return canonical(showToForm(stored)) === canonical(loaded)
}

interface SaveResult {
  version: string | null
  /** shows.json's version just before this save. */
  versionBefore: string | null
}

/**
 * Saves one show and leaves every other show as it is now. `loaded` is the
 * show as the editor loaded it, or null for a new show. If the stored show no
 * longer matches it (edited or removed elsewhere), nothing is written, so an
 * edit made elsewhere is never silently overwritten.
 */
export async function saveShow(
  show: Show,
  loaded: ShowFormValues | null
): Promise<SaveResult> {
  let versionBefore: string | null = null
  const { versions } = await updateRepoFiles(
    ['shows.json'],
    ({ 'shows.json': showsFile }, current) => {
      versionBefore = current['shows.json']
      const shows = showsFile.shows ?? []

      if (!loaded) {
        if (shows.some((entry) => entry.id === show.id)) {
          throw new Error(`A show with ID "${show.id}" already exists`)
        }
        return { 'shows.json': { ...showsFile, shows: [...shows, show] } }
      }

      const index = shows.findIndex((entry) => entry.id === loaded.id)
      if (index === -1 || !matchesLoaded(shows[index], loaded)) {
        throw new ShowChangedError()
      }
      const next = [...shows]
      next[index] = show
      return { 'shows.json': { ...showsFile, shows: next } }
    },
    `chore: 🧹 update ${show.id} from admin CMS`
  )

  return { version: versions['shows.json'], versionBefore }
}

/** Removes one show, under the same check as `saveShow`. */
export async function removeShow(loaded: ShowFormValues): Promise<SaveResult> {
  let versionBefore: string | null = null
  const { versions } = await updateRepoFiles(
    ['shows.json'],
    ({ 'shows.json': showsFile }, current) => {
      versionBefore = current['shows.json']
      const shows = showsFile.shows ?? []
      const stored = shows.find((entry) => entry.id === loaded.id)
      if (!stored || !matchesLoaded(stored, loaded)) {
        throw new ShowChangedError()
      }
      return {
        'shows.json': {
          ...showsFile,
          shows: shows.filter((entry) => entry.id !== loaded.id),
        },
      }
    },
    `chore: 🧹 remove ${loaded.id} from admin CMS`
  )

  return { version: versions['shows.json'], versionBefore }
}
