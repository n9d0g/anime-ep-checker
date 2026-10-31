import { formatTimingLabel } from './compare.ts'
import { createBotMessage } from './discord-api.ts'
import {
  discordFooter,
  discordLinkButton,
  discordLinkButtonRow,
  discordRelativeTimestamp,
  discordTimestamp,
  formatAnnouncedBreak,
  formatMalScoreLabel,
  formatReturnAnnouncement,
  type DiscordActionRow,
} from './discord-format.ts'
import type {
  MalAnimeDetails,
  MalAnimeSummary,
  MalPlanToWatchEntry,
  MalRelatedAnime,
} from './mal.ts'
import { formatEasternTime } from './time.ts'
import { getShowWatchUrl, providerLabel } from '../shared/shows.ts'
import type { EpisodeSnapshot, TimingStatus } from './types.ts'
import type {
  AnnouncedBreak,
  PlanToWatchAlertReason,
  ReturnAnnouncement,
  Show,
} from '../shared/types.ts'

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
  /** AniList's broadcast time when the episode already aired in Japan. */
  airedAt?: string | null
  /** A pending announced break for this episode; wins over provider lag. */
  announcedBreak?: AnnouncedBreak | null
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

interface RelatedAnimeAlertInput {
  discord: DiscordConfig
  source: { malId: number; title: string }
  related: MalRelatedAnime
  summary?: MalAnimeSummary | null
}

interface RedditPostAlertPost {
  title: string
  href: string
  subreddit: string | null
}

interface RedditPostAlertInput {
  discord: DiscordConfig
  username: string
  post: RedditPostAlertPost
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

const NOT_CONFIGURED_MESSAGE =
  'Discord not configured. Set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (preferred) or DISCORD_WEBHOOK_URL.'

type DiscordPayload = Record<string, unknown>

/** True when a bot token and channel are set (bot delivery is preferred). */
export function hasDiscordBotConfig(
  discord: Pick<DiscordConfig, 'botToken' | 'channelId'>
): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

/** True when alerts can go out through either the bot or the webhook. */
export function hasDiscordConfig(discord: DiscordConfig): boolean {
  return hasDiscordBotConfig(discord) || Boolean(discord.webhookUrl?.trim())
}

function malAnimeUrl(malId: number | undefined): string {
  return `https://myanimelist.net/anime/${malId}`
}

async function postWebhook(
  webhookUrl: string,
  payload: DiscordPayload
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

/**
 * Sends one message through the bot when configured, else the webhook.
 * Link buttons only work for bot messages, so `components` is added to the
 * bot payload alone; `webhookPayload` replaces the payload for webhooks.
 * `botOnly` names the alert for an error when no bot is configured.
 */
async function deliverDiscordMessage(
  discord: DiscordConfig,
  payload: DiscordPayload,
  {
    components,
    webhookPayload,
    botOnly,
  }: {
    components?: DiscordActionRow[]
    webhookPayload?: DiscordPayload
    botOnly?: string
  } = {}
): Promise<void> {
  if (hasDiscordBotConfig(discord)) {
    await createBotMessage(
      discord.botToken!,
      discord.channelId!,
      components ? { ...payload, components } : payload
    )
    return
  }

  if (botOnly) {
    throw new Error(
      `${botOnly} requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.`
    )
  }

  if (discord.webhookUrl?.trim()) {
    await postWebhook(discord.webhookUrl, webhookPayload ?? payload)
    return
  }

  throw new Error(NOT_CONFIGURED_MESSAGE)
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
  const timingLabel = formatTimingLabel(
    timingStatus,
    expectedDropAt,
    actualDropAt
  )
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
    footer: discordFooter(),
  }
}

function buildEpisodeLinks({
  show,
  latestSnapshot,
  discussionUrl,
}: Pick<EpisodeAlertInput, 'show' | 'latestSnapshot' | 'discussionUrl'>) {
  const links: Array<{ label: string; url: string }> = []

  if (latestSnapshot.watchUrl) {
    links.push({ label: 'Watch', url: latestSnapshot.watchUrl })
  }
  if (discussionUrl) {
    links.push({ label: 'r/anime', url: discussionUrl })
  }
  if (show.malId) {
    links.push({ label: 'MAL', url: malAnimeUrl(show.malId) })
  }

  return links
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
    url: watchUrl || malAnimeUrl(show.malId),
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
        value: `[View on MAL](${malAnimeUrl(show.malId)})`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: discordFooter(),
  }

