import { apiFetch } from './api-fetch'
import type { SearchIndexItem } from './search'

// The search index is fetched the first time search opens and then reused
// for the rest of the session. Moving a show between lists invalidates it so
// the next search sees where the show is now.
export function createSearchIndexStore(
  fetchIndex: () => Promise<SearchIndexItem[]>
) {
  let pending: Promise<SearchIndexItem[]> | null = null

  return {
    load(): Promise<SearchIndexItem[]> {
      if (!pending) {
        const request = fetchIndex()
        pending = request
        request.catch(() => {
          // Let the next load retry instead of replaying the failure.
          if (pending === request) {
            pending = null
          }
        })
      }
      return pending
    },
    invalidate(): void {
      pending = null
    },
  }
}

/** This session's search index. */
export const searchIndex = createSearchIndexStore(async () => {
  const data = await apiFetch<{ items?: SearchIndexItem[] }>(
    '/api/search-index',
    { errorMessage: 'Failed to load search index' }
  )
  return data.items ?? []
})
