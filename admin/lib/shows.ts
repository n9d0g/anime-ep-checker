import type { Show } from './types'

export function getShowWatchUrl(show: Show): string {
  if (show.provider === 'netflix') {
    if (show.netflixUrl) return show.netflixUrl
    if (show.netflixId) {
      return `https://www.netflix.com/title/${show.netflixId}`
    }
    return ''
  }

  if (show.provider === 'disney') {
    if (show.disneyUrl) return show.disneyUrl
    if (show.disneyId) {
      return `https://www.disneyplus.com/browse/entity-${show.disneyId}`
    }
    return ''
  }

  return show.crunchyrollUrl ?? ''
}
