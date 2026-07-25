import { formatTimingLabel } from './compare.js'
import { createBotMessage } from './discord-api.js'
import {
  discordRelativeTimestamp,
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

export interface DiscordConfig {
  botToken?: string
  channelId?: string
  webhookUrl?: string
}

interface EpisodeAlertInput {
  discord: DiscordConfig
  show: Show
  latestSnapshot: EpisodeSnapshot
  episodeNumber: number
  timingStatus: TimingStatus
  expectedDropAt: string
  actualDropAt?: string | null
  discussionUrl?: string | null
  malDetails?: MalAnimeDetails | null
}

interface WaitingAlertInput {
  discord: DiscordConfig
  show: Show
  episodeNumber: number
  expectedDropAt: string
}

interface MalScoreAlertInput {
  discord: DiscordConfig
  show: Show
  previousScore: number
  newScore: number
  direction: 'pickup' | 'drop'
  coverUrl?: string | null
  note?: string | null
}

function hasBotConfig(discord: DiscordConfig): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

function buildEpisodeEmbed({
  show,
  latestSnapshot,
  episodeNumber,
  timingStatus,
  expectedDropAt,
  actualDropAt,
  discussionUrl,
  malDetails,
}: Omit<EpisodeAlertInput, 'discord'>) {
  const episodeTitle = latestSnapshot.episode.title ?? 'New episode'
  const showTitle = show.title || latestSnapshot.seriesTitle
  const timingLabel = formatTimingLabel(timingStatus, expectedDropAt, actualDropAt)
  const countdown = actualDropAt
    ? discordRelativeTimestamp(actualDropAt, 'Aired')
    : discordRelativeTimestamp(expectedDropAt, '—')

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Season',
      value: latestSnapshot.seasonTitle,
      inline: true,
    },
    {
      name: 'MAL score',
      value: formatMalScoreLabel(malDetails?.meanScore),
      inline: true,
    },
    {
      name: 'Countdown',
      value: countdown,
      inline: true,
    },
    {
      name: 'Timing',
      value: timingLabel,
      inline: false,
    },
  ]

  if (discussionUrl) {
    fields.push({
      name: 'Discussion',
      value: `[r/anime thread](${discussionUrl})`,
      inline: false,
    })
  }

  return {
    title: `${showTitle} — Episode ${episodeNumber} is out`,
    url: latestSnapshot.watchUrl,
    description: episodeTitle,
    color: timingStatus === 'late' ? 0xe67e22 : 0x2ecc71,
    thumbnail: malDetails?.coverUrl ? { url: malDetails.coverUrl } : undefined,
    fields,
    timestamp: actualDropAt ?? new Date().toISOString(),
    footer: {
      text: 'Anime Episode Checker',
    },
  }
}

function buildEpisodeComponents(
  show: Show,
  episodeNumber: number,
  watchUrl: string,
  discussionUrl?: string | null
) {
  const row: Array<Record<string, unknown>> = []

  if (watchUrl) {
    row.push({
      type: 2,
      style: 5,
      label: 'Watch',
      url: watchUrl,
    })
  }

  if (discussionUrl) {
    row.push({
      type: 2,
      style: 5,
      label: 'r/anime',
      url: discussionUrl,
    })
  }

  if (show.malId) {
    row.push({
      type: 2,
      style: 3,
      label: 'Mark watched',
      custom_id: `mal:${show.malId}:${episodeNumber}`,
    })
  }

  return row.length > 0 ? [{ type: 1, components: row }] : []
}

async function postBotMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await createBotMessage(botToken, channelId, payload)
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

