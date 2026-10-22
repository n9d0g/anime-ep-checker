import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyShowForm } from './show-form'
import type { ShowFormValues, ShowStateSummary } from './types'
import {
  buildShowViewModel,
  episodeBadge,
  getEpisodeBounds,
  getNextEpisodeToWatch,
  getProgressEpisode,
  newShowRow,
  orderRowsBySavedNextDrop,
  serializeShows,
  showRowValues,
  stepEpisode,
  toShowRows,
  type ShowRow,
} from './watching'

function form(
  overrides: Partial<Omit<ShowFormValues, 'schedule'>> & {
    schedule?: Partial<ShowFormValues['schedule']>
  } = {}
): ShowFormValues {
  const base = emptyShowForm()
  return {
    ...base,
    ...overrides,
    schedule: { ...base.schedule, ...overrides.schedule },
  }
}

function state(overrides: Partial<ShowStateSummary> = {}): ShowStateSummary {
  return {
    lastEpisodeNumber: '',
    lastEpisodeTitle: '',
    lastNotifiedAt: '',
    ...overrides,
  }
}

function row(key: string, values: ShowFormValues): ShowRow {
  return { key, values }
}

// 2026-10-01T00:00 JST is 2026-09-30T15:00Z.
const START = '2026-10-01T00:00'

test('episodeBadge shows watched progress against the last scheduled episode', () => {
  const show = form({ id: 'a', malId: '1', schedule: { episodeCount: '12' } })

  assert.deepEqual(
    episodeBadge(
      show,
      state({ lastEpisodeNumber: '5', watchedEpisode: 3 }),
      false
    ),
    { label: 'Ep 3/12', behind: true }
  )
  assert.deepEqual(
    episodeBadge(
      show,
      state({ lastEpisodeNumber: '5', watchedEpisode: 5 }),
      false
    ),
    { label: 'Ep 5/12', behind: false }
  )
})

test('episodeBadge falls back to the latest aired episode, then the start episode', () => {
  const finite = form({ schedule: { startEpisode: '13', episodeCount: '12' } })
  assert.deepEqual(
    episodeBadge(finite, state({ lastEpisodeNumber: '15' }), false),
    { label: 'Ep 15/24', behind: false }
  )
  assert.deepEqual(episodeBadge(finite, undefined, false), {
    label: 'Ep 13/24',
    behind: false,
  })

  const ongoing = form({ schedule: { mode: 'ongoing', startEpisode: '1000' } })
  assert.deepEqual(
    episodeBadge(ongoing, state({ lastEpisodeNumber: '1001' }), false),
    { label: 'Ep 1001', behind: false }
  )
  assert.deepEqual(episodeBadge(ongoing, undefined, false), {
    label: 'Ep 1000',
    behind: false,
  })
})

test('episodeBadge reports MAL down only for MAL-linked shows without watched counts', () => {
  const linked = form({ id: 'a', malId: '1' })
  assert.deepEqual(
    episodeBadge(linked, state({ lastEpisodeNumber: '4' }), true),
    { label: 'MAL down', behind: false, malDown: true }
  )
  assert.deepEqual(
    episodeBadge(
      linked,
      state({ lastEpisodeNumber: '4', watchedEpisode: 2 }),
      true
    ),
    { label: 'Ep 2/12', behind: true }
  )
  assert.deepEqual(
    episodeBadge(form({ id: 'b' }), state({ lastEpisodeNumber: '4' }), true),
    { label: 'Ep 4/12', behind: false }
  )
})

test('getProgressEpisode uses MAL watched counts for linked shows and aired episodes otherwise', () => {
  const live = state({ lastEpisodeNumber: '6', watchedEpisode: 4 })
  assert.equal(getProgressEpisode(form({ malId: '1' }), live), 4)
  assert.equal(getProgressEpisode(form({ malId: '1' }), state()), null)
  assert.equal(getProgressEpisode(form(), live), 6)
  assert.equal(getProgressEpisode(form(), undefined), null)
})

