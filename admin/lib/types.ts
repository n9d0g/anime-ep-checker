/** Admin-only types. Show and state types live in shared/types.ts. */
import type { ScheduleMode, ShowProvider } from '@shared/types'

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
