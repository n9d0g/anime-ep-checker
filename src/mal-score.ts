import { getShowState } from './compare.ts'
import { hasDiscordBotConfig, sendMalScoreAlert } from './discord.ts'
import type { DiscordConfig } from './discord.ts'
import { fetchMalAnimeDetails } from './mal.ts'
import type { Show, StateFile } from '../shared/types.ts'

const MAL_SCORE_ALERT_DELTA = 0.05

interface MalScoreSyncResult {
  changed: boolean
  reasons: string[]
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
}): Promise<MalScoreSyncResult> {
  let changed = false
  const reasons: string[] = []
  const showTitle = (show: Show) => show.title || show.id

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

    if (previousScore === null) {
      if (currentScore !== previousScore) {
        state.shows[show.id] = {
          ...showState,
          malMeanScore: currentScore,
        }
        reasons.push(
          `MAL score stored ${showTitle(show)} ${currentScore.toFixed(2)}`
        )
        changed = true
      }
      continue
    }

    if (currentScore === previousScore) {
      continue
    }

    const delta = Math.abs(currentScore - previousScore)
    if (delta < MAL_SCORE_ALERT_DELTA) {
      console.log(
        `  MAL score change for ${showTitle(show)} below threshold (${delta.toFixed(2)} < ${MAL_SCORE_ALERT_DELTA}); ignoring`
      )
      continue
    }

    const direction = currentScore > previousScore ? 'pickup' : 'drop'

    if (!dryRun && hasDiscordBotConfig(discord)) {
      await sendMalScoreAlert({
        discord,
        show,
        previousScore,
        newScore: currentScore,
        direction,
        coverUrl: result.details.coverUrl,
      })
      console.log(
        `  MAL score ${direction} alert for ${showTitle(show)}: ${previousScore.toFixed(2)} → ${currentScore.toFixed(2)}`
      )
    } else if (dryRun) {
      console.log(
        `  Would send MAL score ${direction} alert for ${showTitle(show)}`
      )
    }

    state.shows[show.id] = {
      ...showState,
      malMeanScore: currentScore,
      malScoreAlertedAt: now.toISOString(),
    }
    reasons.push(
      `MAL score ${showTitle(show)} ${previousScore.toFixed(2)}→${currentScore.toFixed(2)}`
    )
    changed = true
  }

  return { changed, reasons }
}
