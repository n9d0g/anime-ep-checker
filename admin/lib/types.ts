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

export function toDatetimeLocalValue(isoValue: string | null | undefined): string {
  if (!isoValue) return ''
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
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
