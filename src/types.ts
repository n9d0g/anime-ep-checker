export type ScheduleMode = 'finite' | 'ongoing'

export type ShowProvider = 'crunchyroll' | 'netflix'

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
}

export interface StateFile {
  shows: Record<string, ShowState>
  meta?: {
    netflixCookieAlertSentAt?: string | null
    watchingDashboardMessageId?: string | null
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
  return provider === 'netflix' ? 'Netflix' : 'Crunchyroll'
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

  return normalized.crunchyrollUrl ?? ''
}
