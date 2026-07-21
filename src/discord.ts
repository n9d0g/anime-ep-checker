import { formatTimingLabel } from './compare.js'
import { formatEasternTime } from './time.js'
import {
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
}

interface WaitingAlertInput {
  discord: DiscordConfig
  show: Show
  episodeNumber: number
  expectedDropAt: string
}

const DISCORD_API = 'https://discord.com/api/v10'

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
}: Omit<EpisodeAlertInput, 'discord'>) {
  const episodeTitle = latestSnapshot.episode.title ?? 'New episode'
  const showTitle = show.title || latestSnapshot.seriesTitle
  const timingLabel = formatTimingLabel(timingStatus, expectedDropAt, actualDropAt)

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
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
    fields,
    timestamp: actualDropAt ?? new Date().toISOString(),
    footer: {
      text: 'Anime Episode Checker',
    },
  }
}

function buildMalButton(show: Show, episodeNumber: number) {
  if (!show.malId) return null

  return {
    type: 2,
    style: 1,
    label: 'Mark watched on MAL',
    custom_id: `mal:${show.malId}:${episodeNumber}`,
  }
}

async function postBotMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord bot message failed (${response.status}): ${body}`)
  }
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

export async function sendEpisodeAlert(input: EpisodeAlertInput): Promise<void> {
  const embed = buildEpisodeEmbed(input)
  const button = buildMalButton(input.show, input.episodeNumber)
  const payload: Record<string, unknown> = { embeds: [embed] }

  if (button) {
    payload.components = [{ type: 1, components: [button] }]
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
    if (button) {
      console.warn(
        'MAL button requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID; sending webhook without button.'
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

  const payload = {
    embeds: [
      {
        title: `${showTitle} — Episode ${episodeNumber} not on ${provider} yet`,
        description: `Expected around ${expectedLabel}. Still checking until the episode appears.`,
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
