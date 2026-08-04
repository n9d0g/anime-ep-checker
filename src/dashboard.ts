import {
  discordRelativeTimestamp,
  discordTimestamp,
  formatMalScoreLabel,
} from './discord-format.js'
import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  providerLabel,
  type Show,
  type ShowState,
} from './types.js'
import {
  getExpectedDropAt,
  getNextExpectedEpisode,
  isInCheckWindow,
  isPastWaitingGrace,
  parseEpisodeNumber,
} from './schedule.js'
import { fetchMalAnimeDetails, formatMalProgressLabel } from './mal.js'
import {
  buildAnimeDiscussionSearchUrl,
  findAnimeDiscussionPermalink,
} from './reddit.js'

export type DashboardStatus = 'upcoming' | 'in_window' | 'waiting' | 'out'

export interface ShowDashboardRow {
  show: Show
  nextEpisode: number | null
  expectedDropAt: string | null
  status: DashboardStatus
  malProgress: string
  malScore: string
  coverUrl: string | null
  discussionUrl: string | null
  providerLatestEpisode: number | null
}

const STATUS_LABELS: Record<DashboardStatus, string> = {
  upcoming: 'Upcoming',
  in_window: 'In window',
  waiting: 'Waiting',
  out: 'Out now',
}

const STATUS_COLORS: Record<DashboardStatus, number> = {
  upcoming: 0x8b98a5,
  in_window: 0x3498db,
  waiting: 0xf1c40f,
  out: 0x2ecc71,
}

export function getDashboardStatusLabel(status: DashboardStatus): string {
  return STATUS_LABELS[status]
}

export function getDashboardStatusColor(status: DashboardStatus): number {
  return STATUS_COLORS[status]
}

export function resolveDashboardStatus(
  expectedAt: Date,
  now: Date,
  providerLatestEpisode: number | null,
  nextEpisode: number,
  waitingNotifiedForEpisode: number | null | undefined
): DashboardStatus {
  if (
    providerLatestEpisode !== null &&
    providerLatestEpisode >= nextEpisode
  ) {
    return 'out'
  }

  if (isPastWaitingGrace(expectedAt, now) || waitingNotifiedForEpisode === nextEpisode) {
    return 'waiting'
  }

  if (isInCheckWindow(expectedAt, now)) {
    return 'in_window'
  }

  return 'upcoming'
}

export async function buildShowDashboardRow(
  show: Show,
  showState: ShowState | null,
  now: Date,
  providerLatestEpisode: number | null
): Promise<ShowDashboardRow> {
  const lastEpisodeNumber = showState
    ? parseEpisodeNumber(showState.lastEpisodeNumber)
    : null
  const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
  const expectedAt =
    nextEpisode !== null ? getExpectedDropAt(show.schedule, nextEpisode) : null

  let status: DashboardStatus = 'upcoming'
  if (nextEpisode === null || !expectedAt) {
    status = 'upcoming'
  } else {
    status = resolveDashboardStatus(
      expectedAt,
      now,
      providerLatestEpisode,
      nextEpisode,
      showState?.waitingNotifiedForEpisode
    )
  }

  let malProgress = '—'
  let malScore = '—'
  let coverUrl: string | null = null
  let discussionUrl: string | null = null

  if (show.malId) {
    const details = await fetchMalAnimeDetails(show.malId)
    if (details.status === 'ok') {
      malProgress = formatMalProgressLabel({
        status: 'ok',
        progress: {
          watched: details.details.watched,
          total: details.details.total,
        },
      })
      malScore = formatMalScoreLabel(details.details.meanScore)
      coverUrl = details.details.coverUrl
    } else {
      malProgress = formatMalProgressLabel(details)
    }
  }

  const discussionEpisode =
    lastEpisodeNumber !== null && lastEpisodeNumber > 0
      ? lastEpisodeNumber
      : nextEpisode !== null && nextEpisode > 0
        ? nextEpisode
        : show.schedule.startEpisode

  if (discussionEpisode > 0) {
    const cachedDiscussion =
      showState?.discussionUrlEpisode === discussionEpisode
        ? showState.discussionUrl
        : null

    if (cachedDiscussion) {
      discussionUrl = cachedDiscussion
    } else {
      try {
        const permalink = await findAnimeDiscussionPermalink(
          show.title || show.id,
          discussionEpisode,
          show.redditSearchTitle
        )

        if (permalink) {
          discussionUrl = permalink
          if (showState) {
            showState.discussionUrl = permalink
            showState.discussionUrlEpisode = discussionEpisode
          }
        } else {
          discussionUrl = buildAnimeDiscussionSearchUrl(
            show.title || show.id,
            discussionEpisode,
            show.redditSearchTitle
          )
        }
      } catch {
        discussionUrl = null
      }
    }
  }

  return {
    show,
    nextEpisode,
    expectedDropAt: expectedAt?.toISOString() ?? null,
    status,
    malProgress,
    malScore,
    coverUrl,
    discussionUrl,
    providerLatestEpisode,
  }
}

