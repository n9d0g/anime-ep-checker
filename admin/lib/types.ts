import { toDatetimeLocalValue } from './time'

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

export interface ShowFormValues {
  id: string
  title: string
  provider: ShowProvider
  crunchyrollUrl: string
  seriesId: string
  netflixUrl: string
  netflixId: string
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
