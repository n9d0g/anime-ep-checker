// GitHub Models chat completions (free tier), authenticated with the Actions
// workflow's GITHUB_TOKEN (`permissions: models: read`).
const MODELS_URL = 'https://models.github.ai/inference/chat/completions'
const MODEL = 'openai/gpt-4.1-mini'
const REQUEST_TIMEOUT_MS = 60_000

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * The model's JSON reply, or why there isn't one: `auth` when the token is
 * refused (alert the user), `transient` for rate limits, outages and replies
 * that aren't JSON (retry at the next check).
 */
export type ModelsReply =
  | { ok: true; json: unknown }
  | { ok: false; kind: 'auth' | 'transient'; message: string }

export type CompleteJson = (messages: ChatMessage[]) => Promise<ModelsReply>

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

export function createGitHubModelsClient(token: string): CompleteJson {
  return async (messages) => {
    let response: Response
    try {
      response = await fetch(MODELS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        message: error instanceof Error ? error.message : String(error),
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        kind: 'auth',
        message: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: 'transient',
        message: `HTTP ${response.status}`,
      }
    }

    try {
      const payload = (await response.json()) as ChatCompletionResponse
      const content = payload.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('no message content')
      }
      return { ok: true, json: JSON.parse(content) }
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        message: `Unreadable reply: ${
          error instanceof Error ? error.message : error
        }`,
      }
    }
  }
}