export function buildDashboardEmbed(row: ShowDashboardRow) {
  const title = row.show.title || row.show.id
  const provider = providerLabel(row.show.provider)
  const watchUrl = getShowWatchUrl(row.show)
  const nextEpisode =
    row.nextEpisode !== null ? `Episode ${row.nextEpisode}` : 'Season complete'
  const drop =
    row.expectedDropAt !== null
      ? formatEasternTime(row.expectedDropAt)
      : 'No upcoming drop'
  const countdown =
    row.expectedDropAt !== null
      ? discordRelativeTimestamp(row.expectedDropAt)
      : '—'

  return {
    title,
    url: watchUrl || undefined,
    color: getDashboardStatusColor(row.status),
    thumbnail: row.coverUrl ? { url: row.coverUrl } : undefined,
    fields: [
      { name: 'Status', value: getDashboardStatusLabel(row.status), inline: true },
      { name: 'Provider', value: provider, inline: true },
      { name: 'MAL', value: row.malProgress, inline: true },
      { name: 'MAL score', value: row.malScore, inline: true },
      { name: 'Next', value: nextEpisode, inline: true },
      { name: 'Countdown', value: countdown, inline: true },
      {
        name: 'Expected drop',
        value:
          row.expectedDropAt !== null
            ? `${drop} (${discordTimestamp(row.expectedDropAt)})`
            : drop,
        inline: false,
      },
    ],
    footer: { text: 'Anime Episode Checker · Watching dashboard' },
  }
}

export function buildDashboardNotificationContent(row: ShowDashboardRow): string {
  const title = row.show.title || row.show.id
  const nextEpisode =
    row.nextEpisode !== null ? `Episode ${row.nextEpisode}` : 'Season complete'
  const status = getDashboardStatusLabel(row.status)
  return `**${title}** — MAL ${row.malProgress} · Next ${nextEpisode} · ${status}`
}

export function buildDashboardMalComponents(
  show: Show,
  discussionUrl?: string | null
) {
  const rows: Array<Record<string, unknown>> = []
  const watchUrl = getShowWatchUrl(show)
  const linkButtons: Array<Record<string, unknown>> = []

  if (watchUrl) {
    linkButtons.push({
      type: 2,
      style: 5,
      label: 'Watch',
      url: watchUrl,
    })
  }

  if (discussionUrl) {
    linkButtons.push({
      type: 2,
      style: 5,
      label: 'r/anime',
      url: discussionUrl,
    })
  }

  if (show.malId) {
    rows.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: '−',
          custom_id: `mal:dec:${show.malId}`,
        },
        {
          type: 2,
          style: 3,
          label: '+',
          custom_id: `mal:inc:${show.malId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Set progress…',
          custom_id: `mal:set-btn:${show.malId}`,
        },
      ],
    })
  }

  if (linkButtons.length > 0) {
    rows.push({
      type: 1,
      components: linkButtons,
    })
  }

  return rows
}

export function buildShowDashboardPayload(row: ShowDashboardRow) {
  const components = buildDashboardMalComponents(row.show, row.discussionUrl)
  const payload: Record<string, unknown> = {
    content: buildDashboardNotificationContent(row),
    embeds: [buildDashboardEmbed(row)],
  }

  if (components.length > 0) {
    payload.components = components
  }

  return payload
}

export function buildDashboardEmbeds(rows: ShowDashboardRow[]) {
  if (rows.length === 0) {
    return [
      {
        title: 'Watching',
        description: 'No tracked shows yet.',
        color: 0x8b98a5,
        footer: { text: 'Anime Episode Checker' },
      },
    ]
  }

  return rows.map((row) => buildDashboardEmbed(row))
}
