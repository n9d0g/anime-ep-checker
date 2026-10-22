import { sleep } from './sleep.ts'
import {
  hasDiscordConfig,
  sendMalRateLimitAlert,
  sendRelatedAnimeAlert,
} from './discord.ts'
import type { DiscordConfig } from './discord.ts'
import {
  fetchMalAnimeSummary,
  fetchRelatedAnime,
  fetchUserAnimeList,
  type MalRelatedAnime,
} from './mal.ts'
import type { StateFile } from '../shared/types.ts'

// MAL's rate limits are undocumented; ~1 req/s has been safe in practice.
const MAL_REQUEST_DELAY_MS = 1000

// Character crossovers and "other" links are mostly noise.
const IGNORED_RELATION_TYPES = new Set(['character', 'other'])

/**
 * Diffs a completed title's related anime against what was seen last week.
 * With no previous record the title is baselined: everything is marked seen
 * and nothing alerts, so finishing a show (or the first run) doesn't flood
 * Discord.
 */
export function diffRelatedAnime({
  previousSeen,
  related,
  onListMalIds,
}: {
  previousSeen: number[] | undefined
  related: MalRelatedAnime[]
  onListMalIds: Set<number>
}): { seen: number[]; newRelated: MalRelatedAnime[] } {
  const seen = related.map((item) => item.malId).sort((a, b) => a - b)
  if (!previousSeen) {
    return { seen, newRelated: [] }
  }

  const previous = new Set(previousSeen)
  const newRelated = related.filter(
    (item) =>
      !previous.has(item.malId) &&
      !onListMalIds.has(item.malId) &&
      !IGNORED_RELATION_TYPES.has(item.relationType)
  )

  return { seen, newRelated }
}

interface RelatedAnimeSyncResult {
  changed: boolean
  reasons: string[]
}

export async function syncRelatedAnimeAlerts({
  state,
  discord,
  now = new Date(),
  dryRun = false,
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
}): Promise<RelatedAnimeSyncResult> {
  const reasons: string[] = []
  const previousSeen = state.meta?.relatedAnimeSeen ?? {}

  // On a rate limit, stop immediately and wait for next Sunday. Marking the
  // week as checked keeps the 5-minute cron from retrying all day.
  const finishRateLimited = async ({
    httpStatus,
    checked,
    total,
    nextSeen,
  }: {
    httpStatus: number
    checked: number
    total: number
    nextSeen: Record<string, number[]>
  }): Promise<RelatedAnimeSyncResult> => {
    console.warn(
      `  MAL rate limited (HTTP ${httpStatus}) after ${checked}/${total} titles; stopping until next Sunday`
    )

    if (dryRun) {
      return { changed: false, reasons }
    }

    if (hasDiscordConfig(discord)) {
      try {
        await sendMalRateLimitAlert({ discord, httpStatus, checked, total })
      } catch (error) {
        console.warn(
          `  MAL rate limit alert failed: ${
            error instanceof Error ? error.message : error
          }`
        )
      }
    }

    state.meta = {
      ...state.meta,
      relatedAnimeCheckedAt: now.toISOString(),
      relatedAnimeSeen: nextSeen,
    }
    reasons.push(`related anime check rate limited (HTTP ${httpStatus})`)
    return { changed: true, reasons }
  }

  const completed = await fetchUserAnimeList('completed')
  if (completed.status === 'rate_limited') {
    return finishRateLimited({
      httpStatus: completed.httpStatus,
      checked: 0,
      total: 0,
      nextSeen: previousSeen,
    })
  }
  if (completed.status !== 'ok') {
    console.log(
      completed.status === 'not_configured'
        ? '  MAL not configured; skipping related anime sync'
        : '  MAL completed list unavailable; skipping related anime sync'
    )
    return { changed: false, reasons }
  }

  // The full list lets us skip related titles you've already added.
  const fullList = await fetchUserAnimeList()
  if (fullList.status === 'rate_limited') {
    return finishRateLimited({
      httpStatus: fullList.httpStatus,
      checked: 0,
      total: completed.entries.length,
      nextSeen: previousSeen,
    })
  }
  if (fullList.status !== 'ok') {
    console.log('  MAL full list unavailable; skipping related anime sync')
    return { changed: false, reasons }
  }

  const onListMalIds = new Set(fullList.entries.map((entry) => entry.malId))
  const nextSeen: Record<string, number[]> = {}
  const alertedThisRun = new Set<number>()

  for (const [index, entry] of completed.entries.entries()) {
    const key = String(entry.malId)
    await sleep(MAL_REQUEST_DELAY_MS)

    const result = await fetchRelatedAnime(entry.malId)
    if (result.status === 'rate_limited') {
      // Titles not reached keep last week's record.
      for (const remaining of completed.entries.slice(index)) {
        const remainingKey = String(remaining.malId)
        if (previousSeen[remainingKey]) {
          nextSeen[remainingKey] = previousSeen[remainingKey]
        }
      }
      return finishRateLimited({
        httpStatus: result.httpStatus,
        checked: index,
        total: completed.entries.length,
        nextSeen,
      })
    }
    if (result.status !== 'ok') {
      if (previousSeen[key]) {
        nextSeen[key] = previousSeen[key]
      }
      continue
    }

    const { seen, newRelated } = diffRelatedAnime({
      previousSeen: previousSeen[key],
      related: result.related,
      onListMalIds,
    })

    if (!previousSeen[key]) {
      console.log(
        `  Related anime baseline for ${entry.title} (${seen.length} related)`
      )
      reasons.push(`related anime baseline ${entry.title}`)
    }

    // Only mark a title seen once its alert actually went out, so a failed
    // send retries next week instead of being silently dropped.
    const recorded = new Set(seen)

    for (const related of newRelated) {
      if (alertedThisRun.has(related.malId)) {
        continue
      }

      if (dryRun) {
        console.log(
          `  Would send related anime alert: ${related.title} (${related.relationTypeFormatted} of ${entry.title})`
        )
        continue
      }

      if (!hasDiscordConfig(discord)) {
        console.log(
          `  Discord not configured; skipping related anime alert for ${related.title}`
        )
        recorded.delete(related.malId)
        continue
      }

      try {
        await sleep(MAL_REQUEST_DELAY_MS)
        const summary = await fetchMalAnimeSummary(related.malId)
        await sendRelatedAnimeAlert({
          discord,
          source: entry,
          related,
          summary,
        })
        alertedThisRun.add(related.malId)
        console.log(
          `  Related anime alert: ${related.title} (${related.relationTypeFormatted} of ${entry.title})`
        )
        reasons.push(`related anime ${related.title} (${entry.title})`)
      } catch (error) {
        console.warn(
          `  Related anime alert failed for ${related.title}: ${
            error instanceof Error ? error.message : error
          }`
        )
        recorded.delete(related.malId)
      }
    }

    nextSeen[key] = [...recorded]
  }

  if (dryRun) {
    return { changed: false, reasons }
  }

  state.meta = {
    ...state.meta,
    relatedAnimeCheckedAt: now.toISOString(),
    relatedAnimeSeen: nextSeen,
  }
  reasons.push('related anime check')

  return { changed: true, reasons }
}
