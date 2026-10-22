// Looks a show up on its provider: resolves the provider ID, falls back to
// AniList when Disney+ has nothing or can't log in, and owns the one-time
// provider-login alerts (Netflix cookie, Disney+ refresh token).
import { getLatestAiredEpisode } from './anilist.ts'
import { getLatestAvailableEpisodeForSeries } from './crunchyroll.ts'
import {
  hasDiscordBotConfig,
  sendDisneyAuthAlert,
  sendNetflixCookieAlert,
  type DiscordConfig,
} from './discord.ts'
import {
  DisneyAuthError,
  getLatestAvailableEpisodeForTitle as getLatestDisneyEpisode,
} from './disney.ts'
import {
  getLatestAvailableEpisodeForTitle as getLatestNetflixEpisode,
  NetflixAuthError,
} from './netflix.ts'
import {
  parseDisneyIdFromUrl,
  parseNetflixIdFromUrl,
  parseSeriesIdFromUrl,
} from '../shared/provider-urls.ts'
import { getShowWatchUrl, normalizeShowProvider } from '../shared/shows.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { Show, StateFile } from '../shared/types.ts'

export type FetchEpisode = (show: Show) => Promise<EpisodeSnapshot | null>

function requireParsedId(id: string | null, message: string): string {
  if (!id) {
    throw new Error(message)
  }
  return id
}

export function resolveProviderId(show: Show): string {
  const normalized = normalizeShowProvider(show)

  if (normalized.provider === 'netflix') {
    if (normalized.netflixId) return normalized.netflixId
    if (normalized.netflixUrl) {
      return requireParsedId(
        parseNetflixIdFromUrl(normalized.netflixUrl),
        `Could not parse Netflix title ID from URL: ${normalized.netflixUrl}`
      )
    }
    throw new Error(`Netflix ID missing for show ${show.id}`)
  }

  if (normalized.provider === 'disney') {
    if (normalized.disneyId) return normalized.disneyId
    if (normalized.disneyUrl) {
      return requireParsedId(
        parseDisneyIdFromUrl(normalized.disneyUrl),
        `Could not parse Disney+ ID from URL: ${normalized.disneyUrl}`
      )
    }
    throw new Error(`Disney+ ID missing for show ${show.id}`)
  }

  if (normalized.seriesId) return normalized.seriesId
  if (normalized.crunchyrollUrl) {
    return requireParsedId(
      parseSeriesIdFromUrl(normalized.crunchyrollUrl),
      `Could not parse Crunchyroll series ID from URL: ${normalized.crunchyrollUrl}`
    )
  }
  throw new Error(`Crunchyroll series ID missing for show ${show.id}`)
}

/** Default lookup for Crunchyroll and Netflix shows. */
export async function fetchLatestEpisode(
  show: Show
): Promise<EpisodeSnapshot | null> {
  const normalized = normalizeShowProvider(show)
  const providerId = resolveProviderId(normalized)

  if (normalized.provider === 'netflix') {
    return getLatestNetflixEpisode(providerId)
  }

  return getLatestAvailableEpisodeForSeries(providerId)
}

async function tryDisneyAnilistFallback(
  show: Show,
  disneyId: string,
  expectedAt: Date,
  now: Date
): Promise<EpisodeSnapshot | null> {
  if (!show.malId) {
    console.log('  AniList fallback unavailable: show has no malId')
    return null
  }

  if (now.getTime() < expectedAt.getTime()) {
    console.log('  AniList fallback skipped: before the next drop')
    return null
  }

  const aired = await getLatestAiredEpisode(show.malId, now)
  if (!aired) {
    return null
  }

  console.log(`  AniList fallback: latest aired episode ${aired.episodeNumber}`)

  return {
    provider: 'disney',
    seriesId: disneyId,
    seriesTitle: aired.seriesTitle || show.title,
    seasonId: disneyId,
    seasonTitle: 'Season 1',
    episode: {
      id: `anilist-${show.malId}-${aired.episodeNumber}`,
      episode: aired.episodeNumber,
      availableAt: null,
    },
    watchUrl: getShowWatchUrl(show),
    seasonNumbered: true,
  }
}

type LoginProvider = 'netflix' | 'disney'

const LOGIN_ALERTS: Record<
  LoginProvider,
  {
    flag: 'netflixCookieAlertSentAt' | 'disneyCookieAlertSentAt'
    alertName: string
    /** State-change reasons. */
    setReason: string
    clearedReason: string
    send: (discord: DiscordConfig) => Promise<void>
  }
