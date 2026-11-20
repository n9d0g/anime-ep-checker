import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatEpisodeLabel, parseSeasonAndPart } from './episode-code.ts'

function label(title: string, episode: number, overrides = {}) {
  return formatEpisodeLabel({ id: 'show', title, ...overrides }, episode)
}

test('numbered season phrases become the season and leave the title', () => {
  assert.equal(
    label('Kusuriya no Hitorigoto 3rd Season', 8),
    'Kusuriya no Hitorigoto s3e8'
  )
  assert.equal(label('Ao no Hako Season 2', 4), 'Ao no Hako s2e4')
  assert.equal(
    label('Sousou no Frieren 2nd Season', 1),
    'Sousou no Frieren s2e1'
  )
  assert.equal(label('Dr. Stone S4', 2), 'Dr. Stone s4e2')
  assert.equal(label('Oshi no Ko (Season 3)', 5), 'Oshi no Ko s3e5')
})

test('a title with no season is season 1', () => {
  assert.equal(label('Sakamoto Days', 8), 'Sakamoto Days s1e8')
})

test('a named part goes before the episode', () => {
  assert.equal(label('Spy x Family Season 2 Part 1', 3), 'Spy x Family s2p1e3')
  assert.equal(label('Spy x Family Part 2', 3), 'Spy x Family s1p2e3')
  assert.equal(label('Dandadan 2nd Season 2nd Cour', 4), 'Dandadan s2p2e4')
  assert.equal(label('Vinland Saga Cour 2', 1), 'Vinland Saga s1p2e1')
  assert.equal(label('Mob Psycho Part II', 6), 'Mob Psycho s1p2e6')
})

test('Final Season and bare roman numerals stay in the title', () => {
  assert.equal(
    label('Shingeki no Kyojin: The Final Season Part 2', 3),
    'Shingeki no Kyojin: The Final Season s1p2e3'
  )
  assert.equal(label('Overlord IV', 2), 'Overlord IV s1e2')
  assert.equal(
    label('Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2', 7),
    'Mushoku Tensei II: Isekai Ittara Honki Dasu s1p2e7'
  )
})

test('overrides replace what the title says, and its phrases still go', () => {
  assert.equal(
    label('Shingeki no Kyojin: The Final Season Part 2', 3, { season: 4 }),
    'Shingeki no Kyojin: The Final Season s4p2e3'
  )
  assert.equal(
    label('Kusuriya no Hitorigoto 3rd Season', 8, { season: 5, part: 1 }),
    'Kusuriya no Hitorigoto s5p1e8'
  )
})

test('an empty title falls back to the show id', () => {
  assert.equal(
    formatEpisodeLabel({ id: 'frieren', title: '' }, 3),
    'frieren s1e3'
  )
})

test('words that only contain season-like letters are left alone', () => {
  assert.deepEqual(parseSeasonAndPart('Seasons of Blossom'), {
    title: 'Seasons of Blossom',
    season: null,
    part: null,
  })
  assert.deepEqual(parseSeasonAndPart('Departure Cours'), {
    title: 'Departure Cours',
    season: null,
    part: null,
  })
})
