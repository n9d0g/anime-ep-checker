// Zero-dep gate for GitHub Actions (plain Node, no pnpm install).
// Schedule logic mirrors src/schedule.ts — keep window constants and helpers in sync.
/* global process, console, fetch, Buffer */
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const WINDOW_BEFORE_MS = 5 * 60 * 1000
const WINDOW_AFTER_DENSE_MS = 90 * 60 * 1000
const LATE_POLL_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000
const PTW_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOWS_PATH = process.env.SHOWS_PATH ?? resolve(ROOT, 'shows.json')
const STATE_PATH = process.env.STATE_PATH ?? resolve(ROOT, 'state.json')

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function getPremiereBatchSize(schedule) {
  return schedule.premiereBatchSize > 0 ? schedule.premiereBatchSize : 1
}

function getLastScheduledEpisode(schedule) {
  if (schedule.mode === 'ongoing' || schedule.episodeCount === null) {
    return null
  }
  return schedule.startEpisode + schedule.episodeCount - 1
}

function isEpisodeInSchedule(schedule, episodeNumber) {
  if (episodeNumber < schedule.startEpisode) {
    return false
  }
  const lastEpisode = getLastScheduledEpisode(schedule)
  if (lastEpisode !== null && episodeNumber > lastEpisode) {
    return false
  }
  return true
}

function getExpectedDropAt(schedule, episodeNumber) {
  if (!isEpisodeInSchedule(schedule, episodeNumber)) {
    return null
  }
  const start = new Date(schedule.startAt)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const batchSize = getPremiereBatchSize(schedule)
  const batchEnd = schedule.startEpisode + batchSize - 1
  if (episodeNumber <= batchEnd) {
    return start
  }
  const weeksAfterBatch = episodeNumber - batchEnd
  return new Date(start.getTime() + weeksAfterBatch * MS_PER_WEEK)
}

function getNextExpectedEpisode(schedule, lastEpisodeNumber) {
  const next =
    lastEpisodeNumber === null ? schedule.startEpisode : lastEpisodeNumber + 1
  if (!isEpisodeInSchedule(schedule, next)) {
    return null
  }
  return next
}

function isInDenseCheckWindow(expectedAt, now) {
  const nowMs = now.getTime()
  const expectedMs = expectedAt.getTime()
  return (
    nowMs >= expectedMs - WINDOW_BEFORE_MS &&
    nowMs <= expectedMs + WINDOW_AFTER_DENSE_MS
  )
}

function isInLateCheckSlot(expectedAt, now) {
  const elapsed = now.getTime() - (expectedAt.getTime() + WINDOW_AFTER_DENSE_MS)
  if (elapsed < 0) {
    return false
  }

  return (
    Math.floor(elapsed / LATE_POLL_INTERVAL_MS) !==
    Math.floor((elapsed - CRON_INTERVAL_MS) / LATE_POLL_INTERVAL_MS)
  )
}

function isInCheckWindow(expectedAt, now) {
  return (
    isInDenseCheckWindow(expectedAt, now) || isInLateCheckSlot(expectedAt, now)
  )
}

function getCheckWindowMode(expectedAt, now) {
  if (isInDenseCheckWindow(expectedAt, now)) {
    return 'dense'
  }
  if (isInLateCheckSlot(expectedAt, now)) {
    return 'late'
  }
  return null
}

function parseEpisodeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function showNeedsCheck(show, state, now) {
  const previousState = state.shows[show.id] ?? null
  const lastEpisodeNumber = previousState
    ? parseEpisodeNumber(previousState.lastEpisodeNumber)
    : null
  const nextExpectedEp = getNextExpectedEpisode(
    show.schedule,
    lastEpisodeNumber
  )
  if (nextExpectedEp === null) {
    return false
  }
  const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
  if (!expectedAt) {
    return false
  }
  return isInCheckWindow(expectedAt, now)
}

function getActiveCheckModes(shows, state, now) {
  const modes = new Set()

  for (const show of shows) {
    const previousState = state.shows[show.id] ?? null
    const lastEpisodeNumber = previousState
      ? parseEpisodeNumber(previousState.lastEpisodeNumber)
      : null
    const nextExpectedEp = getNextExpectedEpisode(
      show.schedule,
      lastEpisodeNumber
    )
    if (nextExpectedEp === null) {
      continue
    }
    const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
    if (!expectedAt) {
      continue
    }
    const mode = getCheckWindowMode(expectedAt, now)
    if (mode) {
      modes.add(mode)
    }
  }

  return [...modes]
}

