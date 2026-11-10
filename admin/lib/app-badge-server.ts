import { env } from 'cloudflare:workers'
import {
  appBadgeCount,
  withDrops,
  type DropNotice,
  type PushSubscriptionStore,
} from './app-badge'
import { getRepoFiles } from './github'
import { fetchWatchedByShowId } from './mal-watched'
import { base64UrlEncode, type PushSubscriptionJson } from './web-push'
import type { Show, StateFile } from '@shared/types'

/** The App badge count from shows.json, state.json (plus the run's drops) and MAL. */
export async function loadAppBadgeCount(
  drops: DropNotice[] = []
): Promise<number | null> {
  const { files } = await getRepoFiles(['shows.json', 'state.json'])
  const shows = ((files['shows.json']?.content as { shows?: Show[] })?.shows ??
    []) as Show[]
  const state = (files['state.json']?.content ?? { shows: {} }) as StateFile

  const latestEpisodeByShowId: Record<string, string | undefined> = {}
  for (const show of shows) {
    latestEpisodeByShowId[show.id] = state.shows?.[show.id]?.lastEpisodeNumber
  }

  return appBadgeCount(
    shows.map((show) => show.id),
    withDrops(latestEpisodeByShowId, drops),
    await fetchWatchedByShowId(shows)
  )
}

const KEY_PREFIX = 'sub:'

// Endpoints can be long; KV keys are capped at 512 bytes.
async function keyFor(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(endpoint)
  )
  return `${KEY_PREFIX}${base64UrlEncode(new Uint8Array(digest))}`
}

/** Push subscriptions, one per device, in the PUSH_SUBSCRIPTIONS KV namespace. */
export const pushSubscriptions: PushSubscriptionStore = {
  async list() {
    const subscriptions: PushSubscriptionJson[] = []
    let cursor: string | undefined
    do {
      const page = await env.PUSH_SUBSCRIPTIONS.list({
        prefix: KEY_PREFIX,
        cursor,
      })
      const values = await Promise.all(
        page.keys.map((key) =>
          env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionJson>(key.name, 'json')
        )
      )
      for (const value of values) {
        if (value) {
          subscriptions.push(value)
        }
      }
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
    return subscriptions
  },
  async put(subscription) {
    await env.PUSH_SUBSCRIPTIONS.put(
      await keyFor(subscription.endpoint),
      JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      })
    )
  },
  async remove(endpoint) {
    await env.PUSH_SUBSCRIPTIONS.delete(await keyFor(endpoint))
  },
}
