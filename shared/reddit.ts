/**
 * Pure r/anime discussion helpers: slugs, search queries and the search URL.
 * The threads live on r/anime, but the clickable search covers all of Reddit:
 * Reddit's site-wide search finds them more reliably than r/anime's own.
 */

export function slugifyForReddit(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildSearchQueries(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): string[] {
  const base = redditSearchTitle?.trim() || slugifyForReddit(showTitle)
  const titleSlug = slugifyForReddit(showTitle)

  const queries = [
    `${base}_-_episode_${episodeNumber}_discussion`,
    `${base}_episode_${episodeNumber}_discussion`,
  ]

  if (titleSlug && titleSlug !== base) {
    queries.push(`${titleSlug}_-_episode_${episodeNumber}_discussion`)
  }

  return [...new Set(queries)]
}

export function buildAnimeDiscussionSearchUrl(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): string {
  const [primaryQuery] = buildSearchQueries(
    showTitle,
    episodeNumber,
    redditSearchTitle
  )
  const params = new URLSearchParams({
    q: primaryQuery,
    sort: 'new',
  })

  return `https://www.reddit.com/search/?${params.toString()}`
}
