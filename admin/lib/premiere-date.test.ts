import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sortByPremiereDate } from './premiere-date'

const today = new Date(Date.UTC(2026, 10, 6))

function titles(entries: { title: string; startDate: string | null }[]) {
  return sortByPremiereDate(entries, today).map((entry) => entry.title)
}

test('vague premiere dates sort at the end of their month or year', () => {
  assert.deepEqual(
    titles([
      { title: 'Year 2028', startDate: '2028' },
      { title: 'A year 2027', startDate: '2027' },
      { title: 'Feb 2027', startDate: '2027-02' },
      { title: 'Jan 5 2028', startDate: '2028-01-05' },
      { title: 'Dec 31 2027', startDate: '2027-12-31' },
      { title: 'Feb 3 2027', startDate: '2027-02-03' },
      { title: 'Jan 27 2027', startDate: '2027-01-27' },
    ]),
    [
      'Jan 27 2027',
      'Feb 3 2027',
      'Feb 2027',
      'Dec 31 2027',
      'A year 2027',
      'Jan 5 2028',
      'Year 2028',
    ]
  )
})

test('a month premiere date sorts after every day in that month', () => {
  assert.deepEqual(
    titles([
      { title: 'Jan 2027', startDate: '2027-01' },
      { title: 'Jan 31 2027', startDate: '2027-01-31' },
      { title: 'Jan 1 2027', startDate: '2027-01-01' },
    ]),
    ['Jan 1 2027', 'Jan 31 2027', 'Jan 2027']
  )
})

test('ties at the same premiere date sort by title', () => {
  assert.deepEqual(
    titles([
      { title: 'beta', startDate: '2027' },
      { title: 'Alpha', startDate: '2027' },
      { title: 'Delta', startDate: '2027-03-15' },
      { title: 'charlie', startDate: '2027-03-15' },
    ]),
    ['charlie', 'Delta', 'Alpha', 'beta']
  )
})

test('missing, unreadable, or past premiere dates go last by title', () => {
  assert.deepEqual(
    titles([
      { title: 'Zed', startDate: null },
      { title: 'Past', startDate: '2025-04' },
      { title: 'Garbage', startDate: 'soon' },
      { title: 'Dated', startDate: '2027' },
    ]),
    ['Dated', 'Garbage', 'Past', 'Zed']
  )
})

test('a vague premiere date still counts as upcoming until its span ends', () => {
  assert.deepEqual(
    titles([
      { title: 'No date', startDate: null },
      { title: 'This year', startDate: '2026' },
      { title: 'This month', startDate: '2026-11' },
    ]),
    ['This month', 'This year', 'No date']
  )
})
