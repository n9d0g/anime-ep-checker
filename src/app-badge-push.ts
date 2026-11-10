// Tells the admin Worker about a drop so it can push the new App badge count
// to subscribed devices (ADR 0003). Best effort: a failure never fails the
// check, since the Discord alert is already out.

const DEFAULT_URL = 'https://anime-ep-checker.dev/api/push/drop'
const TIMEOUT_MS = 20_000

export interface AppBadgePushConfig {
  url: string
  secret?: string
}

export interface DropNotice {
  showId: string
  showTitle: string
  episodeNumber: number
  episodeTitle?: string | null
}

export function getAppBadgePushConfigFromEnv(): AppBadgePushConfig {
  return {
    url: process.env.APP_BADGE_PUSH_URL?.trim() || DEFAULT_URL,
    secret: process.env.PUSH_TRIGGER_SECRET?.trim() || undefined,
  }
}

export type AppBadgePushResult = 'sent' | 'not_configured' | 'failed'

/**
 * `runDrops` are the drops alerted earlier in this run: state.json isn't
 * committed until the run ends, so the Worker lays them over its copy.
 */
export async function notifyAppBadgeDrop(
  config: AppBadgePushConfig,
  drop: DropNotice,
  runDrops: DropNotice[],
  fetchImpl: typeof fetch = fetch
): Promise<AppBadgePushResult> {
  if (!config.secret) {
    return 'not_configured'
  }

  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ drop, runDrops }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn(
        `  App badge push failed (${response.status}): ${await response.text().catch(() => '')}`
      )
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    console.warn(
      `  App badge push failed: ${error instanceof Error ? error.message : error}`
    )
    return 'failed'
  }
}
