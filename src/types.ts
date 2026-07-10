export type ScheduleMode = 'finite' | 'ongoing'

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
  crunchyrollUrl: string
  seriesId: string
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
}

export interface StateFile {
  shows: Record<string, ShowState>
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
  seriesId: string
  seriesTitle: string
  seasonId: string
  seasonTitle: string
  episode: CrunchyrollEpisode
  watchUrl: string
}

export type TimingStatus = 'unknown' | 'on-time' | 'early' | 'late'
