import type { Show, ShowProvider } from './types.ts'

export function normalizeShowProvider(show: Show): Show {
  return {
    ...show,
    provider: show.provider ?? 'crunchyroll',
  }
}

export function providerLabel(provider: ShowProvider): string {
  if (provider === 'netflix') return 'Netflix'
  if (provider === 'disney') return 'Disney+'
  return 'Crunchyroll'
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

  if (normalized.provider === 'disney') {
    if (normalized.disneyUrl) return normalized.disneyUrl
    if (normalized.disneyId) {
      return `https://www.disneyplus.com/browse/entity-${normalized.disneyId}`
    }
    return ''
  }

  return normalized.crunchyrollUrl ?? ''
}
