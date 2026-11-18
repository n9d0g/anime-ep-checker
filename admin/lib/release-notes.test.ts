import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notesFrom, releasesFrom } from './release-notes'

test('notesFrom keeps feat and fix lines, in plain words', () => {
  assert.deepEqual(
    notesFrom(
      [
        '- feat: ⏱️ show days, hours and minutes in drop countdowns (#86)',
        '- fix: 🐛 sort vague premiere dates after precise ones (#70)',
        '- fix: :bug: keep the sheet open',
        '- feat(admin): ✨ swipe the show sheet down',
        '- chore: 🧹 update checker state',
        '- docs: 📝 priority labels',
        'Some prose GitHub added.',
      ].join('\n')
    ),
    {
      new: [
        'Show days, hours and minutes in drop countdowns',
        'Swipe the show sheet down',
      ],
      fixed: [
        'Sort vague premiere dates after precise ones',
        'Keep the sheet open',
      ],
    }
  )
})

test('notesFrom keeps a leading number that is not an emoji', () => {
  assert.deepEqual(notesFrom('- feat: 3 new list views').new, [
    '3 new list views',
  ])
})

test('releasesFrom lists releases with notes, newest first, plus the pending one', () => {
  const releases = releasesFrom(
    [
      {
        tag_name: 'v0.1.0',
        published_at: '2026-11-18T19:00:00Z',
        body: '- feat: ⏱️ countdowns (#86)',
      },
      {
        tag_name: 'v0.10.0',
        published_at: '2026-12-01T00:00:00Z',
        body: '- fix: a fix',
      },
      { tag_name: 'v0.2.0', published_at: null, body: '- chore: nothing' },
      { tag_name: 'not-a-version', published_at: null, body: '- feat: x' },
    ],
    {
      tag_name: 'v0.11.0',
      published_at: '2026-12-02T00:00:00Z',
      body: '- feat: y',
    }
  )
  assert.deepEqual(
    releases.map((r) => r.version),
    ['0.11.0', '0.10.0', '0.1.0']
  )
  assert.deepEqual(releases[2], {
    version: '0.1.0',
    date: '2026-11-18T19:00:00Z',
    new: ['Countdowns'],
    fixed: [],
  })
})

test('releasesFrom lists a re-run release once', () => {
  const release = {
    tag_name: 'v0.2.0',
    published_at: '2026-11-19T00:00:00Z',
    body: '- feat: x',
  }
  assert.equal(releasesFrom([release], release).length, 1)
})
