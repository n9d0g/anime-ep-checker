/**
 * "A new version is ready". Every admin response says which version is live
 * (`X-App-Version`, set in proxy.ts); when it isn't the version of the code
 * running here, an open tab or Home Screen app is out of date. The toast
 * (app/components/NewVersionToast.tsx) lets you choose when to reload.
 */

/** The live version, if these headers show the running code is out of date. Never in dev. */
export function newerVersion(headers: Headers, running: string): string | null {
  const served = headers.get('X-App-Version')
  if (!served || running.endsWith('-dev')) return null
  return served === running ? null : served
}

let live: string | null = null
const listeners = new Set<() => void>()

/** Called with every admin API answer's headers, in the browser. */
export function noteServedVersion(headers: Headers, running: string): void {
  const version = newerVersion(headers, running)
  if (!version || version === live) return
  live = version
  for (const listener of listeners) listener()
}

export function subscribeLiveVersion(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLiveVersion(): string | null {
  return live
}
