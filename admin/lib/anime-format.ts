import type { WatchedEntry } from './types'

const MEDIA_TYPE_LABELS: Record<string, string> = {
  tv: 'TV',
  ova: 'OVA',
  ona: 'ONA',
  movie: 'Movie',
  special: 'Special',
  tv_special: 'TV Special',
  music: 'Music',
  cm: 'CM',
  pv: 'PV',
}

export function formatMediaType(mediaType: string | null): string | null {
  if (!mediaType || mediaType === 'unknown') {
    return null
  }
  return MEDIA_TYPE_LABELS[mediaType] ?? mediaType
}

/** "TV · 12 ep × 24 min", or just "Movie" for single-part movies. */
export function formatEpisodes(entry: {
  mediaType: string | null
  numEpisodes: number | null
  episodeDurationSec: number | null
}): string | null {
  const type = formatMediaType(entry.mediaType)
  if (entry.mediaType === 'movie' && entry.numEpisodes === 1) {
    const minutes = entry.episodeDurationSec
      ? Math.round(entry.episodeDurationSec / 60)
      : null
    return minutes ? `${type} · ${minutes} min` : type
  }
  const parts: string[] = []
  if (type) {
    parts.push(type)
  }
  if (entry.numEpisodes) {
    const minutes = entry.episodeDurationSec
      ? Math.round(entry.episodeDurationSec / 60)
      : null
    parts.push(`${entry.numEpisodes} ep${minutes ? ` × ${minutes} min` : ''}`)
  }
  return parts.join(' · ') || null
}
export function formatSeason(season: WatchedEntry['season']): string | null {
  if (!season) {
    return null
  }
  const name = season.season.charAt(0).toUpperCase() + season.season.slice(1)
  return `${name} ${season.year}`
}

/** Formats MAL dates (YYYY, YYYY-MM, YYYY-MM-DD, or ISO timestamps). */
export function formatMalDate(
  value: string | null,
  style: 'short' | 'long' = 'long'
): string | null {
  if (!value) {
    return null
  }

  const partial = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value)
  if (partial) {
    const [, year, month, day] = partial
    if (!month) {
      return year
    }
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? 1)))
    return date.toLocaleDateString(undefined, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      ...(day && style === 'long' ? { day: 'numeric' } : {}),
    })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    ...(style === 'long' ? { day: 'numeric' } : {}),
  })
}

const SOURCE_LABELS: Record<string, string> = {
  original: 'Original',
  manga: 'Manga',
  '4_koma_manga': '4-koma manga',
  web_manga: 'Web manga',
  digital_manga: 'Digital manga',
  novel: 'Novel',
  light_novel: 'Light novel',
  web_novel: 'Web novel',
  visual_novel: 'Visual novel',
  game: 'Game',
  card_game: 'Card game',
  book: 'Book',
  picture_book: 'Picture book',
  radio: 'Radio',
  music: 'Music',
  mixed_media: 'Mixed media',
}

const RATING_LABELS: Record<string, string> = {
  g: 'G (all ages)',
  pg: 'PG (children)',
  pg_13: 'PG-13',
  r: 'R (17+)',
  'r+': 'R+ (mild nudity)',
  rx: 'Rx',
}

export function formatSource(source: string | null): string | null {
  if (!source || source === 'other') {
    return null
  }
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
}

export function formatRating(rating: string | null): string | null {
  if (!rating) {
    return null
  }
  return RATING_LABELS[rating] ?? rating.toUpperCase()
}

/** MAL broadcast slots are in JST. */
export function formatBroadcast(
  broadcast: { dayOfWeek: string | null; startTime: string | null } | null
): string | null {
  if (!broadcast?.dayOfWeek) {
    return null
  }
  const day =
    broadcast.dayOfWeek.charAt(0).toUpperCase() + broadcast.dayOfWeek.slice(1)
  return broadcast.startTime
    ? `${day}s ${broadcast.startTime} JST`
    : `${day}s`
}

export function formatAirDates(
  startDate: string | null,
  endDate: string | null
): string | null {
  const start = formatMalDate(startDate)
  const end = formatMalDate(endDate)
  if (start && end && start !== end) {
    return `${start} – ${end}`
  }
  return start ?? end
}

/** Drops MAL's trailing "[Written by MAL Rewrite]"-style credit. */
export function cleanSynopsis(synopsis: string | null): string | null {
  const cleaned = synopsis
    ?.replace(/\s*[[(](?:Written by|Source:)[^\])]*[\])]\s*$/i, '')
    .trim()
  return cleaned || null
}

export function formatCount(value: number | null): string | null {
  return value === null ? null : value.toLocaleString()
}
