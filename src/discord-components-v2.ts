import { formatTimingLabel } from './compare.js'
import {
  discordRelativeTimestamp,
  discordTimestamp,
  formatMalScoreLabel,
} from './discord-format.js'
import type { MalAnimeDetails } from './mal.js'
import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  providerLabel,
  type EpisodeSnapshot,
  type Show,
  type TimingStatus,
} from './types.js'
import type { ShowDashboardRow } from './dashboard.js'

export const IS_COMPONENTS_V2 = 1 << 15
export const MAL_PROGRESS_MARKER = '**MAL progress:**'

type V2Component = Record<string, unknown>

export function formatMalProgressLine(label: string): string {
  return `${MAL_PROGRESS_MARKER} ${label}`
}

export function textDisplay(content: string): V2Component {
  return { type: 10, content }
}

export function separator(): V2Component {
  return { type: 14 }
}

export function mediaGallery(url: string, description?: string): V2Component {
  return {
    type: 12,
    items: [
      {
        media: { url },
        ...(description ? { description } : {}),
      },
    ],
  }
}

export function linkButton(label: string, url: string): V2Component {
  return {
    type: 2,
    style: 5,
    label,
    url,
  }
}

export function sectionWithLink(text: string, label: string, url: string): V2Component {
  return {
    type: 9,
    components: [textDisplay(text)],
    accessory: linkButton(label, url),
  }
}

export function actionRow(components: V2Component[]): V2Component {
  return { type: 1, components }
}

export function container(
  accentColor: number,
  children: V2Component[]
): V2Component {
  return {
    type: 17,
    accent_color: accentColor,
    components: children,
  }
}

export function v2MessagePayload(children: V2Component[]) {
  return {
    flags: IS_COMPONENTS_V2,
    components: children,
  }
}

export function buildEpisodeAlertV2Payload({
  show,
  latestSnapshot,
  episodeNumber,
  timingStatus,
  expectedDropAt,
  actualDropAt,
  discussionUrl,
  malDetails,
}: {
  show: Show
  latestSnapshot: EpisodeSnapshot
  episodeNumber: number
  timingStatus: TimingStatus
  expectedDropAt: string
  actualDropAt?: string | null
  discussionUrl?: string | null
  malDetails?: MalAnimeDetails | null
}) {
  const episodeTitle = latestSnapshot.episode.title ?? 'New episode'
  const showTitle = show.title || latestSnapshot.seriesTitle
  const timingLabel = formatTimingLabel(timingStatus, expectedDropAt, actualDropAt)
  const countdown = actualDropAt
    ? discordRelativeTimestamp(actualDropAt, 'Aired')
    : discordRelativeTimestamp(expectedDropAt, '—')
  const accentColor = timingStatus === 'late' ? 0xe67e22 : 0x2ecc71
  const watchUrl = latestSnapshot.watchUrl

  const children: V2Component[] = []

  if (malDetails?.coverUrl) {
    children.push(mediaGallery(malDetails.coverUrl, showTitle))
  }

  children.push(
    textDisplay(`## ${showTitle} — Episode ${episodeNumber} is out\n*${episodeTitle}*`),
    separator(),
    textDisplay(
      [
        `**Season:** ${latestSnapshot.seasonTitle}`,
        `**MAL score:** ${formatMalScoreLabel(malDetails?.meanScore)}`,
        `**Countdown:** ${countdown}`,
        `**Timing:** ${timingLabel}`,
      ].join('\n')
    )
  )

  if (watchUrl) {
    children.push(
      sectionWithLink('Watch the latest episode on your provider.', 'Watch', watchUrl)
    )
  }

  if (discussionUrl) {
    children.push(
      sectionWithLink('Join the weekly r/anime discussion thread.', 'r/anime', discussionUrl)
    )
  }

  if (show.malId) {
    children.push(
      sectionWithLink(
        'View this series on MyAnimeList.',
        'MAL',
        `https://myanimelist.net/anime/${show.malId}`
      )
    )
  }

  children.push(textDisplay('-# Anime Episode Checker'))

  return v2MessagePayload([container(accentColor, children)])
}

export function buildWatchingCardV2Payload(
  row: ShowDashboardRow,
  statusLabel: string,
  accentColor: number
) {
  const title = row.show.title || row.show.id
  const provider = providerLabel(row.show.provider)
  const watchUrl = getShowWatchUrl(row.show)
  const nextEpisode =
    row.nextEpisode !== null ? `Episode ${row.nextEpisode}` : 'Season complete'
  const drop =
    row.expectedDropAt !== null
      ? formatEasternTime(row.expectedDropAt)
      : 'No upcoming drop'
  const countdown =
    row.expectedDropAt !== null
      ? discordRelativeTimestamp(row.expectedDropAt)
      : '—'
  const dropDetail =
    row.expectedDropAt !== null
      ? `${drop} (${discordTimestamp(row.expectedDropAt)})`
      : drop

  const children: V2Component[] = []

  if (row.coverUrl) {
    children.push(mediaGallery(row.coverUrl, title))
  }

  children.push(
    textDisplay(`# ${title}`),
    textDisplay(
      [
        `**Status:** ${statusLabel}`,
        `**Provider:** ${provider}`,
        formatMalProgressLine(row.malProgress),
        `**MAL score:** ${row.malScore}`,
        `**Next:** ${nextEpisode}`,
        `**Countdown:** ${countdown}`,
        `**Expected drop:** ${dropDetail}`,
      ].join('\n')
    )
  )

  if (row.show.malId) {
    children.push(
      actionRow([
        {
          type: 2,
          style: 2,
          label: '−',
          custom_id: `mal:dec:${row.show.malId}`,
        },
        {
          type: 2,
          style: 3,
          label: '+',
          custom_id: `mal:inc:${row.show.malId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Set progress…',
          custom_id: `mal:set-btn:${row.show.malId}`,
        },
      ])
    )
  }

  if (watchUrl) {
    children.push(
      sectionWithLink(`Open on ${provider}`, 'Watch', watchUrl)
    )
  }

  if (row.discussionUrl) {
    children.push(
      sectionWithLink(
        'Join the weekly r/anime discussion thread.',
        'r/anime',
        row.discussionUrl
      )
    )
  }

  children.push(textDisplay('-# Anime Episode Checker · Watching dashboard'))

  return v2MessagePayload([
    container(accentColor, children),
  ])
}

export function patchMalProgressInComponents(
  components: unknown[],
  watchedLabel: string
): unknown[] | null {
  let patched = false

  function walk(items: unknown[]): unknown[] {
    return items.map((item) => {
      if (!item || typeof item !== 'object') {
        return item
      }

      const component = item as Record<string, unknown>

      if (component.type === 10 && typeof component.content === 'string') {
        if (component.content.includes(MAL_PROGRESS_MARKER)) {
          patched = true
          return {
            ...component,
            content: formatMalProgressLine(watchedLabel),
          }
        }
        return component
      }

      if (Array.isArray(component.components)) {
        return {
          ...component,
          components: walk(component.components),
        }
      }

      return component
    })
  }

  const next = walk(components)
  return patched ? next : null
}
