// Announced breaks: reads each due show's official news page and Anime News
// Network's headlines with a GitHub Models model, saves what it finds as the
// show's announced break and alerts Discord once per (episode, new date).
// Nothing here moves a drop: only a confirmed break does.
import { fetchAnnNews, type AnnNewsItem } from './ann-feed.ts'
import {
  hasDiscordConfig,
  sendAnnouncedBreakAlert,
  sendGitHubModelsAlert,
  type DiscordConfig,
} from './discord.ts'
import {
  createGitHubModelsClient,
  type ChatMessage,
  type CompleteJson,
} from './github-models.ts'
import { fetchOfficialNewsText } from './official-news.ts'
import { isAnnouncementCheckDue } from '../shared/announced-break.ts'
import { getNextDrop, parseEpisodeNumber } from '../shared/schedule.ts'
import { getOfficialNewsUrl } from '../shared/shows.ts'
import type {
  AnnouncedBreak,
  Show,
  ShowState,
  StateFile,
} from '../shared/types.ts'

/** What the model read: a postponement of `episode`, or none. */
export interface BreakReading {
  episode: number
  newDate: string | null
  sourceUrl: string | null
}

function formatJapanTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')} JST`
}

export function buildAnnouncementPrompt({
  show,
  episode,
  expectedAt,
  now,
  pageUrl,
  pageText,
  annItems,
}: {
  show: Show
  episode: number
  expectedAt: Date
  now: Date
  pageUrl: string | null
  pageText: string | null
  annItems: AnnNewsItem[]
}): ChatMessage[] {
  const titles = [show.title, show.titleEnglish].filter(Boolean).join(' / ')
  const headlines = annItems.length
    ? annItems
        .map(
          (item) =>
            `- [${item.publishedAt.slice(0, 10)}] ${item.title} (${item.url})`
        )
        .join('\n')
    : '(none)'

  return [
    {
      role: 'system',
      content: [
        'You read anime news to find broadcast postponements of one TV anime.',
        'Reply with JSON only: {"delayed": boolean, "episode": number | null, "newDate": "YYYY-MM-DD" | null, "sourceUrl": string | null}.',
        '- "delayed" is true only if the news says this show (this season; mind sequels and other seasons) will not broadcast its next new episode when expected: a production delay, a broadcast pause, or a recap/special airing in that slot.',
        '- Ignore postponements of episodes that have already aired, news about other shows, and streaming-site or overseas-only schedule notes.',
        '- "episode" is the first postponed episode number. "newDate" is its new broadcast date in Japan, or null if not announced yet.',
        '- "sourceUrl" is the URL of the article that says so (the official page URL or a headline URL given below).',
        '- If nothing qualifies, reply {"delayed": false, "episode": null, "newDate": null, "sourceUrl": null}.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Show: ${titles}`,
        `Next new episode: ${episode}, expected to broadcast around ${formatJapanTime(expectedAt)}.`,
        `Today: ${formatJapanTime(now)}.`,
        '',
        `Official site (${pageUrl ?? 'none'}):`,
        pageText ?? '(unavailable)',
        '',
        'Anime News Network headlines, last 7 days:',
        headlines,
      ].join('\n'),
    },
  ]
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
}

/**
 * The model's reply as a reading, or null when it found no postponement of
 * the next episode or later. A source URL it didn't get from us is dropped.
 */
export function parseBreakReading(
  json: unknown,
  {
    nextEpisode,
    knownUrls,
  }: { nextEpisode: number; knownUrls: ReadonlySet<string> }
): BreakReading | null {
  if (!json || typeof json !== 'object') {
    return null
  }
  const reply = json as Record<string, unknown>
  if (reply.delayed !== true) {
    return null
  }
  const episode =
    typeof reply.episode === 'number' && Number.isInteger(reply.episode)
      ? reply.episode
      : nextEpisode
  if (episode < nextEpisode) {
    return null
  }
  return {
    episode,
    newDate: isIsoDate(reply.newDate) ? reply.newDate : null,
    sourceUrl:
      typeof reply.sourceUrl === 'string' && knownUrls.has(reply.sourceUrl)
        ? reply.sourceUrl
        : null,
  }
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

export async function syncAnnouncedBreaks({
  shows,
  state,
  discord,
  now,
  dryRun,
  token = process.env.GITHUB_TOKEN,
  completeJson = token ? createGitHubModelsClient(token) : undefined,
  fetchNews = fetchAnnNews,
  fetchPage = fetchOfficialNewsText,
}: {
  shows: Show[]
  state: StateFile
  discord: DiscordConfig
  now: Date
  dryRun: boolean
  token?: string
  completeJson?: CompleteJson
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
  if (!completeJson) {
    console.log(
      `GITHUB_TOKEN not set; skipping announced-break checks for ${due.length} show(s).`
    )
    return { changed: reasons.length > 0, reasons }
  }

  // Retried at the next scheduled check whatever happens, never sooner.
  for (const show of due) {
    state.shows[show.id]!.announcementCheckedAt = now.toISOString()
    reasons.push(`announcement check ${show.title || show.id}`)
  }

  const annItems = (await fetchNews(now)) ?? []

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
    if (!pageText && annItems.length === 0) {
      warn(`No official news or ANN headlines to read for ${showName}.`)
      continue
    }

    const reply = await completeJson(
      buildAnnouncementPrompt({
        show,
        episode: nextDrop.episode,
        expectedAt: nextDrop.expectedAt!,
        now,
        pageUrl: pageText ? pageUrl : null,
        pageText,
        annItems,
      })
    )

    if (!reply.ok) {
      warn(`GitHub Models failed for ${showName}: ${reply.message}`)
      if (reply.kind === 'auth') {
        state.meta ??= {}
        if (!state.meta.githubModelsAlertSentAt) {
          if (!dryRun && hasDiscordConfig(discord)) {
            await sendGitHubModelsAlert(discord, reply.message)
          }
          state.meta.githubModelsAlertSentAt = now.toISOString()
          reasons.push('GitHub Models alert flag set')
        }
        // The token is refused for every show; don't spend the rest.
        break
      }
      continue
    }

    showState.announcementReadAt = now.toISOString()
    if (state.meta?.githubModelsAlertSentAt) {
      state.meta.githubModelsAlertSentAt = null
      reasons.push('cleared GitHub Models alert flag')
    }

    const knownUrls = new Set(annItems.map((item) => item.url))
    if (pageUrl && pageText) {
      knownUrls.add(pageUrl)
    }
    const reading = parseBreakReading(reply.json, {
      nextEpisode: nextDrop.episode,
      knownUrls,
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
