#!/usr/bin/env node
// The version a push to main releases (ADR 0004). The deploy runs it:
//
//   echo '["feat: …", "fix: …"]' | node scripts/next-version.ts 0.1.0
//
// It prints the next version, or nothing when the push releases nothing.

import { nextVersion } from '../lib/next-version.ts'

const current = process.argv[2]
if (!current || !/^\d+\.\d+\.\d+$/.test(current)) {
  console.error(
    'Usage: node scripts/next-version.ts <current x.y.z> < messages.json'
  )
  process.exit(2)
}
const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
const messages = JSON.parse(Buffer.concat(chunks).toString('utf8')) as string[]
const next = nextVersion(current, messages)
if (next) console.log(next)
