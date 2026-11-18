import { noteServedVersion } from './new-version'

// Admin data changes from several places (other tabs, the checker, MAL), so
// the browser must never answer these requests from its HTTP cache. In the
// browser, each answer also says whether a newer version is live.
export async function noStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, { ...init, cache: 'no-store' })
  if (typeof window !== 'undefined') {
    noteServedVersion(response.headers, __APP_VERSION__)
  }
  return response
}
