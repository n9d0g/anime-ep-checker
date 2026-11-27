/**
 * Weekly karma ranking: the r/anime Top 10 episode discussions of the past
 * week by live karma, read from AnimeKarmaList's public API. The alert only
 * links to Reddit; the checker never fetches it.
 */

import { hasDiscordConfig, sendKarmaRankingAlert } from './discord.ts'
import type { DiscordConfig } from './discord.ts'
import {
  getPendingKarmaRankingWeek,
  type KarmaRankingWeek,
} from '../shared/karma-ranking.ts'
import type { StateFile } from '../shared/types.ts'

const API_URL = 'https://animekarmalist.com/api/episodes'
const USER_AGENT = 'anime-ep-checker'

export const KARMA_RANKING_SIZE = 10

export interface KarmaRankingEntry {
  title: string
  episodeNumber: number
  karma: number
  commentCount: number
  /** The episode's r/anime discussion thread. */
  threadUrl: string
}

export type KarmaRankingFetchResult =
  | { ok: true; entries: KarmaRankingEntry[] }
  | { ok: false; status: number | null; message: string }

function readEntry(item: unknown): KarmaRankingEntry | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  const title =
    (typeof record.name === 'string' && record.name.trim()) ||
    (typeof record.romaji === 'string' && record.romaji.trim())
  const { episodeNumber, karma, commentCount, commentLink } = record
  if (
    !title ||
    typeof episodeNumber !== 'number' ||
    typeof karma !== 'number' ||
    !Number.isFinite(karma) ||
    typeof commentLink !== 'string' ||
    !commentLink.startsWith('https://www.reddit.com/r/anime/')
  ) {
    return null
  }
  return {
    title,
    episodeNumber,
    karma,
    commentCount: typeof commentCount === 'number' ? commentCount : 0,
    threadUrl: commentLink,
  }
}

/**
 * The week's Top 10 by karma. The API returns pages of 15 episodes sorted by
 * karma (`offset` is the page index), so the first page is enough.
 */
export function parseKarmaRanking(body: unknown): KarmaRankingEntry[] {
  if (!Array.isArray(body)) {
    throw new Error('AnimeKarmaList response is not a list')
  }
  return body
    .map(readEntry)
    .filter((entry): entry is KarmaRankingEntry => entry !== null)
    .sort((a, b) => b.karma - a.karma)
    .slice(0, KARMA_RANKING_SIZE)
}

export async function fetchKarmaRanking(
  week: Pick<KarmaRankingWeek, 'start' | 'end'>
): Promise<KarmaRankingFetchResult> {
  const params = new URLSearchParams({
    start: week.start.toISOString(),
    end: week.end.toISOString(),
    offset: '0',
  })
  try {
    const response = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `AnimeKarmaList returned ${response.status}`,
      }
    }
    return { ok: true, entries: parseKarmaRanking(await response.json()) }
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Sends the due week's ranking once. A failed or empty fetch leaves the week
 * unsent, so the next due run (every 30 minutes through Monday) retries.
 */
export async function syncKarmaRanking({
  state,
  discord,
  now = new Date(),
  dryRun = false,
  fetchRanking = fetchKarmaRanking,
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
  fetchRanking?: typeof fetchKarmaRanking
}): Promise<{ changed: boolean; reasons: string[] }> {
  const week = getPendingKarmaRankingWeek(state, now)
  if (!week) {
    return { changed: false, reasons: [] }
  }

  console.log(`Karma ranking for the week ending ${week.weekEnding}`)
  const result = await fetchRanking(week)
  if (!result.ok) {
    console.warn(`  Karma ranking fetch failed: ${result.message}`)
    return { changed: false, reasons: [] }
  }
  if (result.entries.length === 0) {
    console.warn('  AnimeKarmaList has no episodes for the week yet')
    return { changed: false, reasons: [] }
  }

  if (dryRun) {
    console.log(`  Would send karma ranking (${result.entries.length} rows)`)
    return { changed: false, reasons: [] }
  }
  if (!hasDiscordConfig(discord)) {
    console.log('  Discord not configured; skipping karma ranking')
    return { changed: false, reasons: [] }
  }

  await sendKarmaRankingAlert({ discord, week, entries: result.entries })
  console.log('  Karma ranking sent')

  state.meta = {
    ...state.meta,
    karmaRanking: { weekEnding: week.weekEnding, sentAt: now.toISOString() },
  }
  return {
    changed: true,
    reasons: [`karma ranking for the week ending ${week.weekEnding}`],
  }
}
