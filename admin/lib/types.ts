import { toDatetimeLocalValue } from './time'

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
}

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
    planToWatchCheckedAt?: string | null
    planToWatchAlerts?: Record<
      string,
      { alertedAt: string; reason: string }
    >
    planToWatch?: PlanToWatchSnapshot
    [key: string]: unknown
  }
}

export interface ShowStateSummary {
  lastEpisodeNumber: string
  lastEpisodeTitle: string
  lastNotifiedAt: string
  watchedEpisode?: number | null
}

export interface ShowFormValues {
  id: string
  title: string
  provider: ShowProvider
  crunchyrollUrl: string
  seriesId: string
  netflixUrl: string
  netflixId: string
  disneyUrl: string
  disneyId: string
  malId: string
  redditSearchTitle: string
  schedule: {
    mode: ScheduleMode
    startAt: string
    startEpisode: string
    episodeCount: string
    premiereBatchSize: string
  }
}

export function emptyShowForm(): ShowFormValues {
  return {
    id: '',
    title: '',
    provider: 'crunchyroll',
    crunchyrollUrl: '',
    seriesId: '',
    netflixUrl: '',
    netflixId: '',
    disneyUrl: '',
    disneyId: '',
    malId: '',
    redditSearchTitle: '',
    schedule: {
      mode: 'finite',
      startAt: '',
      startEpisode: '1',
      episodeCount: '12',
      premiereBatchSize: '1',
    },
  }
}

export function showToForm(show: Show): ShowFormValues {
  const provider = show.provider ?? 'crunchyroll'

  return {
    id: show.id,
    title: show.title,
    provider,
    crunchyrollUrl: show.crunchyrollUrl ?? '',
    seriesId: show.seriesId ?? '',
    netflixUrl: show.netflixUrl ?? '',
    netflixId: show.netflixId ?? '',
    disneyUrl: show.disneyUrl ?? '',
    disneyId: show.disneyId ?? '',
    malId: show.malId ? String(show.malId) : '',
    redditSearchTitle: show.redditSearchTitle ?? '',
    schedule: {
      mode: show.schedule.mode,
      startAt: toDatetimeLocalValue(show.schedule.startAt),
      startEpisode: String(show.schedule.startEpisode),
      episodeCount:
        show.schedule.episodeCount === null
          ? ''
          : String(show.schedule.episodeCount),
      premiereBatchSize: String(show.schedule.premiereBatchSize ?? 1),
    },
  }
}

export { fromDatetimeLocalValue, toDatetimeLocalValue } from './time'
