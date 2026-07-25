import type { Show, ShowProvider } from './types'

export function providerLabel(provider: ShowProvider): string {
  return provider === 'netflix' ? 'Netflix' : 'Crunchyroll'
}

export function getShowWatchUrl(show: Show): string {
  if (show.provider === 'netflix') {
    if (show.netflixUrl) return show.netflixUrl
    if (show.netflixId) {
      return `https://www.netflix.com/title/${show.netflixId}`
    }
    return ''
  }

  return show.crunchyrollUrl ?? ''
}

export function findShowByOption(
  shows: Show[],
  value: string
): Show | undefined {
  return shows.find(
    (show) => show.id === value || show.title.toLowerCase() === value.toLowerCase()
  )
}

export function showAutocompleteChoices(shows: Show[], focused: string) {
  const query = focused.trim().toLowerCase()
  const matches = shows
    .filter((show) => {
      if (!query) return true
      return (
        show.title.toLowerCase().includes(query) ||
        show.id.toLowerCase().includes(query)
      )
    })
    .slice(0, 25)

  return matches.map((show) => ({
    name: show.title || show.id,
    value: show.id,
  }))
}
