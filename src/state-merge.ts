import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { StateFile } from '../shared/types.ts'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeValue(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  path: string,
  conflicts: string[]
): unknown {
  if (isDeepStrictEqual(ours, base)) return theirs
  if (isDeepStrictEqual(theirs, base)) return ours
  if (isDeepStrictEqual(ours, theirs)) return ours

  if (isPlainObject(ours) && isPlainObject(theirs)) {
    const baseObject = isPlainObject(base) ? base : {}
    const merged: Record<string, unknown> = {}
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(ours),
      ...Object.keys(theirs),
    ])
    for (const key of keys) {
      const value = mergeValue(
        baseObject[key],
        ours[key],
        theirs[key],
        path ? `${path}.${key}` : key,
        conflicts
      )
      if (value !== undefined) merged[key] = value
    }
    return merged
  }

  conflicts.push(path)
  return theirs
}

export function mergeState(
  base: StateFile,
  ours: StateFile,
  theirs: StateFile
): { merged: StateFile; conflicts: string[] } {
  const conflicts: string[] = []
  const merged = mergeValue(base, ours, theirs, '', conflicts) as StateFile
  return { merged, conflicts }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const [basePath, oursPath, theirsPath, outPath] = process.argv.slice(2)
  if (!basePath || !oursPath || !theirsPath || !outPath) {
    console.error(
      'Usage: state-merge <base.json> <ours.json> <theirs.json> <out.json>'
    )
    process.exit(1)
  }

  const read = (path: string) =>
    JSON.parse(readFileSync(path, 'utf8')) as StateFile
  const { merged, conflicts } = mergeState(
    read(basePath),
    read(oursPath),
    read(theirsPath)
  )

  for (const field of conflicts) {
    console.log(`State merge conflict: kept remote value for ${field}`)
  }
  writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
}
