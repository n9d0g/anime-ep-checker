import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DISNEY_REFRESH_TOKEN_PATH = resolve(ROOT, 'disney_refresh_token.txt')

export function writeDisneyRefreshToken(refreshToken: string): void {
  writeFileSync(DISNEY_REFRESH_TOKEN_PATH, refreshToken, {
    encoding: 'utf8',
    mode: 0o600,
  })
}