  const payload = { embeds: [embed] }

  await deliverDiscordMessage(discord, payload)
}

export async function sendRedditPostAlert({
  discord,
  username,
  post,
}: RedditPostAlertInput): Promise<void> {
  const subLabel = post.subreddit ? `r/${post.subreddit}` : 'Reddit'
  const embed = {
    title: post.title,
    url: post.href,
    description: `New post by u/${username} in ${subLabel}`,
    color: 0xff4500,
    timestamp: new Date().toISOString(),
    footer: discordFooter(),
  }

  const components = discordLinkButtonRow([
    discordLinkButton('Reddit', post.href),
  ])

  const payload = {
    content: `**${post.title}** — new post by u/${username}`,
    embeds: [embed],
  }

  await deliverDiscordMessage(discord, payload, { components })
}

export async function sendPlanToWatchAlert({
  discord,
  entry,
  reason,
}: PlanToWatchAlertInput): Promise<void> {
  const malUrl = malAnimeUrl(entry.malId)
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
    footer: discordFooter(),
  }

  const components = discordLinkButtonRow([discordLinkButton('MAL', malUrl)])

  const payload = {
    content: `**${entry.title}** — plan to watch ${isAiring ? 'now airing' : 'starting soon'}`,
    embeds: [embed],
  }

  await deliverDiscordMessage(discord, payload, { components })
}

function formatMalEnum(value: string): string {
  if (value.length <= 3) return value.toUpperCase()
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function sendRelatedAnimeAlert({
  discord,
  source,
  related,
  summary,
}: RelatedAnimeAlertInput): Promise<void> {
  const malUrl = malAnimeUrl(related.malId)
  const relation = related.relationTypeFormatted
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Relation', value: relation, inline: true },
  ]

  if (summary?.mediaType) {
    fields.push({
      name: 'Type',
      value: formatMalEnum(summary.mediaType),
      inline: true,
    })
  }

  if (summary?.status) {
    fields.push({
      name: 'Status',
      value: formatMalEnum(summary.status),
      inline: true,
    })
  }

  if (summary?.startDate) {
    fields.push({ name: 'Starts', value: summary.startDate, inline: true })
  }

  if (summary?.numEpisodes) {
    fields.push({
      name: 'Episodes',
      value: String(summary.numEpisodes),
      inline: true,
    })
  }

  const coverUrl = summary?.coverUrl ?? related.coverUrl
  const embed = {
    title: related.title,
    url: malUrl,
    description: `New ${relation.toLowerCase()} of [${source.title}](${malAnimeUrl(source.malId)}) added on MAL.`,
    color: 0xe67e22,
    thumbnail: coverUrl ? { url: coverUrl } : undefined,
    fields,
    timestamp: new Date().toISOString(),
    footer: discordFooter(),
  }

  const components = discordLinkButtonRow([discordLinkButton('MAL', malUrl)])

  const payload = {
    content: `**${related.title}** — new ${relation.toLowerCase()} of ${source.title}`,
    embeds: [embed],
  }

  await deliverDiscordMessage(discord, payload, { components })
}

