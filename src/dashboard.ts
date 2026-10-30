import {
  discordFooter,
  discordLinkButton,
  discordLinkButtonRow,
  discordRelativeTimestamp,
  discordTimestamp,
  formatJapanDate,
  formatMalScoreLabel,
  type DiscordLinkButton,
} from './discord-format.ts'
import { formatEasternTime } from './time.ts'
import { getShowWatchUrl, providerLabel } from '../shared/shows.ts'
import type { AnnouncedBreak, Show, ShowState } from '../shared/types.ts'
import {
  getNextDrop,
  isInDropWindowOrLateSlot,
  isPastWaitingGrace,
  parseEpisodeNumber,
} from '../shared/schedule.ts'
import { fetchMalAnimeDetails, formatMalProgressLabel } from './mal.ts'
import { buildAnimeDiscussionSearchUrl } from '../shared/reddit.ts'
import { findAnimeDiscussionPermalink } from './reddit.ts'

type DashboardStatus = 'upcoming' | 'in_window' | 'waiting' | 'out'

export interface ShowDashboardRow {
  show: Show
  nextDropEpisode: number | null
  expectedDropAt: string | null
  status: DashboardStatus
  malProgress: string
  malScore: string
  coverUrl: string | null
  discussionUrl: string | null
  providerLatestEpisode: number | null
  /** A pending announced break for the next drop or later: a marker only. */
  announcedBreak?: AnnouncedBreak | null
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

function getDashboardStatusLabel(status: DashboardStatus): string {
  return STATUS_LABELS[status]
}

function getDashboardStatusColor(status: DashboardStatus): number {
  return STATUS_COLORS[status]
}

function resolveDashboardStatus(
  expectedAt: Date,
  now: Date,
  providerLatestEpisode: number | null,
  nextDropEpisode: number,
  waitingNotifiedForEpisode: number | null | undefined
): DashboardStatus {
  if (
    providerLatestEpisode !== null &&
    providerLatestEpisode >= nextDropEpisode
  ) {
    return 'out'
  }

  if (
    isPastWaitingGrace(expectedAt, now) ||
    waitingNotifiedForEpisode === nextDropEpisode
  ) {
    return 'waiting'
  }

  if (isInDropWindowOrLateSlot(expectedAt, now)) {
    return 'in_window'
  }

  return 'upcoming'
}

/**
 * Card status from saved state only (the run's latest episode snapshot is
 * saved on the show state), so it stays stable between drop windows.
 */
export function resolveShowDashboardStatus(
  show: Show,
  showState: ShowState | null,
  now: Date
): DashboardStatus {
  const nextDrop = getNextDrop(
    show.schedule,
    showState?.lastEpisodeNumber,
    showState?.airingSchedule
  )
  if (!nextDrop?.expectedAt) return 'upcoming'

  return resolveDashboardStatus(
    nextDrop.expectedAt,
    now,
    showState?.lastSnapshotEpisode ?? null,
    nextDrop.episode,
    showState?.waitingNotifiedForEpisode
  )
}

export async function buildShowDashboardRow(
  show: Show,
  showState: ShowState | null,
  now: Date
): Promise<ShowDashboardRow> {
  const lastEpisodeNumber = showState
    ? parseEpisodeNumber(showState.lastEpisodeNumber)
    : null
  const nextDrop = getNextDrop(
    show.schedule,
    showState?.lastEpisodeNumber,
    showState?.airingSchedule
  )
  const nextDropEpisode = nextDrop?.episode ?? null
  const expectedAt = nextDrop?.expectedAt ?? null
  const status = resolveShowDashboardStatus(show, showState, now)

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
      : nextDropEpisode !== null && nextDropEpisode > 0
        ? nextDropEpisode
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
    nextDropEpisode,
    expectedDropAt: expectedAt?.toISOString() ?? null,
    status,
    malProgress,
    malScore,
    coverUrl,
    discussionUrl,
    providerLatestEpisode: showState?.lastSnapshotEpisode ?? null,
    announcedBreak: getPendingAnnouncedBreak(showState, nextDropEpisode),
  }
}

function getPendingAnnouncedBreak(
  showState: ShowState | null,
  nextDropEpisode: number | null
): AnnouncedBreak | null {
  const announced = showState?.announcedBreak
  return announced?.status === 'pending' &&
    nextDropEpisode !== null &&
    announced.episode >= nextDropEpisode
    ? announced
    : null
}

function formatAnnouncedBreakField(announced: AnnouncedBreak): string {
  const date = announced.newDate ? formatJapanDate(announced.newDate) : 'TBA'
  const label = `Episode ${announced.episode} → ${date}`
  return announced.sourceUrl ? `[${label}](${announced.sourceUrl})` : label
}

function buildDashboardEmbed(row: ShowDashboardRow) {
  const title = row.show.title || row.show.id
  const provider = providerLabel(row.show.provider)
  const watchUrl = getShowWatchUrl(row.show)
  const nextDropLabel =
    row.nextDropEpisode !== null
      ? `Episode ${row.nextDropEpisode}`
      : 'Season complete'
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
      {
        name: 'Status',
        value: getDashboardStatusLabel(row.status),
        inline: true,
      },
      { name: 'Provider', value: provider, inline: true },
      { name: 'MAL', value: row.malProgress, inline: true },
      { name: 'MAL score', value: row.malScore, inline: true },
      { name: 'Next', value: nextDropLabel, inline: true },
      { name: 'Countdown', value: countdown, inline: true },
      {
        name: 'Expected drop',
        value:
          row.expectedDropAt !== null
            ? `${drop} (${discordTimestamp(row.expectedDropAt)})`
            : drop,
        inline: false,
      },
      ...(row.announcedBreak
        ? [
            {
              name: '⚠️ Announced break',
              value: formatAnnouncedBreakField(row.announcedBreak),
              inline: false,
            },
          ]
        : []),
    ],
    footer: discordFooter('Watching dashboard'),
  }
}

function buildDashboardNotificationContent(row: ShowDashboardRow): string {
  const title = row.show.title || row.show.id
  const nextDropLabel =
    row.nextDropEpisode !== null
      ? `Episode ${row.nextDropEpisode}`
      : 'Season complete'
  const status = getDashboardStatusLabel(row.status)
  const marker = row.announcedBreak ? ' · ⚠️ Announced break' : ''
  return `**${title}** — MAL ${row.malProgress} · Next ${nextDropLabel} · ${status}${marker}`
}

function buildDashboardLinkComponents(
  show: Show,
  discussionUrl?: string | null
) {
  const watchUrl = getShowWatchUrl(show)
  const buttons: DiscordLinkButton[] = []

  if (watchUrl) {
    buttons.push(discordLinkButton('Watch', watchUrl))
  }
  if (discussionUrl) {
    buttons.push(discordLinkButton('r/anime', discussionUrl))
  }

  return discordLinkButtonRow(buttons)
}

export function buildShowDashboardPayload(row: ShowDashboardRow) {
  const components = buildDashboardLinkComponents(row.show, row.discussionUrl)
  const payload = {
    content: buildDashboardNotificationContent(row),
    embeds: [buildDashboardEmbed(row)],
  }

  return components ? { ...payload, components } : payload
}
