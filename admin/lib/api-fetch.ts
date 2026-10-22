import { noStoreFetch } from './no-store-fetch'

/** A non-OK (or unreadable) response from one of the admin's own API routes. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The parsed JSON body, or null when the body wasn't JSON. */
    readonly data: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'cache'> {
  /** Sent as the request body, JSON-encoded with a JSON content type. */
  json?: unknown
  /** The error to show when the response doesn't say what went wrong. */
  errorMessage: string
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === '') {
    return { ok: true, value: {} }
  }

  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

// Calls an admin API route (never from the HTTP cache) and returns its JSON.
// A non-OK response throws its `error` field, or `errorMessage`; a body that
// isn't JSON (e.g. a Cloudflare HTML error page) throws `errorMessage` with
// the status instead of a JSON parse error.
export async function apiFetch<T>(
  input: string,
  { json, errorMessage, headers, ...init }: ApiFetchOptions
): Promise<T> {
  const requestHeaders = new Headers(headers)
  if (json !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  const response = await noStoreFetch(input, {
    ...init,
    headers: requestHeaders,
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  const parsed = parseJson(await response.text())

  if (!parsed.ok) {
    throw new ApiError(
      response.ok
        ? `${errorMessage} (unexpected response, HTTP ${response.status})`
        : `${errorMessage} (HTTP ${response.status})`,
      response.status,
      null
    )
  }

  if (!response.ok) {
    const data = parsed.value as { error?: unknown } | null
    const message =
      data && typeof data.error === 'string' && data.error
        ? data.error
        : errorMessage
    throw new ApiError(message, response.status, parsed.value)
  }

  return parsed.value as T
}

/** The message to show for anything an API call threw. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
