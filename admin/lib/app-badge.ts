// The App badge: how many Watching shows are behind, pushed to the Home Screen
// icon with Declarative Web Push (no service worker). See ADR 0003.

import { countBehindShows } from '@shared/behind'
import { getAdminPublicOrigin } from './site-url'
import {
  sendPush,
  type PushSendResult,
  type PushSubscriptionJson,
  type VapidKeys,
} from './web-push'

/** A drop the checker just alerted. */
export interface DropNotice {
  showId: string
  showTitle: string
  episodeNumber: number
  episodeTitle?: string | null
}

export interface PushSubscriptionStore {
  list(): Promise<PushSubscriptionJson[]>
  put(subscription: PushSubscriptionJson): Promise<void>
  remove(endpoint: string): Promise<void>
}

// Declarative Web Push's magic number (RFC 8030) that marks the JSON as a
// notification the browser shows itself.
const DECLARATIVE_WEB_PUSH = 8030

function showUrl(origin: string, showId: string): string {
  return `${origin}/#show-${encodeURIComponent(showId)}`
}

function declarativePayload(
  notification: { title: string; body: string; navigate: string },
  count: number | null
): string {
  return JSON.stringify({
    web_push: DECLARATIVE_WEB_PUSH,
    notification: {
      ...notification,
      lang: 'en-US',
      dir: 'ltr',
      // Left out when MAL is down, so the badge keeps its last number. "0" clears it.
      ...(count === null ? {} : { app_badge: String(count) }),
    },
  })
}

export function dropPushPayload(
  drop: DropNotice,
  count: number | null,
  origin: string
): string {
  const episodeTitle = drop.episodeTitle?.trim()
  return declarativePayload(
    {
      title: drop.showTitle,
      body: episodeTitle
        ? `Episode ${drop.episodeNumber} · ${episodeTitle}`
        : `Episode ${drop.episodeNumber}`,
      navigate: showUrl(origin, drop.showId),
    },
    count
  )
}

export function testPushPayload(count: number | null, origin: string): string {
  let body: string
  if (count === null) {
    body = 'MAL is down, so the badge keeps its last number.'
  } else if (count === 0) {
    body = 'Nothing behind: the badge is cleared.'
  } else {
    body = `${count} ${count === 1 ? 'show' : 'shows'} behind.`
  }
  return declarativePayload(
    { title: 'App badge test', body, navigate: `${origin}/` },
    count
  )
}

/**
 * Lays the run's drops over the committed latest episodes: the checker
 * pings before its state.json commit lands, so the repo copy is a step behind.
 */
export function withDrops(
  latestEpisodeByShowId: Record<string, string | number | null | undefined>,
  drops: Pick<DropNotice, 'showId' | 'episodeNumber'>[]
): Record<string, string | number | null | undefined> {
  const result = { ...latestEpisodeByShowId }
  for (const drop of drops) {
    const current = Number(result[drop.showId])
    if (!Number.isFinite(current) || drop.episodeNumber > current) {
      result[drop.showId] = drop.episodeNumber
    }
  }
  return result
}

/** The App badge count, or null when MAL is down and progress is unknown. */
export function appBadgeCount(
  showIds: string[],
  latestEpisodeByShowId: Record<string, string | number | null | undefined>,
  progress: { watchedByShowId: Record<string, number | null>; malDown: boolean }
): number | null {
  if (progress.malDown) {
    return null
  }
  return countBehindShows(
    showIds,
    latestEpisodeByShowId,
    progress.watchedByShowId
  )
}

export interface PushFanOutResult {
  sent: number
  removed: number
  failed: number
}

/** Sends one payload to each subscription, dropping the ones the push service says are gone. */
export async function pushToSubscriptions(
  subscriptions: PushSubscriptionJson[],
  payload: string,
  {
    vapid,
    store,
    send = sendPush,
  }: {
    vapid: VapidKeys
    store: Pick<PushSubscriptionStore, 'remove'>
    send?: (
      subscription: PushSubscriptionJson,
      payload: string,
      vapid: VapidKeys
    ) => Promise<PushSendResult>
  }
): Promise<PushFanOutResult> {
  const result: PushFanOutResult = { sent: 0, removed: 0, failed: 0 }

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const outcome = await send(subscription, payload, vapid)
        if (outcome.status === 'sent') {
          result.sent += 1
        } else if (outcome.status === 'gone') {
          await store.remove(subscription.endpoint)
          result.removed += 1
        } else {
          console.warn(
            `Push failed (${outcome.httpStatus}) for ${new URL(subscription.endpoint).host}: ${outcome.detail}`
          )
          result.failed += 1
        }
      } catch (error) {
        console.warn('Push failed:', error)
        result.failed += 1
      }
    })
  )

  return result
}

export function isDropNotice(value: unknown): value is DropNotice {
  if (!value || typeof value !== 'object') {
    return false
  }
  const drop = value as Partial<DropNotice>
  return (
    typeof drop.showId === 'string' &&
    drop.showId !== '' &&
    typeof drop.showTitle === 'string' &&
    typeof drop.episodeNumber === 'number' &&
    Number.isFinite(drop.episodeNumber) &&
    (drop.episodeTitle === undefined ||
      drop.episodeTitle === null ||
      typeof drop.episodeTitle === 'string')
  )
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  )
}

/** `Authorization: Bearer <PUSH_TRIGGER_SECRET>`, compared in constant time. */
export async function isTriggerAuthorized(
  header: string | null,
  secret: string | undefined
): Promise<boolean> {
  const expected = secret?.trim()
  const match = header ? /^Bearer (.+)$/.exec(header.trim()) : null
  if (!expected || !match) {
    return false
  }
  const [given, wanted] = await Promise.all([
    sha256(match[1]),
    sha256(expected),
  ])
  let difference = 0
  for (let index = 0; index < wanted.length; index += 1) {
    difference |= given[index] ^ wanted[index]
  }
  return difference === 0
}

export function getVapidKeys(): VapidKeys {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set')
  }
  return {
    publicKey,
    privateKey,
    subject: getAdminPublicOrigin(),
  }
}