> = {
  netflix: {
    flag: 'netflixCookieAlertSentAt',
    alertName: 'Netflix cookie refresh alert',
    setReason: 'Netflix cookie alert flag set',
    clearedReason: 'cleared Netflix auth alert flag for',
    send: sendNetflixCookieAlert,
  },
  disney: {
    flag: 'disneyCookieAlertSentAt',
    alertName: 'Disney+ refresh token alert',
    setReason: 'Disney auth alert flag set',
    clearedReason: 'cleared Disney auth alert flag for',
    send: sendDisneyAuthAlert,
  },
}

/**
 * Provider lookups for one check run. A provider-login failure sends its alert
 * once (until the provider answers again) and is remembered for the rest of
 * the run: later Netflix shows are skipped, later Disney+ shows go straight
 * to AniList.
 */
export function createProviderLookup({
  discord,
  dryRun,
  state,
  now,
  noteStateChange,
  fetchEpisode = fetchLatestEpisode,
}: {
  discord: DiscordConfig
  dryRun: boolean
  state: StateFile
  now: Date
  noteStateChange: (reason: string) => void
  fetchEpisode?: FetchEpisode
}) {
  const loginFailed: Record<LoginProvider, boolean> = {
    netflix: false,
    disney: false,
  }

  async function setLoginAlert(provider: LoginProvider): Promise<void> {
    const alert = LOGIN_ALERTS[provider]
    if (state.meta?.[alert.flag]) {
      console.log(`  ${alert.alertName} already sent; skipping`)
      return
    }

    if (!dryRun && hasDiscordBotConfig(discord)) {
      await alert.send(discord)
      console.log(`  ${alert.alertName} sent via Discord bot`)
    } else if (!dryRun) {
      console.log(`  Discord bot not configured; skipping ${alert.alertName}`)
    }

    state.meta = { ...state.meta, [alert.flag]: now.toISOString() }
    noteStateChange(alert.setReason)
  }

  function clearLoginAlert(provider: LoginProvider, show: Show): void {
    const alert = LOGIN_ALERTS[provider]
    if (!state.meta?.[alert.flag]) {
      return
    }
    state.meta = { ...state.meta, [alert.flag]: null }
    noteStateChange(`${alert.clearedReason} ${show.title || show.id}`)
  }

  function logNoEpisodes(show: Show, snapshot: EpisodeSnapshot | null) {
    if (!snapshot) {
      console.log(`  No available episodes found for ${show.id}`)
    }
    return snapshot
  }

  async function lookUpNetflix(show: Show): Promise<EpisodeSnapshot | null> {
    if (loginFailed.netflix) {
      console.log(
        '  Skipping Netflix show (cookie auth failed earlier this run)'
      )
      return null
    }

    let snapshot: EpisodeSnapshot | null
    try {
      snapshot = await fetchEpisode(show)
    } catch (error) {
      if (!(error instanceof NetflixAuthError)) {
        throw error
      }
      console.error(`  Netflix auth failed: ${error.message}`)
      loginFailed.netflix = true
      await setLoginAlert('netflix')
      return null
    }

    clearLoginAlert('netflix', show)
    return logNoEpisodes(show, snapshot)
  }

  async function lookUpDisney(
    show: Show,
    disneyId: string,
    expectedAt: Date
  ): Promise<EpisodeSnapshot | null> {
    if (loginFailed.disney) {
      console.log(
        '  Disney+ API unavailable; trying AniList fallback for this show'
      )
    } else {
      try {
        const snapshot = await getLatestDisneyEpisode(disneyId)
        clearLoginAlert('disney', show)
        if (snapshot) {
          return snapshot
        }
        console.log(
          '  Disney+ API returned no episodes; trying AniList fallback'
        )
      } catch (error) {
        if (!(error instanceof DisneyAuthError)) {
          throw error
        }
        console.error(`  Disney+ auth failed: ${error.message}`)
        loginFailed.disney = true
        await setLoginAlert('disney')
      }
    }

    const fallback = await tryDisneyAnilistFallback(
      show,
      disneyId,
      expectedAt,
      now
    )
    return logNoEpisodes(show, fallback)
  }

  /**
   * The show's episode snapshot from its provider, or null (already logged)
   * when there is nothing to decide on this run.
   */
  function lookUpEpisode(
    show: Show,
    providerId: string,
    expectedAt: Date
  ): Promise<EpisodeSnapshot | null> {
    if (show.provider === 'disney') {
      return lookUpDisney(show, providerId, expectedAt)
    }
    if (show.provider === 'netflix') {
      return lookUpNetflix(show)
    }
    return fetchEpisode(show).then((snapshot) => logNoEpisodes(show, snapshot))
  }

  return { lookUpEpisode }
}
