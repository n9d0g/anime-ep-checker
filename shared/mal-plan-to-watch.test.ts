import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  PLAN_TO_WATCH_LIST_FIELDS,
  parsePlanToWatchPage,
} from './mal-plan-to-watch.ts'

// Shaped like a MAL v2 /users/@me/animelist response (see MAL API docs).
const page = JSON.parse(
  readFileSync(
    new URL('./fixtures/mal-plan-to-watch-page.json', import.meta.url),
    'utf8'
  )
)

test('parses each plan-to-watch entry from a MAL list page', () => {
  assert.deepEqual(parsePlanToWatchPage(page), [
    {
      malId: 59978,
      title: 'Sousou no Frieren 2nd Season',
      titleEnglish: "Frieren: Beyond Journey's End Season 2",
      status: 'not_yet_aired',
      startDate: '2027-01-16',
      broadcast: { dayOfWeek: 'saturday', startTime: '23:00' },
      coverUrl: 'https://cdn.myanimelist.net/images/anime/1921/154528l.jpg',
      numEpisodes: null,
    },
    {
      malId: 21,
      title: 'One Piece',
      titleEnglish: undefined,
      status: 'currently_airing',
      startDate: '1999-10-20',
      broadcast: null,
      coverUrl: 'https://cdn.myanimelist.net/images/anime/1244/138851.jpg',
      numEpisodes: null,
    },
    {
      malId: 5114,
      title: 'Fullmetal Alchemist: Brotherhood',
      titleEnglish: 'Fullmetal Alchemist: Brotherhood',
      status: 'finished_airing',
      startDate: '2009-04-05',
      broadcast: { dayOfWeek: 'sunday', startTime: null },
      coverUrl: null,
      numEpisodes: 64,
    },
  ])
})

test('requests every field the snapshot entry is built from', () => {
  for (const field of [
    'alternative_titles',
    'status',
    'start_date',
    'broadcast',
    'main_picture',
    'num_episodes',
  ]) {
    assert.ok(PLAN_TO_WATCH_LIST_FIELDS.includes(field), field)
  }
})
