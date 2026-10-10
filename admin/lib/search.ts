export type SearchCategory = 'watching' | 'ptw' | 'on_hold' | 'watched'

export interface SearchIndexItem {
  category: SearchCategory
  id: string
  title: string
  titleEnglish?: string
  href: string
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchSearchQuery(
  query: string,
  item: Pick<SearchIndexItem, 'title' | 'titleEnglish'>
): boolean {
  const needle = normalizeForSearch(query)
  if (!needle) {
    return false
  }

  const haystacks = [item.title, item.titleEnglish ?? ''].map(
    normalizeForSearch
  )
  return haystacks.some((haystack) => haystack.includes(needle))
}

export function filterSearchIndex(
  items: SearchIndexItem[],
  query: string
): SearchIndexItem[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  return items.filter((item) => matchSearchQuery(trimmed, item))
}
