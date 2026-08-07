import { formatTimingLabel } from './compare.js'
import { createBotMessage } from './discord-api.js'
import {
  discordRelativeTimestamp,
  formatMalScoreLabel,
} from './discord-format.js'
import type { MalAnimeDetails, MalPlanToWatchEntry } from './mal.js'
import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  providerLabel,
  type EpisodeSnapshot,
  type PlanToWatchAlertReason,
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

interface PlanToWatchAlertInput {
  discord: DiscordConfig
  entry: MalPlanToWatchEntry
  reason: PlanToWatchAlertReason
}

function formatBroadcastLabel(
  broadcast: MalPlanToWatchEntry['broadcast']
): string | null {
  if (!broadcast?.dayOfWeek && !broadcast?.startTime) {
    return null
  }

  const day = broadcast.dayOfWeek
    ? broadcast.dayOfWeek.charAt(0).toUpperCase() + broadcast.dayOfWeek.slice(1)
    : null
  const time = broadcast.startTime ?? null

  if (day && time) {
    return `${day} at ${time} JST`
  }

  return day ?? time
}

function hasBotConfig(discord: DiscordConfig): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

function buildEpisodeWebhookEmbed({
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
    title: `✅ ${showTitle} — Episode ${episodeNumber} is out!`,
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

function buildEpisodeLinkButtons({
  show,
  latestSnapshot,
  discussionUrl,
}: Pick<EpisodeAlertInput, 'show' | 'latestSnapshot' | 'discussionUrl'>) {
  const buttons: Array<Record<string, unknown>> = []

  if (latestSnapshot.watchUrl) {
    buttons.push({
      type: 2,
      style: 5,
      label: 'Watch',
      url: latestSnapshot.watchUrl,
    })
  }

  if (discussionUrl) {
    buttons.push({
      type: 2,
      style: 5,
      label: 'r/anime',
      url: discussionUrl,
    })
  }

  if (show.malId) {
    buttons.push({
      type: 2,
      style: 5,
      label: 'MAL',
      url: `https://myanimelist.net/anime/${show.malId}`,
    })
  }

  if (buttons.length === 0) {
    return undefined
  }

  return [{ type: 1, components: buttons }]
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

export async function sendPlanToWatchAlert({
  discord,
  entry,
  reason,
}: PlanToWatchAlertInput): Promise<void> {
  const malUrl = `https://myanimelist.net/anime/${entry.malId}`
  const isAiring = reason === 'airing'
  const broadcastLabel = formatBroadcastLabel(entry.broadcast)
  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

  if (entry.startDate) {
    fields.push({
      name: 'Starts',
      value: entry.startDate,
      inline: true,
    })
  }

  if (broadcastLabel) {
    fields.push({
      name: 'Broadcast',
      value: broadcastLabel,
      inline: true,
    })
  }

  if (entry.numEpisodes) {
    fields.push({
      name: 'Episodes',
      value: String(entry.numEpisodes),
      inline: true,
    })
  }

  const embed = {
    title: isAiring
      ? `${entry.title} is airing on your plan-to-watch list`
      : `${entry.title} starts airing soon`,
    url: malUrl,
    description: isAiring
      ? 'This title is currently airing on MAL.'
      : 'This title starts within the next 7 days on MAL.',
    color: isAiring ? 0x3498db : 0x9b59b6,
    thumbnail: entry.coverUrl ? { url: entry.coverUrl } : undefined,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Anime Episode Checker' },
  }

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: 'MAL',
          url: malUrl,
        },
      ],
    },
  ]

  const payload: Record<string, unknown> = {
    content: `**${entry.title}** — plan to watch ${isAiring ? 'now airing' : 'starting soon'}`,
    embeds: [embed],
  }

  if (hasBotConfig(discord)) {
    payload.components = components
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
  if (hasBotConfig(input.discord)) {
    const showTitle = input.show.title || input.latestSnapshot.seriesTitle
    const embed = buildEpisodeWebhookEmbed(input)
    const components = buildEpisodeLinkButtons(input)
    const payload: Record<string, unknown> = {
      content: `✅ **${showTitle}** — Episode ${input.episodeNumber} is out!`,
      embeds: [embed],
    }

    if (components) {
      payload.components = components
    }

    await postBotMessage(
      input.discord.botToken!,
      input.discord.channelId!,
      payload
    )
    return
  }

  if (input.discord.webhookUrl) {
    const embed = buildEpisodeWebhookEmbed(input)
    const links: string[] = []
    if (input.latestSnapshot.watchUrl) {
      links.push(`[Watch](${input.latestSnapshot.watchUrl})`)
    }
    if (input.discussionUrl) {
      links.push(`[r/anime](${input.discussionUrl})`)
    }
    if (input.show.malId) {
      links.push(
        `[MAL](https://myanimelist.net/anime/${input.show.malId})`
      )
    }

    if (links.length > 0) {
      embed.fields = [
        ...(embed.fields ?? []),
        {
          name: 'Links',
          value: links.join(' · '),
          inline: false,
        },
      ]
    }

    await postWebhook(input.discord.webhookUrl, { embeds: [embed] })
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
    content: `🤔 **${showTitle}** — Episode ${episodeNumber} not on ${provider} yet.`,
    embeds: [
      {
        title: `🤔 ${showTitle} — Episode ${episodeNumber} not on ${provider} yet.`,
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

export async function sendDisneyAuthAlert(
  discord: DiscordConfig
): Promise<void> {
  if (!hasBotConfig(discord)) {
    throw new Error(
      'Disney+ auth alert requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.'
    )
  }

  const payload = {
    embeds: [
      {
        title: 'Disney+ checks need attention',
        description:
          'Disney+ episode checks failed (anonymous metadata was unavailable). Common causes:\n\n• **Geo-block** (`forbidden-location`) — GitHub Actions uses datacenter IPs. Disney shows are skipped for this run; run `pnpm check` from home when you need Disney baseline/alerts.\n• **Expired refresh token** — Re-copy `context.refreshToken` from DevTools on disneyplus.com (see README §6) into `DISNEY_REFRESH_TOKEN`.\n\nOther providers continue normally.',
        color: 0xe67e22,
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  await postBotMessage(discord.botToken!, discord.channelId!, payload)
}
