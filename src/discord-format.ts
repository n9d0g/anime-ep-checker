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

/** A YYYY-MM-DD Japanese broadcast date, e.g. "Fri, Nov 13 (JST)". */
export function formatJapanDate(date: string): string {
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  return `${label} (JST)`
}

/** "Episode N postponed (announced): new broadcast date … / new date TBA." */
export function formatAnnouncedBreak(
  episode: number,
  newDate: string | null
): string {
  const dateLabel = newDate
    ? `new broadcast date ${formatJapanDate(newDate)}`
    : 'new date TBA'
  return `Episode ${episode} postponed (announced): ${dateLabel}.`
}

const FOOTER_TEXT = 'Anime Episode Checker'

/** Embed footer naming the checker, optionally with a section suffix. */
export function discordFooter(section?: string): { text: string } {
  return { text: section ? `${FOOTER_TEXT} · ${section}` : FOOTER_TEXT }
}

export interface DiscordLinkButton {
  type: 2
  style: 5
  label: string
  url: string
}

export interface DiscordActionRow {
  type: 1
  components: DiscordLinkButton[]
}

export function discordLinkButton(
  label: string,
  url: string
): DiscordLinkButton {
  return { type: 2, style: 5, label, url }
}

/** One action row of link buttons, or `undefined` when there are none. */
export function discordLinkButtonRow(
  buttons: DiscordLinkButton[]
): DiscordActionRow[] | undefined {
  return buttons.length > 0 ? [{ type: 1, components: buttons }] : undefined
}
