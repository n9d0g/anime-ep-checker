// Admin data changes from several places (other tabs, the checker, MAL), so
// the browser must never answer these requests from its HTTP cache.
export function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: 'no-store' })
}
