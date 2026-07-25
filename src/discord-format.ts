export function formatMalScoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '—'
  }
  return score.toFixed(2)
}

export function discordRelativeTimestamp(
  iso: string | null | undefined,
  fallback = '—'
): string {
  if (!iso) return fallback

  const unix = Math.floor(new Date(iso).getTime() / 1000)
  if (!Number.isFinite(unix) || unix <= 0) {
    return fallback
  }

  return `<t:${unix}:R>`
}

export function discordTimestamp(
  iso: string | null | undefined,
  fallback = '—'
): string {
  if (!iso) return fallback

  const unix = Math.floor(new Date(iso).getTime() / 1000)
  if (!Number.isFinite(unix) || unix <= 0) {
    return fallback
  }

  return `<t:${unix}:f>`
}
