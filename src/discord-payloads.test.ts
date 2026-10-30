import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { syncWatchingDashboard } from './discord-dashboard.ts'
import {
  buildShowDashboardPayload,
  buildShowDashboardRow,
} from './dashboard.ts'
import type { ShowDashboardRow } from './dashboard.ts'
import {
  sendAnnouncedBreakAlert,
  sendDisneyAuthAlert,
  sendEpisodeAlert,
  sendGitHubModelsAlert,
  sendMalRateLimitAlert,
  sendMalScoreAlert,
  sendMalStatusAlert,
  sendNetflixCookieAlert,
  sendPlanToWatchAlert,
  sendRedditFeedErrorAlert,
  sendRedditPostAlert,
  sendRelatedAnimeAlert,
  sendWaitingAlert,
  type DiscordConfig,
} from './discord.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'

/**
 * Byte-for-byte snapshots of every Discord request the checker sends.
 * Regenerate with `UPDATE_SNAPSHOTS=1 node --test src/discord-payloads.test.ts`
 * only when a payload change is intended.
 */

const SNAPSHOT_URL = new URL(
  './__snapshots__/discord-payloads.json',
  import.meta.url
)
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1'
const NOW = new Date('2026-10-22T12:34:56.000Z')

const BOT: DiscordConfig = { botToken: 'bot-token', channelId: 'channel-1' }
const WEBHOOK: DiscordConfig = { webhookUrl: 'https://discord.test/webhook' }
const CONFIGS = { bot: BOT, webhook: WEBHOOK }

interface RecordedRequest {
  method: string
  url: string
  contentType: string | null
  authorization: string | null
  body: string | null
}

let expected: Record<string, RecordedRequest[]> = {}
const actual: Record<string, RecordedRequest[]> = {}
let requests: RecordedRequest[] = []
const realFetch = globalThis.fetch
const RealDate = Date

before(async () => {
  if (!UPDATE) {
    expected = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8'))
  }
  for (const key of [
    'MAL_CLIENT_ID',
    'MAL_CLIENT_SECRET',
    'MAL_REFRESH_TOKEN',
  ]) {
    delete process.env[key]
  }
})

after(async () => {
  globalThis.fetch = realFetch
  globalThis.Date = RealDate
  if (UPDATE) {
    const sorted = Object.fromEntries(
      Object.entries(actual).sort(([a], [b]) => a.localeCompare(b))
    )
    await writeFile(SNAPSHOT_URL, `${JSON.stringify(sorted, null, 2)}\n`)
  }
})

