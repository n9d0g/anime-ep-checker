export interface MalSearchResult {
  malId: number
  title: string
  alternativeTitles: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(season|part|cour)\s*\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectTitles(result: MalSearchResult): string[] {
  const titles = [result.title]

  if (result.alternativeTitles.en) {
    titles.push(result.alternativeTitles.en)
  }
  if (result.alternativeTitles.ja) {
    titles.push(result.alternativeTitles.ja)
  }
  if (result.alternativeTitles.synonyms) {
    titles.push(...result.alternativeTitles.synonyms)
  }

  return titles
}

function titlesMatch(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeTitle(query)
  const normalizedCandidate = normalizeTitle(candidate)

  if (!normalizedQuery || !normalizedCandidate) {
    return false
  }

  return normalizedQuery === normalizedCandidate
}

function titlesAreClose(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeTitle(query)
  const normalizedCandidate = normalizeTitle(candidate)

  if (!normalizedQuery || !normalizedCandidate) {
    return false
  }

  if (
    normalizedQuery === normalizedCandidate ||
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return true
  }

  const queryTokens = normalizedQuery.split(' ')
  const candidateTokens = normalizedCandidate.split(' ')
  const shared = queryTokens.filter((token) =>
    candidateTokens.includes(token)
  )

  if (shared.length === 0) {
    return false
  }

  const overlap =
    shared.length / Math.max(queryTokens.length, candidateTokens.length)

  return overlap >= 0.75
}

export function resolveMalIdFromSearch(
  query: string,
  results: MalSearchResult[]
): number | null {
  const trimmed = query.trim()
  if (!trimmed || results.length === 0) {
    return null
  }

  for (const result of results) {
    for (const title of collectTitles(result)) {
      if (titlesMatch(trimmed, title)) {
        return result.malId
      }
    }
  }

  if (results.length === 1) {
    const [only] = results
    for (const title of collectTitles(only)) {
      if (titlesAreClose(trimmed, title)) {
        return only.malId
      }
    }
  }

  return null
}
