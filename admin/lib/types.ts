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
  titleEnglish?: string
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
  episodeOffset?: number | null
  waitingNotifiedForEpisode?: number | null
  malMeanScore?: number | null
  malScoreAlertedAt?: string | null
  discussionUrl?: string | null
  discussionUrlEpisode?: number | null
  googleCalendarEvents?: Record<
    string,
    { eventId: string; startAt: string }
  > | null
}

export interface PlanToWatchSnapshotEntry {
  malId: number
  title: string
  titleEnglish?: string
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

export interface WatchedEntry {
  malId: number
  title: string
  titleEnglish?: string
  coverUrl: string | null
  /** MAL media type, e.g. tv, movie, ova. */
  mediaType: string | null
  numEpisodes: number | null
  episodeDurationSec: number | null
  season: { year: number; season: string } | null
  meanScore: number | null
  genres: string[]
  studios: string[]
  /** Your score (1–10), null when unscored. */
  score: number | null
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string | null
  timesRewatched: number
}

export interface PtwDetails {
  malId: number
  synopsis: string | null
  coverUrl: string | null
  meanScore: number | null
  rank: number | null
  popularity: number | null
  numListUsers: number | null
  mediaType: string | null
  numEpisodes: number | null
  episodeDurationSec: number | null
  season: { year: number; season: string } | null
  startDate: string | null
  endDate: string | null
  broadcast: { dayOfWeek: string | null; startTime: string | null } | null
  source: string | null
  rating: string | null
  genres: string[]
  studios: string[]
  /** Last update to the list entry, usually when it was added to plan to watch. */
  addedAt: string | null
}

export interface PtwDetailsList {
  fetchedAt: string
  details: PtwDetails[]
}

export interface WatchedList {
  fetchedAt: string
  entries: WatchedEntry[]
}

export interface OnHoldSnapshotEntry {
  show: Show
  heldAt: string
}

export interface OnHoldSnapshot {
  updatedAt: string
  entries: OnHoldSnapshotEntry[]
}

export interface StateFile {
  shows: Record<string, ShowState>
  meta?: {
    netflixCookieAlertSentAt?: string | null
    disneyCookieAlertSentAt?: string | null
    watchingDashboardMessageId?: string | null
    watchingDashboardMessageIds?: Record<string, string>
    planToWatchCheckedAt?: string | null
    planToWatchAlerts?: Record<string, { alertedAt: string; reason: string }>
    planToWatch?: PlanToWatchSnapshot
    onHold?: OnHoldSnapshot
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
  titleEnglish?: string
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
    titleEnglish: show.titleEnglish,
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

export { fromDatetimeLocalValue } from './time'
