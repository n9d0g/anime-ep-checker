/** Pure r/anime discussion helpers: slugs, search queries and the search URL. */

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
    restrict_sr: 'on',
    sort: 'new',
  })

  return `https://www.reddit.com/r/anime/search/?${params.toString()}`
}

/**
 * r/anime search for a ranking post's discussion thread: the source's name
 * plus the season named in the post title (e.g. "Anime Corner Fall 2026"),
 * newest first, so this week's thread is at the top.
 */
export function buildRankingDiscussionSearchUrl(
  sourceName: string,
  postTitle: string
): string {
  const season = postTitle.match(/\b(Winter|Spring|Summer|Fall)\s+(\d{4})\b/i)
  const params = new URLSearchParams({
    q: season ? `${sourceName} ${season[1]} ${season[2]}` : sourceName,
    restrict_sr: 'on',
    sort: 'new',
  })

  return `https://www.reddit.com/r/anime/search/?${params.toString()}`
}

/**
 * r/anime search for u/Abysswatcherbel's weekly karma ranking posts, newest
 * first. The checker only links here; it never reads Reddit.
 */
export function buildKarmaRankingPostSearchUrl(): string {
  const params = new URLSearchParams({
    q: 'author:Abysswatcherbel',
    restrict_sr: 'on',
    sort: 'new',
  })

  return `https://www.reddit.com/r/anime/search/?${params.toString()}`
}
