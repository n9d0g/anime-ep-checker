import { getShowsFile, getStateFile } from './github'
import {
  findShowByOption,
  getShowWatchUrl,
  providerLabel,
  showAutocompleteChoices,
} from './shows'
import {
  getExpectedDropAt,
  getNextExpectedEpisode,
  parseEpisodeNumber,
} from './schedule'
import {
  adjustMalWatchedEpisode,
  fetchMalAnimeDetails,
  formatMalWatchedLabel,
  setMalWatchedEpisode,
} from './mal'
import { createBotChannelMessage } from './discord'
import type { Show } from './types'

function discordRelativeTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const unix = Math.floor(new Date(iso).getTime() / 1000)
  if (!Number.isFinite(unix) || unix <= 0) return '—'
  return `<t:${unix}:R>`
}

function formatMalScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '—'
  }
  return score.toFixed(2)
}

async function loadTrackedShows(): Promise<Show[]> {
  const { content } = await getShowsFile()
  return (content.shows ?? []) as Show[]
}

function buildShowEmbed(show: Show, details: Awaited<ReturnType<typeof fetchMalAnimeDetails>>) {
  const watchUrl = getShowWatchUrl(show)
  return {
    title: show.title || show.id,
    url: watchUrl || undefined,
    thumbnail: details.coverUrl ? { url: details.coverUrl } : undefined,
    color: 0x3498db,
    fields: [
      {
        name: 'Provider',
        value: providerLabel(show.provider),
        inline: true,
      },
      {
        name: 'MAL',
        value: formatMalWatchedLabel(details.watched, details.total),
        inline: true,
      },
      {
        name: 'MAL score',
        value: formatMalScore(details.meanScore),
        inline: true,
      },
    ],
    footer: { text: 'Anime Episode Checker' },
  }
}

export async function handleSlashAutocomplete(
  commandName: string,
  focusedOption: { name: string; value?: string }
) {
  const shows = await loadTrackedShows()

  if (
    (commandName === 'show' && focusedOption.name === 'title') ||
    (commandName === 'mal' && focusedOption.name === 'show') ||
    (commandName === 'score-alert' && focusedOption.name === 'show')
  ) {
    return {
      type: 8,
      data: {
        choices: showAutocompleteChoices(shows, focusedOption.value ?? ''),
      },
    }
  }

  return {
    type: 8,
    data: { choices: [] },
  }
}

