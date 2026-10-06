const DEFAULT_ADMIN_ORIGIN = 'https://anime-ep-checker-admin.nate-584.workers.dev'

/** Canonical origin for Open Graph / link previews (Notion, Slack, etc.). */
export function getAdminPublicOrigin(): string {
  const explicit = process.env.ADMIN_PUBLIC_URL?.trim()
  if (explicit) {
    return new URL(explicit.endsWith('/') ? explicit : `${explicit}/`).origin
  }

  const malRedirect = process.env.MAL_REDIRECT_URI?.trim()
  if (malRedirect) {
    try {
      return new URL(malRedirect).origin
    } catch {
      // ignore invalid MAL_REDIRECT_URI
    }
  }

  return DEFAULT_ADMIN_ORIGIN
}
