import { toDatetimeLocalValue } from './time'

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

export interface ShowFormValues {
  id: string
  title: string
  crunchyrollUrl: string
  seriesId: string
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
    crunchyrollUrl: '',
    seriesId: '',
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
  return {
    id: show.id,
    title: show.title,
    crunchyrollUrl: show.crunchyrollUrl,
    seriesId: show.seriesId,
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
