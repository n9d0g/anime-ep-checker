// Return announcements: once a day, reads the news of each On hold show
// awaiting return (ANN headlines, and its official news page when set),
// saves what it says about the show coming back and alerts Discord once per
// new date. Nothing here moves the show back to Watching: you do that.
import { fetchAnilistAiring, type AnilistAiring } from './anilist.ts'
import { fetchAnnNews, type AnnNewsItem } from './ann-feed.ts'
import {
  hasDiscordConfig,
  sendReturnAnnouncementAlert,
  type DiscordConfig,
} from './discord.ts'
import { MONTHS } from './break-keywords.ts'
import { fetchOfficialNewsText } from './official-news.ts'
import {
  findAnnReturn,
  findOfficialReturn,
  type ReturnReading,
} from './return-keywords.ts'
import { getAwaitingReturn } from '../shared/schedule.ts'
import type { ReturnAnnouncement, StateFile } from '../shared/types.ts'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** What the news says, and where it said it. */
export interface ReturnNews extends ReturnReading {
  sourceUrl: string | null
}

/** TBA, then a month or season, then an exact date. */
function precision(time: {
  returnsOn: string | null
  returnsIn: string | null
}) {
  return time.returnsOn ? 2 : time.returnsIn ? 1 : 0
}

/**
 * The show's return announcement after a reading, and whether to alert. The
 * same date never alerts twice; a new date at the same or a finer precision
 * does (TBA → July 2027 → Jul 5 → a moved date). Vaguer news than what's
 * saved is older news: kept silent.
 */
export function applyReturnNews(
  existing: ReturnAnnouncement | null | undefined,
  news: ReturnNews | null,
  now: Date
): { announcement: ReturnAnnouncement | null; alert: boolean } {
  const current = existing ?? null
  if (!news) {
    return { announcement: current, alert: false }
  }
  if (current) {
    const same =
      current.returnsOn === news.returnsOn &&
      current.returnsIn === news.returnsIn
    if (same || precision(news) < precision(current)) {
      return { announcement: current, alert: false }
    }
  }
  return {
    announcement: {
      returnsOn: news.returnsOn,
      returnsIn: news.returnsIn,
      episode: news.episode ?? current?.episode ?? null,
      sourceUrl: news.sourceUrl,
      announcedAt: now.toISOString(),
    },
    alert: true,
  }
}

const SEASON_MONTHS: Record<string, number[]> = {
  Winter: [1, 2, 3],
  Spring: [4, 5, 6],
  Summer: [7, 8, 9],
  Fall: [10, 11, 12],
}

/** Whether a Japanese date (YYYY-MM-DD) falls in "July 2027" or "Summer 2027". */
function isWithin(date: string, returnsIn: string): boolean {
  const [label, year] = returnsIn.split(' ')
  const [dateYear, dateMonth] = date.split('-').map(Number)
  if (Number(year) !== dateYear) return false
  const months = SEASON_MONTHS[label!] ?? [
    MONTHS.indexOf(label!.toLowerCase()) + 1,
  ]
  return months.includes(dateMonth!)
}

/**
 * The exact date AniList schedules within the news's month or season. Never
 * on its own: AniList fills weekly placeholders through a hiatus, so only a
 * date inside what the news already said counts.
 */
export function refineWithAniList(
  news: ReturnNews,
  airing: AnilistAiring[],
  now: Date
): ReturnNews {
  if (news.returnsOn || !news.returnsIn) {
    return news
  }
  const next = airing
    .filter((node) => node.airingAt * 1000 > now.getTime())
    .sort((a, b) => a.airingAt - b.airingAt)[0]
  if (!next) {
    return news
  }
  const date = new Date(next.airingAt * 1000 + JST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
  if (!isWithin(date, news.returnsIn)) {
    return news
  }
  return {
    ...news,
    returnsOn: date,
    returnsIn: null,
    episode: news.episode ?? next.episode,
  }
}

function warn(message: string): void {
  console.warn(message)
  console.log(`::warning title=Return announcements::${message}`)
}

export async function syncReturnAnnouncements({
  state,
  discord,
  now,
  dryRun,
  fetchNews = fetchAnnNews,
  fetchPage = fetchOfficialNewsText,
  fetchAiring = async (malId) =>
    (await fetchAnilistAiring(malId))?.nodes ?? null,
}: {
  state: StateFile
  discord: DiscordConfig
  now: Date
  dryRun: boolean
  fetchNews?: (now: Date) => Promise<AnnNewsItem[] | null>
  fetchPage?: (url: string) => Promise<string | null>
  fetchAiring?: (malId: number) => Promise<AnilistAiring[] | null>
}): Promise<{ changed: boolean; reasons: string[] }> {
  const awaiting = getAwaitingReturn(state)
  const reasons: string[] = []
  const announcements = { ...state.meta?.returnAnnouncements }

  // Shows no longer awaiting return (restored, or unmarked) are done.
  const awaitingIds = new Set(awaiting.map((entry) => entry.show.id))
  for (const showId of Object.keys(announcements)) {
    if (!awaitingIds.has(showId)) {
      delete announcements[showId]
      reasons.push(`return announcement over ${showId}`)
    }
  }

  // Retried at the next daily check whatever happens, never sooner.
  state.meta = { ...state.meta, returnCheckedAt: now.toISOString() }
  reasons.push('return check')

  const annItems = awaiting.length > 0 ? await fetchNews(now) : []
  if (!annItems) {
    warn('Could not read the ANN news feed.')
  }

  for (const { show, awaitingReturn } of awaiting) {
    const showName = show.title || show.id
    console.log(`Reading return news for ${showName}...`)

    const pageUrl = awaitingReturn?.officialNewsUrl ?? null
    const pageText = pageUrl ? await fetchPage(pageUrl) : null
    if (pageUrl && !pageText) {
      warn(`Could not read the official news page for ${showName}: ${pageUrl}`)
    }

    const official = pageText ? findOfficialReturn(pageText, now) : null
    const headline = official
      ? null
      : findAnnReturn(annItems ?? [], {
          titles: [show.title, show.titleEnglish ?? ''],
          now,
        })
    let news: ReturnNews | null = official
      ? { ...official, sourceUrl: pageUrl }
      : headline
        ? { ...headline.reading, sourceUrl: headline.item.url }
        : null

    if (news && news.returnsIn && show.malId) {
      const airing = await fetchAiring(show.malId)
      if (airing) {
        news = refineWithAniList(news, airing, now)
      }
    }

    const { announcement, alert } = applyReturnNews(
      announcements[show.id],
      news,
      now
    )
    if (!alert || !announcement) {
      console.log(news ? '  Already announced' : '  No return announcement')
      continue
    }

    const when = announcement.returnsOn ?? announcement.returnsIn ?? 'TBA'
    console.log(`  Return announced: ${when}`)
    if (!dryRun && hasDiscordConfig(discord)) {
      await sendReturnAnnouncementAlert({ discord, show, announcement })
    }
    announcements[show.id] = announcement
    reasons.push(`return announcement ${showName} (${when})`)
  }

  state.meta = { ...state.meta, returnAnnouncements: announcements }
  return { changed: true, reasons }
}