export async function sendMalScoreAlert({
  discord,
  show,
  previousScore,
  newScore,
  direction,
  coverUrl,
  note,
}: MalScoreAlertInput): Promise<void> {
  const showTitle = show.title || show.id
  const watchUrl = getShowWatchUrl(show)
  const delta = newScore - previousScore
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
  const isPickup = direction === 'pickup'

  const embed = {
    title: isPickup
      ? `${showTitle} — MAL score pickup`
      : `${showTitle} — MAL score drop`,
    url: watchUrl || `https://myanimelist.net/anime/${show.malId}`,
    description: note?.trim() || undefined,
    color: isPickup ? 0x2ecc71 : 0xe74c3c,
    thumbnail: coverUrl ? { url: coverUrl } : undefined,
    fields: [
      {
        name: 'Score',
        value: `${previousScore.toFixed(2)} → ${newScore.toFixed(2)} (${deltaLabel})`,
        inline: false,
      },
      {
        name: 'MAL',
        value: `[View on MAL](https://myanimelist.net/anime/${show.malId})`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Anime Episode Checker' },
  }

  const payload = { embeds: [embed] }

  if (hasBotConfig(discord)) {
    await postBotMessage(discord.botToken!, discord.channelId!, payload)
    return
  }

  if (discord.webhookUrl) {
    await postWebhook(discord.webhookUrl, payload)
    return
  }

  throw new Error(
    'Discord not configured. Set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (preferred) or DISCORD_WEBHOOK_URL.'
  )
}

export async function sendEpisodeAlert(input: EpisodeAlertInput): Promise<void> {
  const embed = buildEpisodeEmbed(input)
  const components = buildEpisodeComponents(
    input.show,
    input.episodeNumber,
    input.latestSnapshot.watchUrl,
    input.discussionUrl
  )
  const payload: Record<string, unknown> = { embeds: [embed] }

  if (components.length > 0) {
    payload.components = components
  }

  if (hasBotConfig(input.discord)) {
    await postBotMessage(
      input.discord.botToken!,
      input.discord.channelId!,
      payload
    )
    return
  }

  if (input.discord.webhookUrl) {
    if (components.length > 0) {
      console.warn(
        'Interactive buttons require DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID; sending webhook without buttons.'
      )
      delete payload.components
    }
    await postWebhook(input.discord.webhookUrl, payload)
    return
  }

  throw new Error(
    'Discord not configured. Set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (preferred) or DISCORD_WEBHOOK_URL.'
  )
}

export async function sendWaitingAlert({
  discord,
  show,
  episodeNumber,
  expectedDropAt,
}: WaitingAlertInput): Promise<void> {
  const showTitle = show.title || show.id
  const expectedLabel = formatEasternTime(expectedDropAt)
  const provider = providerLabel(show.provider ?? 'crunchyroll')
  const countdown = discordRelativeTimestamp(expectedDropAt, expectedLabel)

  const payload = {
    embeds: [
      {
        title: `${showTitle} — Episode ${episodeNumber} not on ${provider} yet`,
        description: `Expected around ${expectedLabel}. Countdown: ${countdown}`,
        color: 0xf1c40f,
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  if (hasBotConfig(discord)) {
    await postBotMessage(discord.botToken!, discord.channelId!, payload)
    return
  }

  if (discord.webhookUrl) {
    await postWebhook(discord.webhookUrl, payload)
    return
  }

  throw new Error(
    'Discord not configured. Set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (preferred) or DISCORD_WEBHOOK_URL.'
  )
}

export async function sendNetflixCookieAlert(
  discord: DiscordConfig
): Promise<void> {
  if (!hasBotConfig(discord)) {
    throw new Error(
      'Netflix cookie alert requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.'
    )
  }

  const payload = {
    embeds: [
      {
        title: 'Netflix cookie needs refresh',
        description:
          'The `NETFLIX_COOKIE` GitHub Actions secret is missing or expired. Netflix episode checks are paused until you update it.\n\nCopy your logged-in netflix.com `Cookie` header into the secret, then re-run the check workflow.',
        color: 0xe67e22,
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  await postBotMessage(discord.botToken!, discord.channelId!, payload)
}