function needsPlanToWatchCheck(state, now) {
  const checkedAt = state.meta?.planToWatchCheckedAt
  if (!checkedAt) {
    return true
  }

  const checkedMs = new Date(checkedAt).getTime()
  if (Number.isNaN(checkedMs)) {
    return true
  }

  return now.getTime() - checkedMs >= PTW_CHECK_INTERVAL_MS
}

function hasOrphanedShows(shows, state) {
  const activeIds = new Set(shows.map((show) => show.id))

  for (const showId of Object.keys(state.shows ?? {})) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  const messageIds = state.meta?.watchingDashboardMessageIds ?? {}
  for (const showId of Object.keys(messageIds)) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  return false
}

// Keep in sync with src/reddit-feeds.ts
const REDDIT_USER_AGENT = 'node:anime-ep-checker:1.0 (by /u/n9d0g)'
const REDDIT_FEED_STALE_MS = 2 * 60 * 60 * 1000
const EASTERN_TZ = 'America/New_York'
const REDDIT_FEED_WINDOW_DAYS = 2
const REDDIT_FEED_POLL_INTERVAL_MS = 15 * 60 * 1000

let cachedRedditOAuthToken = null
const REDDIT_USER_FEEDS = [
  {
    id: 'animecorner',
    username: 'animecorner',
    titlePattern: /^top\s*10\b/i,
    postDays: [5],
  },
  {
    id: 'abysswatcherbel',
    username: 'Abysswatcherbel',
    postDays: [0],
  },
]

function getEasternParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const result = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type] = Number(part.value)
    }
  }
  return result
}

function getEasternMidnight(year, month, day) {
  const utcMidnight = Date.UTC(year, month - 1, day)
  const p = getEasternParts(utcMidnight)
  const offsetMs =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    utcMidnight
  return new Date(utcMidnight - offsetMs)
}

function getRedditFeedWindowStart(feed, now) {
  const today = getEasternParts(now.getTime())
  for (let daysBack = 0; daysBack < REDDIT_FEED_WINDOW_DAYS; daysBack++) {
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day - daysBack)
    )
    if (feed.postDays.includes(day.getUTCDay())) {
      return getEasternMidnight(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate()
      )
    }
  }
  return null
}

function isRedditFeedPollSlot(now) {
  const ms = now.getTime()
  return (
    Math.floor(ms / REDDIT_FEED_POLL_INTERVAL_MS) !==
    Math.floor((ms - CRON_INTERVAL_MS) / REDDIT_FEED_POLL_INTERVAL_MS)
  )
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractPostId(rawId) {
  const trimmed = rawId.trim()
  const t3Match = trimmed.match(/(t3_[a-z0-9]+)/i)
  if (t3Match) {
    return t3Match[1]
  }
  return trimmed
}

function parseRedditUserFeedEntries(xml) {
  const entries = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g

  for (const match of xml.matchAll(entryRegex)) {
    const block = match[1]
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const rawId = block.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? ''
    const link =
      block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      ''

    if (!title || !link) {
      continue
    }

    const decodedTitle = decodeXmlEntities(title.trim())
    if (decodedTitle.toLowerCase().startsWith('submitted by ')) {
      continue
    }

    entries.push({
      id: extractPostId(decodeXmlEntities(rawId)),
      title: decodedTitle,
    })
  }

  return entries
}

function matchesRedditFeedTitle(feed, title) {
  if (!feed.titlePattern) {
    return true
  }
  return feed.titlePattern.test(title)
}

function getRedditCredentials() {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim()
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return null
  }
  return { clientId, clientSecret }
}

async function getRedditAccessToken() {
  const creds = getRedditCredentials()
  if (!creds) {
    return null
  }

  const now = Date.now()
  if (
    cachedRedditOAuthToken &&
    cachedRedditOAuthToken.expiresAt > now + 60_000
  ) {
    return cachedRedditOAuthToken.token
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
    'base64'
  )

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    console.warn(`Reddit OAuth token failed (${response.status})`)
    return null
  }

  const data = await response.json()
  cachedRedditOAuthToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }
  return cachedRedditOAuthToken.token
}

function mapOAuthListingToEntries(json) {
  const children = json?.data?.children ?? []
  const entries = []

  for (const child of children) {
    const data = child?.data
    if (!data?.id || !data.title) {
      continue
    }
    entries.push({
      id: `t3_${data.id}`,
      title: data.title,
    })
  }

  return entries
}

