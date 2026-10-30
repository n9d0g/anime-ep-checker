import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnNewsItem } from './ann-feed.ts'
import { applyBreakReading, syncAnnouncedBreaks } from './announced-breaks.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'

/** Episode 3 drops 2026-09-15T15:00Z (Sep 16, 00:00 JST); a day before, its check is due. */
const SHOW: Show = {
  id: 'frieren',
  title: 'Sousou no Frieren',
  titleEnglish: "Frieren: Beyond Journey's End",
  provider: 'crunchyroll',
  schedule: {
    mode: 'ongoing',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 1,
  },
}
const NOW = new Date('2026-09-14T15:00:00.000Z')
const SITE = 'https://frieren-anime.jp/'
const ANN: AnnNewsItem = {
  title: "Frieren: Beyond Journey's End Anime Delays Episode 3 by 1 Week",
  url: 'https://www.animenewsnetwork.com/news/2026-09-13/frieren/.1',
  publishedAt: '2026-09-13T12:00:00.000Z',
}
const DISCORD = { webhookUrl: 'https://discord.test/webhook' }

const DATED =
  '2026.09.13\n第3話 放送延期のお知らせ。第3話は9月22日より放送いたします。'
const TBA = '2026.09.13\n第3話 放送延期のお知らせ'
const QUIET = '2026.09.10\n第3話 あらすじ公開'

function makeState(extra: Partial<ShowState> = {}): StateFile {
  return {
    shows: {
      frieren: {
        lastEpisodeId: 'ep-2',
        lastEpisodeNumber: '2',
        lastEpisodeTitle: '',
        lastNotifiedAt: '2026-09-08T15:05:00.000Z',
        seasonId: '',
        seasonTitle: '',
        officialSiteUrl: SITE,
        ...extra,
      },
    },
  }
}

/** Runs a sync with stubbed sources and Discord; records the alerts. */
async function run(
  state: StateFile,
  {
    page = QUIET,
    news = [],
    now = NOW,
  }: {
    page?: string | null
    news?: AnnNewsItem[] | null
    now?: Date
  } = {}
) {
  const posts: string[] = []
  const pages: string[] = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    posts.push(JSON.parse(String(init?.body)).content ?? '')
    return new Response(null, { status: 204 })
  }) as typeof fetch
  const result = await syncAnnouncedBreaks({
    shows: [SHOW],
    state,
    discord: DISCORD,
    now,
    dryRun: false,
    fetchNews: async () => news,
    fetchPage: async (url) => {
      pages.push(url)
      return page
    },
  })
  return { ...result, posts, pages }
}

test('an announced break is saved and alerted once per episode and date', async () => {
  const state = makeState()
  const first = await run(state, { page: DATED })
  assert.deepEqual(first.pages, [SITE])
  assert.deepEqual(first.posts, [
    '⏸️ **Sousou no Frieren** — Episode 3 postponed (announced): new broadcast date Tue, Sep 22 (JST).',
  ])
  assert.deepEqual(state.shows.frieren!.announcedBreak, {
    episode: 3,
    newDate: '2026-09-22',
    sourceUrl: SITE,
    status: 'pending',
    announcedAt: NOW.toISOString(),
  })
  assert.equal(state.shows.frieren!.announcementCheckedAt, NOW.toISOString())
  assert.equal(state.shows.frieren!.announcementReadAt, NOW.toISOString())

  // The next day's check reads the same notice: no second alert.
  const nextDay = new Date('2026-09-15T15:16:00.000Z')
  const again = await run(state, { page: DATED, now: nextDay })
  assert.deepEqual(again.posts, [])
  assert.equal(
    state.shows.frieren!.announcedBreak!.announcedAt,
    NOW.toISOString()
  )
})

test('a new date alerts again; a TBA after a date and a dismissed pair stay silent', async () => {
  const later = new Date('2026-09-15T15:16:00.000Z')
  const tba = makeState()
  assert.equal((await run(tba, { page: TBA })).posts.length, 1)
  assert.equal(tba.shows.frieren!.announcedBreak!.newDate, null)

  const dated = await run(tba, { page: DATED, now: later })
  assert.equal(dated.posts.length, 1)
  assert.equal(tba.shows.frieren!.announcedBreak!.newDate, '2026-09-22')

  const backToTba = await run(tba, {
    page: TBA,
    now: new Date('2026-09-15T15:46:00.000Z'),
  })
  assert.deepEqual(backToTba.posts, [])
  assert.equal(tba.shows.frieren!.announcedBreak!.newDate, '2026-09-22')

  const dismissed = makeState({
    announcedBreak: {
      episode: 3,
      newDate: '2026-09-22',
      sourceUrl: SITE,
      status: 'dismissed',
      announcedAt: '2026-09-13T15:00:00.000Z',
    },
  })
  const silent = await run(dismissed, { page: DATED })
  assert.deepEqual(silent.posts, [])
  assert.equal(dismissed.shows.frieren!.announcedBreak!.status, 'dismissed')
})

test('without an official site, an ANN headline since the last drop is a TBA break', async () => {
  const state = makeState({ officialSiteUrl: null })
  const result = await run(state, { news: [ANN] })
  assert.deepEqual(result.pages, [])
  assert.match(
    result.posts[0]!,
    /Episode 3 postponed \(announced\): new date TBA/
  )
  assert.equal(state.shows.frieren!.announcedBreak!.sourceUrl, ANN.url)
  assert.equal(state.shows.frieren!.announcementReadAt, NOW.toISOString())
})

test('an unreadable page or feed only warns, and the check is not marked read', async () => {
  const state = makeState()
  const unreadable = await run(state, { page: null, news: [ANN] })
  // ANN still found the break.
  assert.equal(unreadable.posts.length, 1)
  assert.equal(state.shows.frieren!.announcementCheckedAt, NOW.toISOString())
  assert.equal(state.shows.frieren!.announcementReadAt, undefined)

  const noFeed = makeState()
  await run(noFeed, { news: null })
  assert.equal(noFeed.shows.frieren!.announcementReadAt, undefined)

  // Not due again an hour later.
  const soon = await run(state, {
    page: DATED,
    now: new Date('2026-09-14T16:00:00.000Z'),
  })
  assert.deepEqual(soon.pages, [])
})

test('nothing announced: no alert, and the check is marked read', async () => {
  const state = makeState()
  const quiet = await run(state)
  assert.deepEqual(quiet.posts, [])
  assert.equal(state.shows.frieren!.announcedBreak, undefined)
  assert.equal(state.shows.frieren!.announcementReadAt, NOW.toISOString())
})

test('an announced break is cleared once its episode drops', async () => {
  const state = makeState({
    lastEpisodeNumber: '3',
    announcementCheckedAt: NOW.toISOString(),
    announcedBreak: {
      episode: 3,
      newDate: '2026-09-22',
      sourceUrl: null,
      status: 'pending',
      announcedAt: '2026-09-13T15:00:00.000Z',
    },
  })
  const result = await run(state)
  assert.equal(state.shows.frieren!.announcedBreak, null)
  assert.deepEqual(result.reasons, ['announced break over Sousou no Frieren'])
})

test('no reading keeps the saved announced break', () => {
  assert.deepEqual(applyBreakReading(null, null, NOW), {
    announcedBreak: null,
    alert: false,
  })
})
