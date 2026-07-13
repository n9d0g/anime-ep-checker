import { formatTimingLabel } from './compare.js'
import { formatEasternTime } from './time.js'
import type { EpisodeSnapshot, Show, TimingStatus } from './types.js'

interface EpisodeAlertInput {
  webhookUrl: string
  show: Show
  latestSnapshot: EpisodeSnapshot
  episodeNumber: number
  timingStatus: TimingStatus
  expectedDropAt: string
  actualDropAt?: string | null
}

interface WaitingAlertInput {
  webhookUrl: string
  show: Show
  episodeNumber: number
  expectedDropAt: string
}

export async function sendEpisodeAlert({
  webhookUrl,
  show,
  latestSnapshot,
  episodeNumber,
  timingStatus,
  expectedDropAt,
  actualDropAt,
}: EpisodeAlertInput): Promise<void> {
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set')
  }

  const episodeTitle = latestSnapshot.episode.title ?? 'New episode'
  const showTitle = show.title || latestSnapshot.seriesTitle
  const timingLabel = formatTimingLabel(timingStatus, expectedDropAt, actualDropAt)

  const payload = {
    embeds: [
      {
        title: `${showTitle} — Episode ${episodeNumber} is out`,
        url: latestSnapshot.watchUrl,
        description: episodeTitle,
        color: timingStatus === 'late' ? 0xe67e22 : 0x2ecc71,
        fields: [
          {
            name: 'Season',
            value: latestSnapshot.seasonTitle,
            inline: true,
          },
          {
            name: 'Timing',
            value: timingLabel,
            inline: false,
          },
        ],
        timestamp: actualDropAt ?? new Date().toISOString(),
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  await postWebhook(webhookUrl, payload)
}

export async function sendWaitingAlert({
  webhookUrl,
  show,
  episodeNumber,
  expectedDropAt,
}: WaitingAlertInput): Promise<void> {
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set')
  }

  const showTitle = show.title || show.id
  const expectedLabel = formatEasternTime(expectedDropAt)

  const payload = {
    embeds: [
      {
        title: `${showTitle} — Episode ${episodeNumber} not on Crunchyroll yet`,
        description: `Expected around ${expectedLabel}. Still checking until the episode appears.`,
        color: 0xf1c40f,
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  await postWebhook(webhookUrl, payload)
}

async function postWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord webhook failed (${response.status}): ${body}`)
  }
}
