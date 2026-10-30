// Announced breaks: reads each due show's official news page and Anime News
// Network's headlines by keyword, saves what it finds as the show's announced
// break and alerts Discord once per (episode, new date). Nothing here moves
// a drop: only a confirmed break does.
import { fetchAnnNews, type AnnNewsItem } from './ann-feed.ts'
import { findAnnBreak, findOfficialBreak } from './break-keywords.ts'
import {
  hasDiscordConfig,
  sendAnnouncedBreakAlert,
  type DiscordConfig,
} from './discord.ts'
import { fetchOfficialNewsText } from './official-news.ts'
import { isAnnouncementCheckDue } from '../shared/announced-break.ts'
import {
  getBroadcastAt,
  getNextDrop,
  parseEpisodeNumber,
} from '../shared/schedule.ts'
import { getOfficialNewsUrl } from '../shared/shows.ts'
import type {
  AnnouncedBreak,
  Show,
  ShowState,
  StateFile,
} from '../shared/types.ts'

/** What the news says: a break of `episode`, or none. */
export interface BreakReading {
  episode: number
  newDate: string | null
  sourceUrl: string | null
}

/**
 * The show's announced break after a reading, and whether to alert. The same
 * (episode, new date) never alerts twice, dismissed or not; a new date (or a
 * TBA getting one) does. A TBA after a dated one is older news: kept silent.
 */
export function applyBreakReading(
  existing: AnnouncedBreak | null | undefined,
  reading: BreakReading | null,
  now: Date
): { announcedBreak: AnnouncedBreak | null; alert: boolean } {
  const current = existing ?? null
  if (!reading) {
    return { announcedBreak: current, alert: false }
  }
  if (
    current &&
    current.episode === reading.episode &&
    (current.newDate === reading.newDate ||
      (current.newDate !== null && reading.newDate === null))
  ) {
    return { announcedBreak: current, alert: false }
  }
  return {
    announcedBreak: {
      episode: reading.episode,
      newDate: reading.newDate,
      sourceUrl: reading.sourceUrl,
      status: 'pending',
      announcedAt: now.toISOString(),
    },
    alert: true,
  }
}

function warn(message: string): void {
  console.warn(message)
  console.log(`::warning title=Announced breaks::${message}`)
}

/** The announced break's episode has dropped: it no longer applies. */
function isAnnouncedBreakOver(showState: ShowState): boolean {
  const announced = showState.announcedBreak
  return Boolean(
    announced &&
    announced.episode <= parseEpisodeNumber(showState.lastEpisodeNumber)
  )
}

/**
 * What the show's news says about its next episode: the official page first
 * (it can give a new date), then ANN headlines since the last drop.
 */
export function readBreakNews({
  show,
  showState,
  episode,
  expectedAt,
  pageUrl,
  pageText,
  annItems,
}: {
  show: Show
  showState: ShowState
  episode: number
  expectedAt: Date
  pageUrl: string | null
  pageText: string | null
  annItems: AnnNewsItem[]
}): BreakReading | null {
  if (pageText) {
    const official = findOfficialBreak(pageText, {
      episode,
      broadcastAt:
        getBroadcastAt(showState.airingSchedule, episode) ?? expectedAt,
    })
    if (official) {
      return { ...official, sourceUrl: pageUrl }
    }
  }

  const droppedMs = Date.parse(showState.lastNotifiedAt)
  const headline = findAnnBreak(annItems, {
    titles: [show.title, show.titleEnglish ?? ''],
    episode,
    since: Number.isNaN(droppedMs) ? null : new Date(droppedMs),
  })
  return headline ? { episode, newDate: null, sourceUrl: headline.url } : null
}

export async function syncAnnouncedBreaks({
  shows,
  state,
  discord,
  now,
  dryRun,
  fetchNews = fetchAnnNews,
  fetchPage = fetchOfficialNewsText,
}: {
  shows: Show[]
  state: StateFile
  discord: DiscordConfig
  now: Date
  dryRun: boolean
  fetchNews?: (now: Date) => Promise<AnnNewsItem[] | null>
  fetchPage?: (url: string) => Promise<string | null>
}): Promise<{ changed: boolean; reasons: string[] }> {
  const reasons: string[] = []

  for (const show of shows) {
    const showState = state.shows[show.id]
    if (showState && isAnnouncedBreakOver(showState)) {
      showState.announcedBreak = null
      reasons.push(`announced break over ${show.title || show.id}`)
    }
  }

  const due = shows.filter((show) =>
    isAnnouncementCheckDue(show, state.shows[show.id], now)
  )
  if (due.length === 0) {
    return { changed: reasons.length > 0, reasons }
  }

  // Retried at the next scheduled check whatever happens, never sooner.
  for (const show of due) {
    state.shows[show.id]!.announcementCheckedAt = now.toISOString()
    reasons.push(`announcement check ${show.title || show.id}`)
  }

  const annItems = await fetchNews(now)
  if (!annItems) {
    warn('Could not read the ANN news feed.')
  }

  for (const show of due) {
    const showState = state.shows[show.id]!
    const showName = show.title || show.id
    const nextDrop = getNextDrop(
      show.schedule,
      showState.lastEpisodeNumber,
      showState.airingSchedule
    )!
    console.log(
      `Reading official news for ${showName} (ep ${nextDrop.episode})...`
    )

    const pageUrl = getOfficialNewsUrl(show, showState.officialSiteUrl)
    const pageText = pageUrl ? await fetchPage(pageUrl) : null
    if (pageUrl && !pageText) {
      warn(`Could not read the official news page for ${showName}: ${pageUrl}`)
    }
    // A check only counts as read when every source it has was read.
    if (annItems && (!pageUrl || pageText)) {
      showState.announcementReadAt = now.toISOString()
    }

    const reading = readBreakNews({
      show,
      showState,
      episode: nextDrop.episode,
      expectedAt: nextDrop.expectedAt!,
      pageUrl,
      pageText,
      annItems: annItems ?? [],
    })
    const { announcedBreak, alert } = applyBreakReading(
      showState.announcedBreak,
      reading,
      now
    )
    if (!alert || !announcedBreak) {
      console.log(
        reading
          ? `  Already announced: ep ${reading.episode} (${reading.newDate ?? 'TBA'})`
          : '  No announced break'
      )
      continue
    }

    console.log(
      `  Announced break: ep ${announcedBreak.episode} → ${announcedBreak.newDate ?? 'TBA'}`
    )
    if (!dryRun && hasDiscordConfig(discord)) {
      await sendAnnouncedBreakAlert({
        discord,
        show,
        episodeNumber: announcedBreak.episode,
        newDate: announcedBreak.newDate,
        sourceUrl: announcedBreak.sourceUrl ?? pageUrl,
      })
    }
    showState.announcedBreak = announcedBreak
    reasons.push(
      `announced break ${showName} ep ${announcedBreak.episode} (${announcedBreak.newDate ?? 'TBA'})`
    )
  }

  return { changed: reasons.length > 0, reasons }
}