beforeEach(() => {
  requests = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    requests.push({
      method,
      url,
      contentType: headers.get('content-type'),
      authorization: headers.get('authorization'),
      body: init?.body === undefined ? null : String(init.body),
    })

    if (url.startsWith('https://discord.com/api/v10/channels/')) {
      if (method === 'POST') return Response.json({ id: 'created-1' })
      if (method === 'GET') {
        return Response.json([
          {
            id: 'system-1',
            type: 6,
            message_reference: { message_id: 'created-1' },
          },
        ])
      }
      if (method === 'PATCH') return Response.json({ id: 'existing-1' })
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://discord.test/')) {
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected fetch ${method} ${url}`)
  }) as typeof fetch

  // Freeze `new Date()` / `Date.now()` without touching timers.
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(NOW.getTime())
      } else {
        super(...(args as [string]))
      }
    }

    static now() {
      return NOW.getTime()
    }
  } as DateConstructor
})

function check(name: string) {
  actual[name] = requests
  if (UPDATE) return
  assert.ok(expected[name], `missing snapshot "${name}"`)
  assert.deepEqual(requests, expected[name])
  // Byte-for-byte body check on top of the structural comparison.
  assert.deepEqual(
    requests.map((request) => request.body),
    expected[name].map((request) => request.body)
  )
}

const show: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  seriesId: 'GG5H5XQX4',
  crunchyrollUrl: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren',
  malId: 52991,
  schedule: {
    mode: 'ongoing',
    startAt: '2026-10-03T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 1,
  },
}

const bareShow: Show = {
  id: 'bare-show',
  title: '',
  provider: 'netflix',
  schedule: show.schedule,
}

const snapshot: EpisodeSnapshot = {
  provider: 'crunchyroll',
  seriesId: 'GG5H5XQX4',
  seriesTitle: 'Frieren: Beyond Journey’s End',
  seasonId: 'season-2',
  seasonTitle: 'Season 2',
  episode: { id: 'ep-3', episode: '3', title: 'The Mage’s Journey' },
  watchUrl: 'https://www.crunchyroll.com/watch/ep-3',
}

const bareSnapshot: EpisodeSnapshot = {
  ...snapshot,
  episode: { id: 'ep-4', episode: 4 },
  watchUrl: '',
}

for (const [path, discord] of Object.entries(CONFIGS)) {
  test(`episode alert, full (${path})`, async () => {
    await sendEpisodeAlert({
      discord,
      show,
      latestSnapshot: snapshot,
      episodeNumber: 3,
      timingStatus: 'late',
      expectedDropAt: '2026-10-17T15:00:00.000Z',
      actualDropAt: '2026-10-17T15:42:00.000Z',
      discussionUrl: 'https://www.reddit.com/r/anime/comments/abc/frieren/',
      malDetails: {
        watched: 2,
        total: 12,
        meanScore: 9.312,
        coverUrl: 'https://cdn.myanimelist.net/images/anime/1/frieren.jpg',
      },
    })
    check(`episode alert, full (${path})`)
  })

  test(`episode alert, bare (${path})`, async () => {
    await sendEpisodeAlert({
      discord,
      show: bareShow,
      latestSnapshot: bareSnapshot,
      episodeNumber: 4,
      timingStatus: 'on-time',
      expectedDropAt: '2026-10-24T15:00:00.000Z',
    })
    check(`episode alert, bare (${path})`)
  })

  test(`waiting alert (${path})`, async () => {
    await sendWaitingAlert({
      discord,
      show,
      episodeNumber: 4,
      expectedDropAt: '2026-10-24T15:00:00.000Z',
    })
    check(`waiting alert (${path})`)
  })

  test(`waiting alert, provider lag (${path})`, async () => {
    await sendWaitingAlert({
      discord,
      show,
      episodeNumber: 4,
      expectedDropAt: '2026-10-24T15:00:00.000Z',
      airedAt: '2026-10-24T14:30:00.000Z',
    })
    check(`waiting alert, provider lag (${path})`)
  })

  test(`waiting alert, announced break (${path})`, async () => {
    await sendWaitingAlert({
      discord,
      show,
      episodeNumber: 4,
      expectedDropAt: '2026-10-24T15:00:00.000Z',
      airedAt: '2026-10-24T14:30:00.000Z',
      announcedBreak: {
        episode: 4,
        newDate: '2026-10-31',
        sourceUrl: 'https://frieren-anime.jp/news/9',
        status: 'pending',
        announcedAt: '2026-10-22T15:00:00.000Z',
      },
    })
    check(`waiting alert, announced break (${path})`)
  })

  test(`announced break alert (${path})`, async () => {
    await sendAnnouncedBreakAlert({
      discord,
      show,
      episodeNumber: 4,
      newDate: '2026-10-31',
      sourceUrl: 'https://frieren-anime.jp/news/9',
    })
    check(`announced break alert (${path})`)
  })

  test(`announced break alert, TBA (${path})`, async () => {
    await sendAnnouncedBreakAlert({
      discord,
      show: bareShow,
      episodeNumber: 4,
      newDate: null,
      sourceUrl: null,
    })
    check(`announced break alert, TBA (${path})`)
  })

  test(`GitHub Models alert (${path})`, async () => {
    await sendGitHubModelsAlert(discord, 'HTTP 403')
    check(`GitHub Models alert (${path})`)
  })

  test(`waiting alert, bare (${path})`, async () => {
    await sendWaitingAlert({
      discord,
      show: bareShow,
      episodeNumber: 4,
      expectedDropAt: '2026-10-24T15:00:00.000Z',
    })
    check(`waiting alert, bare (${path})`)
  })

  test(`MAL score pickup (${path})`, async () => {
    await sendMalScoreAlert({
      discord,
      show,
      previousScore: 9.1,
      newScore: 9.25,
      direction: 'pickup',
      coverUrl: 'https://cdn.myanimelist.net/images/anime/1/frieren.jpg',
      note: '  Big week  ',
    })
    check(`MAL score pickup (${path})`)
  })

  test(`MAL score drop (${path})`, async () => {
    await sendMalScoreAlert({
      discord,
      show: { ...bareShow, malId: 1 },
      previousScore: 8.5,
      newScore: 8.4,
      direction: 'drop',
    })
    check(`MAL score drop (${path})`)
  })

  test(`MAL status down (${path})`, async () => {
    await sendMalStatusAlert({
      discord,
      status: 'down',
      downSince: '2026-10-22T10:00:00.000Z',
    })
    check(`MAL status down (${path})`)
  })

  test(`MAL status up (${path})`, async () => {
    await sendMalStatusAlert({
      discord,
      status: 'up',
      downSince: '2026-10-22T10:00:00.000Z',
      now: NOW,
    })
    check(`MAL status up (${path})`)
  })

  test(`MAL rate limit, partway (${path})`, async () => {
    await sendMalRateLimitAlert({
      discord,
      httpStatus: 429,
      checked: 4,
      total: 9,
    })
    check(`MAL rate limit, partway (${path})`)
  })

  test(`MAL rate limit, before list (${path})`, async () => {
    await sendMalRateLimitAlert({
      discord,
      httpStatus: 403,
      checked: 0,
      total: 0,
    })
    check(`MAL rate limit, before list (${path})`)
  })

  test(`plan-to-watch airing (${path})`, async () => {
    await sendPlanToWatchAlert({
      discord,
      reason: 'airing',
      entry: {
        malId: 100,
        title: 'Airing Show',
        status: 'currently_airing',
        startDate: '2026-10-01',
        broadcast: { dayOfWeek: 'saturday', startTime: '23:30' },
        coverUrl: 'https://cdn.myanimelist.net/images/anime/100.jpg',
        numEpisodes: 12,
      },
    })
    check(`plan-to-watch airing (${path})`)
  })

  test(`plan-to-watch upcoming (${path})`, async () => {
    await sendPlanToWatchAlert({
      discord,
      reason: 'upcoming',
      entry: {
        malId: 101,
        title: 'Upcoming Show',
        status: 'not_yet_aired',
        startDate: null,
        broadcast: { dayOfWeek: null, startTime: '01:00' },
        coverUrl: null,
        numEpisodes: null,
      },
    })
    check(`plan-to-watch upcoming (${path})`)
  })

  test(`related anime with summary (${path})`, async () => {
    await sendRelatedAnimeAlert({
      discord,
      source: { malId: 52991, title: 'Frieren' },
      related: {
        malId: 200,
        title: 'Frieren Season 3',
        relationType: 'sequel',
        relationTypeFormatted: 'Sequel',
        coverUrl: 'https://cdn.myanimelist.net/images/anime/200-related.jpg',
      },
      summary: {
        mediaType: 'tv',
        status: 'not_yet_aired',
        startDate: '2027-01-10',
        numEpisodes: 24,
        coverUrl: 'https://cdn.myanimelist.net/images/anime/200-summary.jpg',
      },
    })
    check(`related anime with summary (${path})`)
  })

  test(`related anime without summary (${path})`, async () => {
    await sendRelatedAnimeAlert({
      discord,
      source: { malId: 52991, title: 'Frieren' },
      related: {
        malId: 201,
        title: 'Frieren Special',
        relationType: 'side_story',
        relationTypeFormatted: 'Side Story',
        coverUrl: null,
      },
      summary: null,
    })
    check(`related anime without summary (${path})`)
  })

  test(`Reddit post (${path})`, async () => {
    await sendRedditPostAlert({
      discord,
      username: 'someone',
      post: {
        title: 'Weekly thread',
        href: 'https://www.reddit.com/r/anime/comments/xyz/weekly/',
        subreddit: 'anime',
      },
    })
    check(`Reddit post (${path})`)
  })

  test(`Reddit post without subreddit (${path})`, async () => {
    await sendRedditPostAlert({
      discord,
      username: 'someone',
      post: {
        title: 'Profile post',
        href: 'https://www.reddit.com/user/someone/comments/xyz/',
        subreddit: null,
      },
    })
    check(`Reddit post without subreddit (${path})`)
  })

  test(`Reddit feed error (${path})`, async () => {
    await sendRedditFeedErrorAlert({
      discord,
      username: 'someone',
      status: 403,
    })
    check(`Reddit feed error (${path})`)
  })
}

test('Netflix cookie alert (bot)', async () => {
  await sendNetflixCookieAlert(BOT)
  check('Netflix cookie alert (bot)')
})

test('Disney auth alert (bot)', async () => {
  await sendDisneyAuthAlert(BOT)
  check('Disney auth alert (bot)')
})

test('bot-only alerts refuse a webhook-only config', async () => {
  await assert.rejects(sendNetflixCookieAlert(WEBHOOK), {
    message:
      'Netflix cookie alert requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.',
  })
  await assert.rejects(sendDisneyAuthAlert(WEBHOOK), {
    message:
      'Disney+ auth alert requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.',
  })
  assert.equal(requests.length, 0)
})

test('alerts refuse an empty Discord config', async () => {
  await assert.rejects(
    sendRedditFeedErrorAlert({ discord: {}, username: 'someone', status: 500 }),
    {
      message:
        'Discord not configured. Set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (preferred) or DISCORD_WEBHOOK_URL.',
    }
  )
  assert.equal(requests.length, 0)
})

const dashboardRow: ShowDashboardRow = {
  show,
  nextDropEpisode: 4,
  expectedDropAt: '2026-10-24T15:00:00.000Z',
  status: 'in_window',
  malProgress: '3 / 12',
  malScore: '9.31',
  coverUrl: 'https://cdn.myanimelist.net/images/anime/1/frieren.jpg',
  discussionUrl: 'https://www.reddit.com/r/anime/comments/abc/frieren/',
  providerLatestEpisode: 3,
}

test('dashboard payloads', () => {
  requests = [
    {
      method: 'BUILD',
      url: 'full',
      contentType: null,
      authorization: null,
      body: JSON.stringify(buildShowDashboardPayload(dashboardRow)),
    },
    {
      method: 'BUILD',
      url: 'bare',
      contentType: null,
      authorization: null,
      body: JSON.stringify(
        buildShowDashboardPayload({
          ...dashboardRow,
          show: bareShow,
          nextDropEpisode: null,
          expectedDropAt: null,
          status: 'out',
          malProgress: 'MAL not configured',
          malScore: '—',
          coverUrl: null,
          discussionUrl: null,
        })
      ),
    },
  ]
  check('dashboard payloads')
})

const dashboardShowState: ShowState = {
  lastEpisodeId: 'ep-3',
  lastEpisodeNumber: '3',
  lastEpisodeTitle: 'Episode 3',
  lastNotifiedAt: '2026-10-17T15:42:00.000Z',
  seasonId: 'season-2',
  seasonTitle: 'Season 2',
  lastSnapshotEpisode: 3,
  discussionUrl: 'https://www.reddit.com/r/anime/comments/abc/frieren/',
  discussionUrlEpisode: 3,
}
const dashboardShow: Show = { ...show, malId: undefined }

test('dashboard cards mark only pending announced breaks', async () => {
  const announcedBreak = {
    episode: 4,
    newDate: '2026-10-31',
    sourceUrl: 'https://frieren-anime.jp/news/9',
    status: 'pending' as const,
    announcedAt: '2026-10-22T15:00:00.000Z',
  }
  const now = new Date('2026-10-22T15:00:00.000Z')
  const row = (extra: Partial<ShowState>) =>
    buildShowDashboardRow(
      dashboardShow,
      { ...dashboardShowState, ...extra },
      now
    )

  const pending = await row({ announcedBreak })
  assert.deepEqual(pending.announcedBreak, announcedBreak)
  assert.equal(
    (await row({ announcedBreak: { ...announcedBreak, status: 'dismissed' } }))
      .announcedBreak,
    null
  )
  // The next drop doesn't move: same expected time with or without it.
  assert.equal(pending.expectedDropAt, (await row({})).expectedDropAt)

  requests = [
    {
      method: 'BUILD',
      url: 'announced break',
      contentType: null,
      authorization: null,
      body: JSON.stringify(buildShowDashboardPayload(pending)),
    },
  ]
  check('dashboard payload, announced break')
})

test('dashboard sync creates and pins a card (bot)', async () => {
  const state: StateFile = {
    shows: { frieren: { ...dashboardShowState } },
  }
  await syncWatchingDashboard({
    config: { botToken: 'bot-token', watchingChannelId: 'watching-1' },
    shows: [dashboardShow],
    state,
    now: NOW,
  })
  check('dashboard sync create (bot)')
})

test('dashboard sync edits an existing card (bot)', async () => {
  const state: StateFile = {
    shows: { frieren: { ...dashboardShowState } },
    meta: { watchingDashboardMessageIds: { frieren: 'existing-1' } },
  }
  await syncWatchingDashboard({
    config: { botToken: 'bot-token', watchingChannelId: 'watching-1' },
    shows: [dashboardShow],
    state,
    now: NOW,
  })
  check('dashboard sync edit (bot)')
})
