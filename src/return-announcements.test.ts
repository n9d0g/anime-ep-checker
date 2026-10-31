import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnilistAiring } from './anilist.ts'
import type { AnnNewsItem } from './ann-feed.ts'
import {
  applyReturnNews,
  refineWithAniList,
  syncReturnAnnouncements,
  type ReturnNews,
} from './return-announcements.ts'
import type { OnHoldSnapshotEntry, StateFile } from '../shared/types.ts'

const NOW = new Date('2026-10-31T12:00:00.000Z')
const PAGE = 'https://one-piece.com/news/index.html?category=anime'
const DISCORD = { webhookUrl: 'https://discord.test/webhook' }

const news = (
  returnsOn: string | null,
  returnsIn: string | null,
  sourceUrl: string | null = PAGE
): ReturnNews => ({ returnsOn, returnsIn, episode: null, sourceUrl })

test('each new date alerts once, from TBA to a month to an exact date to a moved date', () => {
  let saved = applyReturnNews(null, news(null, null), NOW)
  assert.equal(saved.alert, true)
  assert.equal(
    applyReturnNews(saved.announcement, news(null, null), NOW).alert,
    false
  )

  saved = applyReturnNews(saved.announcement, news(null, 'July 2027'), NOW)
  assert.equal(saved.alert, true)
  assert.equal(
    applyReturnNews(saved.announcement, news(null, 'July 2027'), NOW).alert,
    false
  )

  saved = applyReturnNews(saved.announcement, news('2027-07-05', null), NOW)
  assert.equal(saved.alert, true)
  assert.equal(
    applyReturnNews(saved.announcement, news('2027-07-05', null), NOW).alert,
    false
  )

  saved = applyReturnNews(saved.announcement, news('2027-07-12', null), NOW)
  assert.equal(saved.alert, true)
  assert.equal(saved.announcement!.returnsOn, '2027-07-12')
})

test('vaguer news after a dated announcement is older news: kept silent', () => {
  const dated = applyReturnNews(
    null,
    news('2027-07-05', null),
    NOW
  ).announcement
  for (const vaguer of [news(null, 'July 2027'), news(null, null)]) {
    const result = applyReturnNews(dated, vaguer, NOW)
    assert.equal(result.alert, false)
    assert.equal(result.announcement, dated)
  }
  assert.equal(applyReturnNews(dated, null, NOW).announcement, dated)
})

/** Sunday 2027-07-04 23:15 JST, and a placeholder far from any announced month. */
const JULY_4: AnilistAiring = {
  episode: 1181,
  airingAt: Date.parse('2027-07-04T14:15:00.000Z') / 1000,
}
const PLACEHOLDER: AnilistAiring = {
  episode: 1181,
  airingAt: Date.parse('2027-01-03T14:16:00.000Z') / 1000,
}

test('AniList only refines a month or season the news already gave', () => {
  assert.deepEqual(refineWithAniList(news(null, 'July 2027'), [JULY_4], NOW), {
    returnsOn: '2027-07-04',
    returnsIn: null,
    episode: 1181,
    sourceUrl: PAGE,
  })
  assert.equal(
    refineWithAniList(news(null, 'Summer 2027'), [JULY_4], NOW).returnsOn,
    '2027-07-04'
  )
  // A placeholder outside the announced time, or TBA news: unchanged.
  const july = news(null, 'July 2027')
  assert.equal(refineWithAniList(july, [PLACEHOLDER], NOW), july)
  const tba = news(null, null)
  assert.equal(refineWithAniList(tba, [JULY_4], NOW), tba)
})

