import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bumpFor, nextVersion } from './next-version'

test('bumpFor reads the conventional commit type, gitmoji and all', () => {
  assert.equal(bumpFor('feat: ✨ release notes page'), 'minor')
  assert.equal(bumpFor('fix: 🐛 sort vague premiere dates (#70)'), 'patch')
  assert.equal(bumpFor('perf: faster search'), 'patch')
  assert.equal(bumpFor('refactor(admin): 🧱 share a hook'), 'patch')
  assert.equal(bumpFor('build: bump vite'), 'patch')
  assert.equal(bumpFor('feat!: drop the old list'), 'major')
  assert.equal(bumpFor('fix: x\n\nBREAKING CHANGE: the API moved'), 'major')
  for (const message of [
    'chore: 🧹 update checker state',
    'docs: 📝 priority labels',
    'style: :lipstick: oxfmt',
    'ci: cache pnpm',
    'test: more cases',
    'Merge pull request #85 from n9d0g/docs/priority-labels',
  ]) {
    assert.equal(bumpFor(message), null, message)
  }
})

test('nextVersion takes the biggest bump, and a breaking change is minor below 1.0', () => {
  assert.equal(nextVersion('0.1.0', ['feat: a']), '0.2.0')
  assert.equal(nextVersion('0.2.3', ['fix: a']), '0.2.4')
  assert.equal(nextVersion('0.2.3', ['fix: a', 'feat: b']), '0.3.0')
  assert.equal(nextVersion('0.2.3', ['feat!: a']), '0.3.0')
  assert.equal(nextVersion('1.2.3', ['feat!: a']), '2.0.0')
  assert.equal(nextVersion('0.2.3', ['chore: a', 'docs: b']), null)
  assert.equal(nextVersion('0.2.3', []), null)
})