export async function sendMalRateLimitAlert({
  discord,
  httpStatus,
  checked,
  total,
}: {
  discord: DiscordConfig
  httpStatus: number
  checked: number
  total: number
}): Promise<void> {
  const payload = {
    content: `MAL rate limited the related anime check (HTTP ${httpStatus})`,
    embeds: [
      {
        title: 'MAL rate limit hit',
        description:
          total > 0
            ? `Stopped after checking ${checked} of ${total} completed titles. The rest will be checked next Sunday.`
            : 'Stopped before the completed list could be fetched. The check will run again next Sunday.',
        color: 0xe74c3c,
        timestamp: new Date().toISOString(),
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload)
}

function formatOutageDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export async function sendMalStatusAlert({
  discord,
  status,
  downSince,
  now = new Date(),
}: {
  discord: DiscordConfig
  status: 'down' | 'up'
  downSince: string
  now?: Date
}): Promise<void> {
  const payload =
    status === 'down'
      ? {
          content: '🔴 MyAnimeList is down',
          embeds: [
            {
              title: 'MAL is down',
              description:
                'The MAL API is not responding. Dashboard progress, scores, and plan-to-watch checks will show as unavailable until it recovers. You will get another message when it is back.',
              color: 0xe74c3c,
              timestamp: downSince,
              footer: discordFooter(),
            },
          ],
        }
      : {
          content: '🟢 MyAnimeList is back up',
          embeds: [
            {
              title: 'MAL is back',
              description: `The MAL API is responding again. Down since ${discordTimestamp(downSince)} (about ${formatOutageDuration(
                now.getTime() - new Date(downSince).getTime()
              )}).`,
              color: 0x2ecc71,
              timestamp: now.toISOString(),
              footer: discordFooter(),
            },
          ],
        }

  await deliverDiscordMessage(discord, payload)
}

export async function sendEpisodeAlert(
  input: EpisodeAlertInput
): Promise<void> {
  const showTitle = input.show.title || input.latestSnapshot.seriesTitle
  const embed = buildEpisodeEmbed(input)
  const links = buildEpisodeLinks(input)

  // Webhook messages can't carry link buttons, so they get a Links field.
  const webhookEmbed =
    links.length > 0
      ? {
          ...embed,
          fields: [
            ...embed.fields,
            {
              name: 'Links',
              value: links
                .map((link) => `[${link.label}](${link.url})`)
                .join(' · '),
              inline: false,
            },
          ],
        }
      : embed

  await deliverDiscordMessage(
    input.discord,
    {
      content: `✅ **${showTitle}** — Episode ${input.episodeNumber} is out!`,
      embeds: [embed],
    },
    {
      components: discordLinkButtonRow(
        links.map((link) => discordLinkButton(link.label, link.url))
      ),
      webhookPayload: { embeds: [webhookEmbed] },
    }
  )
}

export async function sendWaitingAlert({
  discord,
  show,
  episodeNumber,
  expectedDropAt,
  airedAt,
  announcedBreak,
}: WaitingAlertInput): Promise<void> {
  const showTitle = show.title || show.id
  const expectedLabel = formatEasternTime(expectedDropAt)
  const provider = providerLabel(show.provider ?? 'crunchyroll')
  const countdown = discordRelativeTimestamp(expectedDropAt, expectedLabel)
  const emoji = announcedBreak ? '⏸️' : '🤔'
  const headline = announcedBreak
    ? formatAnnouncedBreak(episodeNumber, announcedBreak.newDate)
    : airedAt
      ? `Provider lag: Episode ${episodeNumber} aired in Japan at ${formatEasternTime(airedAt)}, not on ${provider} yet.`
      : `Episode ${episodeNumber} not on ${provider} yet.`
  const sourceUrl = announcedBreak?.sourceUrl ?? null

  const payload = {
    content: `${emoji} **${showTitle}** — ${headline}`,
    embeds: [
      {
        title: `${emoji} ${showTitle} — ${headline}`,
        description: `Expected around ${expectedLabel}. Countdown: ${countdown}`,
        ...(sourceUrl ? { url: sourceUrl } : {}),
        color: 0xf1c40f,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload, {
    components: sourceUrl
      ? discordLinkButtonRow([discordLinkButton('Source', sourceUrl)])
      : undefined,
  })
}

export async function sendRedditFeedErrorAlert({
  discord,
  username,
  status,
}: {
  discord: DiscordConfig
  username: string
  status: number
}): Promise<void> {
  const description =
    `Could not fetch submissions for u/${username} (HTTP ${status}). ` +
    'Reddit often blocks logged-out RSS from GitHub Actions; set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (see README). ' +
    'Post alerts are paused until fetches succeed again.'

  const payload = {
    embeds: [
      {
        title: 'Reddit user feed check failing',
        description,
        color: 0xe67e22,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload)
}

export async function sendNetflixCookieAlert(
  discord: DiscordConfig
): Promise<void> {
  const payload = {
    embeds: [
      {
        title: 'Netflix cookie needs refresh',
        description:
          'The `NETFLIX_COOKIE` GitHub Actions secret is missing or expired. Netflix episode checks are paused until you update it.\n\nCopy your logged-in netflix.com `Cookie` header into the secret, then re-run the check workflow.',
        color: 0xe67e22,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload, {
    botOnly: 'Netflix cookie alert',
  })
}

export async function sendDisneyAuthAlert(
  discord: DiscordConfig
): Promise<void> {
  const payload = {
    embeds: [
      {
        title: 'Disney+ checks need attention',
        description:
          'Disney+ episode checks failed (anonymous metadata was unavailable). Common causes:\n\n• **Geo-block** (`forbidden-location`) — GitHub Actions uses datacenter IPs. Disney shows are skipped for this run; run `pnpm check` from home when you need Disney baseline/alerts.\n• **Expired refresh token** — Re-copy `context.refreshToken` from DevTools on disneyplus.com (see README §6) into `DISNEY_REFRESH_TOKEN`.\n\nOther providers continue normally.',
        color: 0xe67e22,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload, {
    botOnly: 'Disney+ auth alert',
  })
}

export async function sendAnnouncedBreakAlert({
  discord,
  show,
  episodeNumber,
  newDate,
  sourceUrl,
}: {
  discord: DiscordConfig
  show: Show
  episodeNumber: number
  newDate: string | null
  sourceUrl: string | null
}): Promise<void> {
  const showTitle = show.title || show.id
  const headline = formatAnnouncedBreak(episodeNumber, newDate)

  const payload = {
    content: `⏸️ **${showTitle}** — ${headline}`,
    embeds: [
      {
        title: `⏸️ ${showTitle} — ${headline}`,
        description:
          'Read from the official news. Drop times stay put until you add the break in the admin.',
        ...(sourceUrl ? { url: sourceUrl } : {}),
        color: 0x9b59b6,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload, {
    components: sourceUrl
      ? discordLinkButtonRow([discordLinkButton('Source', sourceUrl)])
      : undefined,
  })
}

const ADMIN_ON_HOLD_URL = 'https://anime-ep-checker.dev/on-hold'

export async function sendReturnAnnouncementAlert({
  discord,
  show,
  announcement,
}: {
  discord: DiscordConfig
  show: Show
  announcement: ReturnAnnouncement
}): Promise<void> {
  const showTitle = show.title || show.id
  const headline = formatReturnAnnouncement(announcement)
  const onHoldUrl = `${ADMIN_ON_HOLD_URL}#show-${encodeURIComponent(show.id)}`

  const payload = {
    content: `▶️ **${showTitle}** — ${headline}`,
    embeds: [
      {
        title: `▶️ ${showTitle} — ${headline}`,
        description: `Read from the news. It stays [On hold](${onHoldUrl}) until you move it back to Watching.`,
        ...(announcement.sourceUrl ? { url: announcement.sourceUrl } : {}),
        color: 0x2ecc71,
        footer: discordFooter(),
      },
    ],
  }

  await deliverDiscordMessage(discord, payload, {
    components: discordLinkButtonRow([
      ...(announcement.sourceUrl
        ? [discordLinkButton('Source', announcement.sourceUrl)]
        : []),
      discordLinkButton('On hold', onHoldUrl),
    ]),
  })
}
