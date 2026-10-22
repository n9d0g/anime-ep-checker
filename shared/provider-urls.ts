/** Provider IDs parsed out of the show URLs pasted into the admin form. */

export function parseSeriesIdFromUrl(url: string): string | null {
  const match = String(url).match(/\/series\/([A-Z0-9]+)/i)
  return match ? match[1].toUpperCase() : null
}

export function parseNetflixIdFromUrl(url: string): string | null {
  const match = String(url).match(/\/title\/(\d+)/i)
  return match ? match[1] : null
}

export function parseDisneyIdFromUrl(url: string): string | null {
  const entityMatch = String(url).match(
    /\/browse\/entity-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )
  if (entityMatch) {
    return entityMatch[1]
  }

  const seriesMatch = String(url).match(
    /\/series\/[a-z0-9-]+\/([a-zA-Z0-9-]+)/i
  )
  return seriesMatch ? seriesMatch[1] : null
}
