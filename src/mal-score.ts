import { getShowState } from './compare.js'
import { sendMalScoreAlert } from './discord.js'
import type { DiscordConfig } from './discord.js'
import { fetchMalAnimeDetails } from './mal.js'
import type { Show, StateFile } from './types.js'

function hasBotConfig(discord: DiscordConfig): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

export async function syncMalScoreAlerts({
  shows,
  state,
  discord,
  now = new Date(),
  dryRun = false,
}: {
  shows: Show[]
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
}): Promise<boolean> {
  let changed = false

  for (const show of shows) {
    if (!show.malId) continue

    const showState = getShowState(state, show.id)
    if (!showState) continue

    const result = await fetchMalAnimeDetails(show.malId)
    if (result.status !== 'ok' || result.details.meanScore === null) {
      continue
    }

    const currentScore = result.details.meanScore
    const previousScore = showState.malMeanScore ?? null

    if (previousScore !== null && currentScore !== previousScore) {
      const direction = currentScore > previousScore ? 'pickup' : 'drop'

      if (!dryRun && hasBotConfig(discord)) {
        await sendMalScoreAlert({
          discord,
          show,
          previousScore,
          newScore: currentScore,
          direction,
          coverUrl: result.details.coverUrl,
        })
        console.log(
          `  MAL score ${direction} alert for ${show.title || show.id}: ${previousScore.toFixed(2)} → ${currentScore.toFixed(2)}`
        )
      } else if (dryRun) {
        console.log(
          `  Would send MAL score ${direction} alert for ${show.title || show.id}`
        )
      }

      state.shows[show.id] = {
        ...showState,
        malMeanScore: currentScore,
        malScoreAlertedAt: now.toISOString(),
      }
      changed = true
      continue
    }

    if (previousScore !== currentScore) {
      state.shows[show.id] = {
        ...showState,
        malMeanScore: currentScore,
      }
      changed = true
    }
  }

  return changed
}
