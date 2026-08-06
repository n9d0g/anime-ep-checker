export type ScheduleMode = 'finite' | 'ongoing'

export type ShowProvider = 'crunchyroll' | 'netflix' | 'disney'

export interface ShowSchedule {
  mode: ScheduleMode
  startAt: string
  startEpisode: number
  episodeCount: number | null
  premiereBatchSize: number
}

export interface Show {
  id: string
  title: string
  provider: ShowProvider
  crunchyrollUrl?: string
  seriesId?: string
  netflixUrl?: string
  netflixId?: string
  disneyUrl?: string
  disneyId?: string
  malId?: number
  redditSearchTitle?: string
  schedule: ShowSchedule
}

export interface ShowsFile {
  shows: Show[]
}

export interface ShowState {
  lastEpisodeId: string
  lastEpisodeNumber: string
  lastEpisodeTitle: string
  lastNotifiedAt: string
  seasonId: string
  seasonTitle: string
  waitingNotifiedForEpisode?: number | null
  discordScheduledEventId?: string | null
  discordScheduledEventEpisode?: number | null
  malMeanScore?: number | null
  malScoreAlertedAt?: string | null
  discussionUrl?: string | null
  discussionUrlEpisode?: number | null
  googleCalendarEvents?: Record<
    string,
    { eventId: string; startAt: string }
  > | null
}

export type PlanToWatchAlertReason = 'airing' | 'upcoming'

export interface PlanToWatchSnapshotEntry {
  malId: number
  title: string
  status: string
  startDate: string | null
  broadcast: {
    dayOfWeek: string | null
    startTime: string | null
  } | null
  coverUrl: string | null
  numEpisodes: number | null
}

export interface PlanToWatchSnapshot {
  updatedAt: string
  entries: PlanToWatchSnapshotEntry[]
}

export interface StateFile {
  shows: Record<string, ShowState>
  meta?: {
    netflixCookieAlertSentAt?: string | null
    disneyCookieAlertSentAt?: string | null
    watchingDashboardMessageId?: string | null
    watchingDashboardMessageIds?: Record<string, string>
    watchingDashboardHashes?: Record<string, string>
    planToWatchCheckedAt?: string | null
    planToWatchAlerts?: Record<
      string,
      { alertedAt: string; reason: PlanToWatchAlertReason }
    >
    planToWatch?: PlanToWatchSnapshot
  }
}

export interface ProviderEpisode {
  id: string
  episode?: string | number
  title?: string
  availableAt?: string | null
}

export interface CrunchyrollEpisode {
  id: string
  episode?: string
  title?: string
  slug_title?: string
  premium_available_date?: string
  free_available_date?: string
  is_premium_only?: boolean
}

export interface CrunchyrollSeason {
  id: string
  title?: string
  season_sequence_number?: number
}

export interface EpisodeSnapshot {
  provider: ShowProvider
  seriesId: string
  seriesTitle: string
  seasonId: string
  seasonTitle: string
  episode: ProviderEpisode
  watchUrl: string
}

export type TimingStatus = 'unknown' | 'on-time' | 'early' | 'late'

export function normalizeShowProvider(show: Show): Show {
  return {
    ...show,
    provider: show.provider ?? 'crunchyroll',
  }
}

export function providerLabel(provider: ShowProvider): string {
  if (provider === 'netflix') return 'Netflix'
  if (provider === 'disney') return 'Disney+'
  return 'Crunchyroll'
}

export function getShowWatchUrl(show: Show): string {
  const normalized = normalizeShowProvider(show)

  if (normalized.provider === 'netflix') {
    if (normalized.netflixUrl) return normalized.netflixUrl
    if (normalized.netflixId) {
      return `https://www.netflix.com/title/${normalized.netflixId}`
    }
    return ''
  }

  if (normalized.provider === 'disney') {
    if (normalized.disneyUrl) return normalized.disneyUrl
    if (normalized.disneyId) {
      return `https://www.disneyplus.com/browse/entity-${normalized.disneyId}`
    }
    return ''
  }

  return normalized.crunchyrollUrl ?? ''
}
