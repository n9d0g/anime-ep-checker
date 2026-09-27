import {
  parseDisneyIdFromUrl,
  parseNetflixIdFromUrl,
  parseSeriesIdFromUrl,
} from './github'
import { slugify } from './slugify'
import { fromDatetimeLocalValue } from './time'
import type { Show, ShowFormValues, ShowProvider } from './types'

export function normalizeShow(show: ShowFormValues): Show {
  const provider: ShowProvider = show.provider ?? 'crunchyroll'
  const title = show.title.trim()

  let seriesId: string | undefined
  let crunchyrollUrl: string | undefined
  let netflixId: string | undefined
  let netflixUrl: string | undefined
  let disneyId: string | undefined
  let disneyUrl: string | undefined

  if (provider === 'crunchyroll') {
    crunchyrollUrl = show.crunchyrollUrl.trim()
    seriesId =
      show.seriesId || parseSeriesIdFromUrl(crunchyrollUrl) || undefined
    if (!seriesId) {
      throw new Error(`Invalid Crunchyroll URL: ${show.crunchyrollUrl}`)
    }
  } else if (provider === 'netflix') {
    netflixUrl = show.netflixUrl.trim()
    netflixId = show.netflixId || parseNetflixIdFromUrl(netflixUrl) || undefined
    if (!netflixId) {
      throw new Error(`Invalid Netflix URL: ${show.netflixUrl}`)
    }
  } else {
    disneyUrl = show.disneyUrl.trim()
    disneyId = show.disneyId || parseDisneyIdFromUrl(disneyUrl) || undefined
    if (!disneyId) {
      throw new Error(`Invalid Disney+ URL: ${show.disneyUrl}`)
    }
  }

  const startAt = fromDatetimeLocalValue(show.schedule.startAt)
  if (!startAt) {
    throw new Error(
      `Start date is required for ${title || seriesId || netflixId || disneyId}`
    )
  }

  const startEpisode = Number(show.schedule.startEpisode)
  if (!Number.isFinite(startEpisode) || startEpisode < 1) {
    throw new Error(
      `Start episode must be at least 1 for ${title || seriesId || netflixId || disneyId}`
    )
  }

  const premiereBatchSize = Number(show.schedule.premiereBatchSize || '1')
  if (!Number.isFinite(premiereBatchSize) || premiereBatchSize < 1) {
    throw new Error(
      `Premiere batch size must be at least 1 for ${title || seriesId || netflixId || disneyId}`
    )
  }

  const mode = show.schedule.mode
  let episodeCount: number | null = null

  if (mode === 'finite') {
    episodeCount = Number(show.schedule.episodeCount)
    if (!Number.isFinite(episodeCount) || episodeCount < 1) {
      throw new Error('Episode count is required for finite seasons')
    }
  }

  const malIdRaw = show.malId.trim()
  let malId: number | undefined
  if (malIdRaw) {
    malId = Number(malIdRaw)
    if (!Number.isFinite(malId) || malId < 1) {
      throw new Error(`MAL anime ID must be a positive number for ${title}`)
    }
  }

  const redditSearchTitle = show.redditSearchTitle.trim() || undefined
  const id =
    show.id || slugify(title || seriesId || netflixId || disneyId || 'show')

  const normalized: Show = {
    id,
    title,
    provider,
    schedule: {
      mode,
      startAt,
      startEpisode,
      episodeCount,
      premiereBatchSize,
    },
  }

  if (provider === 'crunchyroll') {
    normalized.crunchyrollUrl = crunchyrollUrl
    normalized.seriesId = seriesId
  } else if (provider === 'netflix') {
    normalized.netflixUrl = netflixUrl
    normalized.netflixId = netflixId
  } else {
    normalized.disneyUrl = disneyUrl
    normalized.disneyId = disneyId
  }

  if (malId !== undefined) {
    normalized.malId = malId
  }
  if (redditSearchTitle) {
    normalized.redditSearchTitle = redditSearchTitle
  }

  return normalized
}