const ONE_PIECE: OnHoldSnapshotEntry = {
  show: {
    id: 'one-piece',
    title: 'One Piece',
    titleEnglish: 'One Piece',
    provider: 'crunchyroll',
    malId: 21,
    schedule: {
      mode: 'ongoing',
      startAt: '2026-07-12T16:00:00.000Z',
      startEpisode: 1169,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  },
  heldAt: '2026-09-28T21:46:38.715Z',
  awaitingReturn: {
    officialNewsUrl: PAGE,
    markedAt: '2026-10-31T00:00:00.000Z',
  },
}

function makeState(entries: OnHoldSnapshotEntry[] = [ONE_PIECE]): StateFile {
  return {
    shows: {},
    meta: { onHold: { updatedAt: '2026-10-31T00:00:00.000Z', entries } },
  }
}

const QUIET_PAGE = 'アニメ次回予告を更新！第1180話\n2026/09/20\nテレビアニメ'
const RETURN_PAGE =
  'アニメ『ONE PIECE』2027年7月より放送再開決定！\n2027/03/01\nテレビアニメ\n' +
  QUIET_PAGE

/** Runs a sync with stubbed sources and Discord; records the alerts. */
async function run(
  state: StateFile,
  {
    page = QUIET_PAGE,
    news = [],
    airing = [PLACEHOLDER],
  }: {
    page?: string | null
    news?: AnnNewsItem[] | null
    airing?: AnilistAiring[] | null
  } = {}
) {
  const posts: string[] = []
  const pages: string[] = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    posts.push(JSON.parse(String(init?.body)).content ?? '')
    return new Response(null, { status: 204 })
  }) as typeof fetch
  const result = await syncReturnAnnouncements({
    state,
    discord: DISCORD,
    now: NOW,
    dryRun: false,
    fetchNews: async () => news,
    fetchPage: async (url) => {
      pages.push(url)
      return page
    },
    fetchAiring: async () => airing,
  })
  return { ...result, posts, pages }
}

test('a return notice is saved and alerted once, and quiet news alerts nothing', async () => {
  const state = makeState()
  const quiet = await run(state)
  assert.deepEqual(quiet.pages, [PAGE])
  assert.deepEqual(quiet.posts, [])
  assert.equal(state.meta!.returnCheckedAt, NOW.toISOString())
  assert.deepEqual(state.meta!.returnAnnouncements, {})

  const first = await run(state, { page: RETURN_PAGE })
  assert.deepEqual(first.posts, ['▶️ **One Piece** — Returns July 2027.'])
  assert.deepEqual(state.meta!.returnAnnouncements!['one-piece'], {
    returnsOn: null,
    returnsIn: 'July 2027',
    episode: null,
    sourceUrl: PAGE,
    announcedAt: NOW.toISOString(),
  })

  const again = await run(state, { page: RETURN_PAGE })
  assert.deepEqual(again.posts, [])

  // AniList later schedules a date inside July: one more alert.
  const dated = await run(state, { page: RETURN_PAGE, airing: [JULY_4] })
  assert.deepEqual(dated.posts, [
    '▶️ **One Piece** — Returns Sun, Jul 4 (JST) with episode 1181.',
  ])
})

test('an AniList date alone never alerts', async () => {
  const state = makeState()
  const result = await run(state, { airing: [JULY_4] })
  assert.deepEqual(result.posts, [])
})

test('ANN is read when the official page says nothing, and shows not awaiting return are skipped', async () => {
  const notAwaiting: OnHoldSnapshotEntry = {
    ...ONE_PIECE,
    show: { ...ONE_PIECE.show, id: 'paused', title: 'Paused Show' },
    awaitingReturn: null,
  }
  const state = makeState([
    { ...ONE_PIECE, awaitingReturn: { officialNewsUrl: null, markedAt: '' } },
    notAwaiting,
  ])
  const headline: AnnNewsItem = {
    title: 'One Piece Anime Returns on July 5, 2027',
    url: 'https://www.animenewsnetwork.com/news/2027-03-01/one-piece/.1',
    publishedAt: '2027-03-01T00:00:00.000Z',
  }
  const result = await run(state, { news: [headline] })
  assert.deepEqual(result.pages, [])
  assert.deepEqual(result.posts, [
    '▶️ **One Piece** — Returns Mon, Jul 5 (JST).',
  ])
  assert.deepEqual(Object.keys(state.meta!.returnAnnouncements!), ['one-piece'])
})

test('an announcement is dropped once the show is no longer awaiting return', async () => {
  const state = makeState()
  await run(state, { page: RETURN_PAGE })
  state.meta!.onHold!.entries = []
  await run(state)
  assert.deepEqual(state.meta!.returnAnnouncements, {})
})
