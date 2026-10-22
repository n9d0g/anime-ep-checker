import { toDatetimeLocalValue } from './time'
import type { Show } from '@shared/types'
import type { ShowFormValues } from './types'

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
      ...(show.schedule.breaks?.length
        ? { breaks: show.schedule.breaks.map((entry) => ({ ...entry })) }
        : {}),
    },
  }
}
