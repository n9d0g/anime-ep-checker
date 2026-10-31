import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnouncedBreak, PlanToWatchSnapshotEntry } from '@shared/types'
import { buildInbox } from './inbox'
import { emptyShowForm } from './show-form'
import type { ShowFormValues, ShowStateSummary } from './types'

function show(overrides: Partial<ShowFormValues> = {}): ShowFormValues {
  return {
    ...emptyShowForm(),
    id: 'frieren',
    title: 'Sousou no Frieren',
    titleEnglish: "Frieren: Beyond Journey's End",
    malId: '52991',
    schedule: {
      mode: 'finite',
      startAt: '2026-10-01T00:00',
      startEpisode: '1',
      episodeCount: '12',
      premiereBatchSize: '1',
    },
    ...overrides,
  }
}

function state(overrides: Partial<ShowStateSummary> = {}): ShowStateSummary {
  return {
    lastEpisodeNumber: '4',
    lastEpisodeTitle: '',
    lastNotifiedAt: '',
    officialSiteUrl: 'https://frieren-anime.jp/',
    ...overrides,
  }
}

function ptwEntry(malId: number, title: string): PlanToWatchSnapshotEntry {
  return {
    malId,
    title,
    status: 'currently_airing',
    startDate: '2026-10-28',
    broadcast: null,
    coverUrl: null,
    numEpisodes: 12,
  }
}

const announced: AnnouncedBreak = {
  episode: 5,
  // Episode 5 was due Oct 29 JST; a week later is a whole-week break.
  newDate: '2026-11-05',
  sourceUrl: 'https://frieren-anime.jp/news/',
  status: 'pending',
  announcedAt: '2026-10-27T00:00:00Z',
}

const none = new Set<string>()

test('a show with nothing to resolve adds nothing', () => {
  assert.deepEqual(
    buildInbox({
      shows: [show()],
      showStates: { frieren: state() },
      airingPlanToWatch: [],
      dismissedKeys: none,
    }),
    []
  )
})

test('a pending announced break suggests its whole-week break', () => {
  const [item] = buildInbox({
    shows: [show()],
    showStates: { frieren: state({ announcedBreak: announced }) },
    airingPlanToWatch: [],
    dismissedKeys: none,
  })
  assert.equal(item.kind, 'announced_break')
  assert.equal(item.kind === 'announced_break' && item.suggestedWeeks, 1)
  assert.equal(item.title, "Frieren: Beyond Journey's End")
})

test('a dismissed announced break or a TBA one is handled', () => {
  const tba = buildInbox({
    shows: [show()],
    showStates: {
      frieren: state({ announcedBreak: { ...announced, newDate: null } }),
    },
    airingPlanToWatch: [],
    dismissedKeys: none,
  })
  assert.equal(tba[0].kind === 'announced_break' && tba[0].suggestedWeeks, null)

  assert.deepEqual(
    buildInbox({
      shows: [show()],
      showStates: {
        frieren: state({
          announcedBreak: { ...announced, status: 'dismissed' },
        }),
      },
      airingPlanToWatch: [],
      dismissedKeys: none,
    }),
    []
  )
})

test('no official source only once AniList was checked and none is set', () => {
  const kinds = (officialSiteUrl: string | null | undefined, url = '') =>
    buildInbox({
      shows: [show({ officialNewsUrl: url })],
      showStates: { frieren: state({ officialSiteUrl }) },
      airingPlanToWatch: [],
      dismissedKeys: none,
    }).map((item) => item.kind)

  assert.deepEqual(kinds(null), ['no_official_source'])
  assert.deepEqual(kinds(undefined), [])
  assert.deepEqual(kinds(null, 'https://frieren-anime.jp/news/'), [])
})

test('a saved show without a MAL ID needs linking; a new one does not', () => {
  const items = buildInbox({
    shows: [show({ malId: '' }), show({ id: '', malId: '' })],
    showStates: { frieren: state() },
    airingPlanToWatch: [],
    dismissedKeys: none,
  })
  assert.deepEqual(
    items.map((item) => item.key),
    ['mal:frieren']
  )
})

test('a Plan to watch show that started airing, unless put off or already watching', () => {
  const airing = [ptwEntry(1, 'Witch Hat Atelier'), ptwEntry(52991, 'Frieren')]
  const keys = (dismissed: string[]) =>
    buildInbox({
      shows: [show()],
      showStates: { frieren: state() },
      airingPlanToWatch: airing,
      dismissedKeys: new Set(dismissed),
    }).map((item) => item.key)

  assert.deepEqual(keys([]), ['airing:1'])
  assert.deepEqual(keys(['airing:1']), [])
})

test('a Plan to watch show that has since finished airing drops out', () => {
  assert.deepEqual(
    buildInbox({
      shows: [],
      showStates: {},
      airingPlanToWatch: [
        { ...ptwEntry(62811, 'Jaadugar'), status: 'finished_airing' },
      ],
      dismissedKeys: none,
    }),
    []
  )
})

test('an announced return shows until put off, and again for a new date', () => {
  const onePiece = {
    entry: {
      show: {
        id: 'one-piece',
        title: 'One Piece',
        provider: 'crunchyroll' as const,
        schedule: {
          mode: 'ongoing' as const,
          startAt: '2026-07-12T16:00:00.000Z',
          startEpisode: 1169,
          episodeCount: null,
          premiereBatchSize: 1,
        },
      },
      heldAt: '2026-09-28T21:46:38.715Z',
      awaitingReturn: { officialNewsUrl: null, markedAt: '' },
    },
    announcement: {
      returnsOn: null,
      returnsIn: 'July 2027',
      episode: null,
      sourceUrl: 'https://www.animenewsnetwork.com/news/1',
      announcedAt: '',
    },
  }
  const inbox = (dismissed: string[], returning = [onePiece]) =>
    buildInbox({
      shows: [],
      showStates: {},
      airingPlanToWatch: [],
      returningShows: returning,
      dismissedKeys: new Set(dismissed),
    })

  assert.deepEqual(inbox([]), [
    {
      kind: 'return_announced',
      key: 'return:one-piece:July 2027',
      showId: 'one-piece',
      title: 'One Piece',
      label: 'Returns July 2027',
      sourceUrl: 'https://www.animenewsnetwork.com/news/1',
    },
  ])
  assert.deepEqual(inbox(['return:one-piece:July 2027']), [])

  const dated = {
    ...onePiece,
    announcement: { ...onePiece.announcement, returnsOn: '2027-07-04' },
  }
  assert.equal(
    inbox(['return:one-piece:July 2027'], [dated])[0]?.key,
    'return:one-piece:2027-07-04'
  )
})
