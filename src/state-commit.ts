import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const STATE_COMMIT_MESSAGE_PATH = resolve(ROOT, 'state_commit_message.txt')

const SUBJECT_PREFIX = 'chore: update checker state — '
const MAX_SUBJECT_LENGTH = 120

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

export function formatStateCommitMessage(reasons: string[]): {
  subject: string
  body: string
} {
  if (reasons.length === 0) {
    return { subject: 'chore: 🧹 update checker state', body: '' }
  }

  const first = truncate(reasons[0], MAX_SUBJECT_LENGTH - SUBJECT_PREFIX.length)
  const subject = `${SUBJECT_PREFIX}${first}`
  const body =
    reasons.length > 1
      ? reasons.slice(1).map((reason) => `- ${reason}`).join('\n')
      : ''

  return { subject, body }
}

export function writeStateCommitMessage(reasons: string[]): void {
  const { subject, body } = formatStateCommitMessage(reasons)
  const content = body ? `${subject}\n\n${body}\n` : `${subject}\n`
  writeFileSync(STATE_COMMIT_MESSAGE_PATH, content, 'utf8')
}