async function fetchRedditUserFeedEntriesOAuth(username, token) {
  const url = `https://oauth.reddit.com/user/${username}/submitted?limit=25&raw_json=1`
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Authorization: `bearer ${token}`,
    },
  })

  if (response.status === 429) {
    console.warn(
      `Reddit OAuth rate limited (429) for u/${username}; gate treats as fetch failure`
    )
    return { ok: false, status: 429 }
  }

  if (!response.ok) {
    console.warn(
      `Reddit OAuth listing failed (${response.status}) for u/${username}; gate treats as fetch failure`
    )
    return { ok: false, status: response.status }
  }

  const json = await response.json()
  return { ok: true, entries: mapOAuthListingToEntries(json) }
}

async function fetchRedditUserFeedEntriesRss(username) {
  const url = `https://www.reddit.com/user/${username}/submitted.rss?limit=25`
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Accept:
        'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*',
    },
  })

  if (response.status === 429) {
    console.warn(
      `Reddit user RSS rate limited (429) for u/${username}; gate treats as fetch failure`
    )
    return { ok: false, status: 429 }
  }

  if (!response.ok) {
    console.warn(
      `Reddit user RSS failed (${response.status}) for u/${username}; gate treats as fetch failure`
    )
    return { ok: false, status: response.status }
  }

  const xml = await response.text()
  return { ok: true, entries: parseRedditUserFeedEntries(xml) }
}

async function fetchRedditUserFeedEntries(username) {
  const token = await getRedditAccessToken()
  if (token) {
    return fetchRedditUserFeedEntriesOAuth(username, token)
  }
  return fetchRedditUserFeedEntriesRss(username)
}

async function needsRedditFeedCheck(state, now) {
  const feedState = state.meta?.redditUserFeeds ?? {}

  for (const feed of REDDIT_USER_FEEDS) {
    const entry = feedState[feed.id]
    if (!entry) {
      return true
    }

    // Only poll on the account's posting day (+1 grace day, Eastern), every
    // 15 minutes, until this window's post has been seen.
    const windowStart = getRedditFeedWindowStart(feed, now)
    if (!windowStart) {
      continue
    }
    const lastPostMs = entry.lastPostPublishedAt
      ? new Date(entry.lastPostPublishedAt).getTime()
      : 0
    if (lastPostMs >= windowStart.getTime()) {
      continue
    }
    if (!isRedditFeedPollSlot(now)) {
      continue
    }

    const result = await fetchRedditUserFeedEntries(feed.username)
    if (!result.ok) {
      const lastSuccessMs = Math.max(
        entry.checkedAt ? new Date(entry.checkedAt).getTime() : 0,
        windowStart.getTime()
      )
      if (now.getTime() - lastSuccessMs > REDDIT_FEED_STALE_MS) {
        const alertSentAt = entry.errorAlertSentAt
        if (alertSentAt && new Date(alertSentAt).getTime() >= lastSuccessMs) {
          continue
        }
        console.log(
          `Reddit feed u/${feed.username} fetch failed; last success is stale — running full check`
        )
        return true
      }
      continue
    }

    const seen = new Set(feedState[feed.id].seenPostIds ?? [])
    const hasNew = result.entries.some(
      (entry) =>
        matchesRedditFeedTitle(feed, entry.title) && !seen.has(entry.id)
    )
    if (hasNew) {
      return true
    }
  }

  return false
}

const showsFile = readJson(SHOWS_PATH, { shows: [] })
const state = readJson(STATE_PATH, { shows: {} })
const now = new Date()
const shows = showsFile.shows ?? []
const needsCheck = shows.some((show) => showNeedsCheck(show, state, now))
const needsPtwCheck = needsPlanToWatchCheck(state, now)
const hasOrphans = hasOrphanedShows(shows, state)
const needsRedditCheck = await needsRedditFeedCheck(state, now)
const shouldRun = needsCheck || needsPtwCheck || hasOrphans || needsRedditCheck
const activeModes = getActiveCheckModes(shows, state, now)

const outputFile = process.env.GITHUB_OUTPUT
if (outputFile) {
  appendFileSync(outputFile, `should_check=${shouldRun}\n`)
  appendFileSync(outputFile, `reddit_check=${needsRedditCheck}\n`)
}

if (shouldRun) {
  if (needsCheck) {
    const modeLabel = activeModes.join(' + ') || 'active'
    console.log(`At least one show is in the ${modeLabel} check window.`)
  }
  if (needsPtwCheck) {
    console.log('Plan-to-watch check is due (24h cadence).')
  }
  if (hasOrphans) {
    console.log('Removed show still present in state; running cleanup.')
  }
  if (needsRedditCheck) {
    console.log('Reddit user feed check needed (new post or baseline).')
  }
} else {
  console.log(
    'No shows in active check window, plan-to-watch check not due, and no new Reddit posts; skipping full check.'
  )
}