test('getNextEpisodeToWatch is the episode after progress, capped at the latest aired', () => {
  const linked = form({ malId: '1' })
  assert.equal(
    getNextEpisodeToWatch(
      linked,
      state({ lastEpisodeNumber: '6', watchedEpisode: 4 })
    ),
    5
  )
  assert.equal(
    getNextEpisodeToWatch(
      linked,
      state({ lastEpisodeNumber: '6', watchedEpisode: 6 })
    ),
    6
  )
  assert.equal(
    getNextEpisodeToWatch(
      linked,
      state({ lastEpisodeNumber: '6', watchedEpisode: 8 })
    ),
    6
  )
  assert.equal(getNextEpisodeToWatch(linked, state({ watchedEpisode: 3 })), 3)
  assert.equal(
    getNextEpisodeToWatch(linked, state({ lastEpisodeNumber: '6' })),
    6
  )
  assert.equal(
    getNextEpisodeToWatch(form(), state({ lastEpisodeNumber: '6' })),
    6
  )
  assert.equal(getNextEpisodeToWatch(form(), undefined), null)
})

test('getEpisodeBounds allows one before the start episode up to the season end', () => {
  assert.deepEqual(
    getEpisodeBounds(
      form({ schedule: { startEpisode: '13', episodeCount: '12' } })
    ),
    { min: 12, max: 24 }
  )
  assert.deepEqual(
    getEpisodeBounds(
      form({ schedule: { mode: 'ongoing', startEpisode: '1' } })
    ),
    { min: 1, max: null }
  )
})

test('stepEpisode moves within the schedule and refuses steps outside it', () => {
  const show = form({
    id: 'a',
    schedule: { startEpisode: '1', episodeCount: '3' },
  })
  assert.deepEqual(stepEpisode(show, 1, 1), { base: 1, next: 2, max: 3 })
  assert.deepEqual(stepEpisode(show, null, 1), { base: 0, next: 1, max: 3 })
  assert.deepEqual(stepEpisode(show, 2, -1), { base: 2, next: 1, max: 3 })
  assert.equal(stepEpisode(show, 1, -1), null)
  assert.equal(stepEpisode(show, 3, 1), null)
  assert.equal(stepEpisode(form(), 1, 1), null)

  const secondCour = form({
    id: 'b',
    schedule: { startEpisode: '13', episodeCount: '12' },
  })
  // Stepping down to the episode before the season start is allowed.
  assert.deepEqual(stepEpisode(secondCour, 13, -1), {
    base: 13,
    next: 12,
    max: 24,
  })
})

test('buildShowViewModel derives the schedule lines, links and badge once', () => {
  const show = form({
    id: 'frieren',
    title: 'Frieren',
    malId: '52991',
    crunchyrollUrl: 'https://www.crunchyroll.com/series/abc',
    schedule: { startAt: START, episodeCount: '12' },
  })
  const vm = buildShowViewModel(
    show,
    state({ lastEpisodeNumber: '2', watchedEpisode: 1 }),
    false
  )

  assert.equal(vm.nextEpisodeLine, 'Next: Episode 3 - Wed Oct 14th, 11:00 EDT')
  assert.equal(
    vm.startHint,
    'Eastern: Sep 30, 2026, 11:00 AM EDT · Next ep 3: Oct 14, 2026, 11:00 AM EDT'
  )
  assert.equal(vm.nextDropTime, Date.parse('2026-10-14T15:00:00Z'))
  assert.deepEqual(vm.badge, { label: 'Ep 1/12', behind: true })
  assert.equal(vm.currentEpisode, 1)
  assert.equal(vm.nextEpisodeToWatch, 2)
  assert.deepEqual(vm.bounds, { min: 1, max: 12 })
  assert.equal(vm.watchUrl, 'https://www.crunchyroll.com/series/abc')
  assert.match(vm.discussionUrl ?? '', /frieren_-_episode_1_discussion/)
  assert.equal(vm.malUrl, 'https://myanimelist.net/anime/52991')
  assert.equal(vm.malLinked, true)
  assert.equal(vm.malBlocked, false)
  assert.equal(vm.providerDotClass, 'provider-cr')
})

