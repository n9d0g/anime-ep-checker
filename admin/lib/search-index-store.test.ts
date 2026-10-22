import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSearchIndexStore } from './search-index-store'
import type { SearchIndexItem } from './search'

function item(id: string): SearchIndexItem {
  return { category: 'watching', id, title: id, href: `/#show-${id}` }
}

test('the index is fetched once and shared by later loads', async () => {
  let fetches = 0
  const store = createSearchIndexStore(async () => {
    fetches += 1
    return [item('a')]
  })

  const [first, second] = await Promise.all([store.load(), store.load()])
  const third = await store.load()

  assert.equal(fetches, 1)
  assert.deepEqual(first, [item('a')])
  assert.equal(second, first)
  assert.equal(third, first)
})

test('a failed fetch is retried on the next load', async () => {
  let fetches = 0
  const store = createSearchIndexStore(async () => {
    fetches += 1
    if (fetches === 1) {
      throw new Error('offline')
    }
    return [item('a')]
  })

  await assert.rejects(store.load(), { message: 'offline' })
  assert.deepEqual(await store.load(), [item('a')])
  assert.equal(fetches, 2)
})

test('invalidate makes the next load fetch a fresh index', async () => {
  let fetches = 0
  const store = createSearchIndexStore(async () => {
    fetches += 1
    return [item(String(fetches))]
  })

  await store.load()
  store.invalidate()

  assert.deepEqual(await store.load(), [item('2')])
  assert.equal(fetches, 2)
})