export async function handleSlashCommand(
  commandName: string,
  options: Array<{ name: string; type: number; value?: string | number }>
) {
  const optionMap = new Map(options.map((option) => [option.name, option.value]))

  if (commandName === 'next') {
    const shows = await loadTrackedShows()
    const { content: stateFile } = await getStateFile()
    const now = new Date()
    const lines: string[] = []

    for (const show of shows) {
      const showState = stateFile.shows?.[show.id]
      const lastEpisode = showState
        ? parseEpisodeNumber(showState.lastEpisodeNumber)
        : null
      const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisode)
      if (nextEpisode === null) continue

      const expectedAt = getExpectedDropAt(show.schedule, nextEpisode)
      if (!expectedAt) continue

      let scoreLabel = '—'
      if (show.malId) {
        try {
          const details = await fetchMalAnimeDetails(show.malId)
          scoreLabel = formatMalScore(details.meanScore)
        } catch {
          scoreLabel = 'unavailable'
        }
      }

      lines.push(
        `**${show.title || show.id}** — ep ${nextEpisode} · ${discordRelativeTimestamp(expectedAt.toISOString())} · MAL ${scoreLabel}`
      )
    }

    return {
      type: 4,
      data: {
        content:
          lines.length > 0
            ? lines.join('\n')
            : 'No upcoming drops on the schedule.',
        flags: 64,
      },
    }
  }

  if (commandName === 'show') {
    const shows = await loadTrackedShows()
    const show = findShowByOption(shows, String(optionMap.get('title') ?? ''))

    if (!show) {
      return {
        type: 4,
        data: { content: 'Show not found.', flags: 64 },
      }
    }

    if (!show.malId) {
      return {
        type: 4,
        data: {
          content: `${show.title} has no malId configured in shows.json.`,
          flags: 64,
        },
      }
    }

    const details = await fetchMalAnimeDetails(show.malId)
    const { content: stateFile } = await getStateFile()
    const lastEpisode = stateFile.shows?.[show.id]
      ? parseEpisodeNumber(stateFile.shows[show.id].lastEpisodeNumber)
      : null
    const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisode)
    const expectedAt =
      nextEpisode !== null ? getExpectedDropAt(show.schedule, nextEpisode) : null

    const embed = buildShowEmbed(show, details)
    embed.fields.push(
      {
        name: 'Next',
        value: nextEpisode !== null ? `Episode ${nextEpisode}` : 'Season complete',
        inline: true,
      },
      {
        name: 'Countdown',
        value: expectedAt
          ? discordRelativeTimestamp(expectedAt.toISOString())
          : '—',
        inline: true,
      }
    )

    return {
      type: 4,
      data: {
        embeds: [embed],
        flags: 64,
      },
    }
  }

  if (commandName === 'mal') {
    const shows = await loadTrackedShows()
    const show = findShowByOption(shows, String(optionMap.get('show') ?? ''))
    const action = String(optionMap.get('action') ?? '')

    if (!show?.malId) {
      return {
        type: 4,
        data: { content: 'Show not found or missing malId.', flags: 64 },
      }
    }

    if (action === 'up') {
      const result = await adjustMalWatchedEpisode(show.malId, 1)
      return {
        type: 4,
        data: {
          content: result.updated
            ? `Updated **${show.title}** to ${formatMalWatchedLabel(result.watched, result.total)}.`
            : `Already at ${formatMalWatchedLabel(result.watched, result.total)}.`,
          flags: 64,
        },
      }
    }

    if (action === 'down') {
      const result = await adjustMalWatchedEpisode(show.malId, -1)
      return {
        type: 4,
        data: {
          content: result.updated
            ? `Updated **${show.title}** to ${formatMalWatchedLabel(result.watched, result.total)}.`
            : `Already at ${formatMalWatchedLabel(result.watched, result.total)}.`,
          flags: 64,
        },
      }
    }

    if (action === 'set') {
      const episode = Number(optionMap.get('episode'))
      if (!Number.isFinite(episode) || episode < 0) {
        return {
          type: 4,
          data: { content: 'Provide a valid episode number for `set`.', flags: 64 },
        }
      }

      const result = await setMalWatchedEpisode(show.malId, episode)
      return {
        type: 4,
        data: {
          content: result.updated
            ? `Set **${show.title}** to ${formatMalWatchedLabel(result.watched, result.total)}.`
            : `Already at ${formatMalWatchedLabel(result.watched, result.total)}.`,
          flags: 64,
        },
      }
    }

    return {
      type: 4,
      data: { content: 'Unknown MAL action.', flags: 64 },
    }
  }

  if (commandName === 'score-alert') {
    const shows = await loadTrackedShows()
    const show = findShowByOption(shows, String(optionMap.get('show') ?? ''))
    const kind = String(optionMap.get('kind') ?? 'pickup')
    const note = String(optionMap.get('note') ?? '').trim()
    const channelId = process.env.DISCORD_CHANNEL_ID?.trim()

    if (!show?.malId) {
      return {
        type: 4,
        data: { content: 'Show not found or missing malId.', flags: 64 },
      }
    }

    if (!channelId) {
      return {
        type: 4,
        data: {
          content: 'DISCORD_CHANNEL_ID is not configured on Vercel.',
          flags: 64,
        },
      }
    }

    const details = await fetchMalAnimeDetails(show.malId)
    const isPickup = kind === 'pickup'
    const watchUrl = getShowWatchUrl(show)
    const score = details.meanScore ?? 0

    await createBotChannelMessage(channelId, {
      embeds: [
        {
          title: isPickup
            ? `${show.title} — MAL score pickup`
            : `${show.title} — MAL score drop`,
          url: watchUrl || `https://myanimelist.net/anime/${show.malId}`,
          description: note || undefined,
          color: isPickup ? 0x2ecc71 : 0xe74c3c,
          thumbnail: details.coverUrl ? { url: details.coverUrl } : undefined,
          fields: [
            {
              name: 'Score',
              value: formatMalScore(score),
              inline: false,
            },
          ],
          footer: { text: 'Anime Episode Checker · manual score alert' },
        },
      ],
    })

    return {
      type: 4,
      data: {
        content: `Posted ${kind} alert for **${show.title}** to <#${channelId}>.`,
        flags: 64,
      },
    }
  }

  return {
    type: 4,
    data: { content: 'Unknown command.', flags: 64 },
  }
}