test('buildShowViewModel handles shows without a start time or further episodes', () => {
  const noStart = buildShowViewModel(
    form({ provider: 'netflix' }),
    undefined,
    true
  )
  assert.equal(noStart.nextEpisodeLine, null)
  assert.equal(noStart.startHint, null)
  assert.equal(noStart.nextDropTime, null)
  assert.equal(noStart.discussionUrl, null)
  assert.equal(noStart.malUrl, null)
  assert.equal(noStart.malBlocked, false)
  assert.equal(noStart.providerDotClass, 'provider-nf')

  const finished = buildShowViewModel(
    form({
      provider: 'disney',
      malId: '1',
      schedule: { startAt: START, episodeCount: '2' },
    }),
    state({ lastEpisodeNumber: '2' }),
    true
  )
  assert.equal(finished.nextEpisodeLine, 'No further episodes on schedule')
  assert.equal(
    finished.startHint,
    'Eastern: Sep 30, 2026, 11:00 AM EDT · No further episodes on schedule'
  )
  assert.equal(finished.nextDropTime, null)
  assert.equal(finished.malBlocked, true)
  assert.equal(finished.providerDotClass, 'provider-disney')
})

test('orderRowsBySavedNextDrop sorts by next drop, undated shows last in list order', () => {
  const early = form({ id: 'early', schedule: { startAt: '2026-10-01T00:00' } })
  const late = form({ id: 'late', schedule: { startAt: '2026-10-05T00:00' } })
  const undated = form({ id: 'undated' })
  const done = form({
    id: 'done',
    schedule: { startAt: '2026-09-01T00:00', episodeCount: '1' },
  })
  const rows = [
    row('u', undated),
    row('l', late),
    row('d', done),
    row('e', early),
  ]

  const ordered = orderRowsBySavedNextDrop(rows, rows, {
    done: state({ lastEpisodeNumber: '1' }),
  })

  assert.deepEqual(
    ordered.map((entry) => entry.row.key),
    ['e', 'l', 'u', 'd']
  )
  assert.deepEqual(
    ordered.map((entry) => entry.index),
    [3, 1, 0, 2]
  )
})

test('orderRowsBySavedNextDrop uses the next episode from live state', () => {
  // Episode 1 of "a" aired, so its next drop (ep 2) is after "b"'s premiere.
  const a = form({ id: 'a', schedule: { startAt: '2026-10-01T00:00' } })
  const b = form({ id: 'b', schedule: { startAt: '2026-10-03T00:00' } })
  const rows = [row('a', a), row('b', b)]

  assert.deepEqual(
    orderRowsBySavedNextDrop(rows, rows, {}).map((entry) => entry.row.key),
    ['a', 'b']
  )
  assert.deepEqual(
    orderRowsBySavedNextDrop(rows, rows, {
      a: state({ lastEpisodeNumber: '1' }),
    }).map((entry) => entry.row.key),
    ['b', 'a']
  )
})

test('orderRowsBySavedNextDrop ignores unsaved edits and puts new rows last', () => {
  const saved = [
    row('a', form({ id: 'a', schedule: { startAt: '2026-10-01T00:00' } })),
    row('b', form({ id: 'b', schedule: { startAt: '2026-10-03T00:00' } })),
  ]
  // "a" is being edited to a later start time and a new dated row is added.
  const live = [
    row('a', form({ id: 'a', schedule: { startAt: '2026-12-01T00:00' } })),
    saved[1],
    row('new', form({ schedule: { startAt: '2026-09-01T00:00' } })),
  ]

  assert.deepEqual(
    orderRowsBySavedNextDrop(live, saved, {}).map((entry) => entry.row),
    live
  )
})

test('show rows keep a client key that never reaches the serialized shows', () => {
  const loaded = toShowRows([form({ id: 'a' }), form({ id: 'b' })])
  assert.deepEqual(
    loaded.map((entry) => entry.key),
    ['show:a', 'show:b']
  )

  const first = newShowRow()
  const second = newShowRow()
  assert.notEqual(first.key, second.key)
  assert.equal(first.values.id, '')

  const values = showRowValues([...loaded, first])
  assert.deepEqual(values, [
    form({ id: 'a' }),
    form({ id: 'b' }),
    emptyShowForm(),
  ])
  assert.equal(serializeShows(values), JSON.stringify(values))
  assert.doesNotMatch(serializeShows(values), /show:a|new:/)
})
