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
import { fetchMalProgress } from './mal.js'

export type DashboardStatus = 'upcoming' | 'in_window' | 'waiting' | 'out'

export interface ShowDashboardRow {
  show: Show
  nextEpisode: number | null
  expectedDropAt: string | null
  status: DashboardStatus
  malProgress: string
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

function formatMalProgress(progress: { watched: number; total: number | null }): string {
  if (progress.total) {
    return `${progress.watched} / ${progress.total}`
  }
  return `${progress.watched} watched`
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
  if (show.malId) {
    const progress = await fetchMalProgress(show.malId)
    malProgress = progress ? formatMalProgress(progress) : 'MAL unavailable'
  }

  return {
    show,
    nextEpisode,
    expectedDropAt: expectedAt?.toISOString() ?? null,
    status,
    malProgress,
    providerLatestEpisode,
  }
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

  return rows.map((row) => {
    const title = row.show.title || row.show.id
    const provider = providerLabel(row.show.provider)
    const watchUrl = getShowWatchUrl(row.show)
    const nextEpisode =
      row.nextEpisode !== null ? `Episode ${row.nextEpisode}` : 'Season complete'
    const drop =
      row.expectedDropAt !== null
        ? formatEasternTime(row.expectedDropAt)
        : 'No upcoming drop'

    return {
      title,
      url: watchUrl || undefined,
      color: getDashboardStatusColor(row.status),
      fields: [
        { name: 'Status', value: getDashboardStatusLabel(row.status), inline: true },
        { name: 'Provider', value: provider, inline: true },
        { name: 'MAL', value: row.malProgress, inline: true },
        { name: 'Next', value: nextEpisode, inline: true },
        { name: 'Expected drop', value: drop, inline: false },
      ],
      footer: { text: 'Anime Episode Checker · Watching dashboard' },
    }
  })
}
