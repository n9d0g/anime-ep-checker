import { NextResponse } from 'next/server'
import { dispatchCheckWorkflow } from './github'
import { MalConfigError } from './mal'

export function errorMessage(error: unknown, fallback = 'Unknown error') {
  return error instanceof Error ? error.message : fallback
}

export interface ErrorResponseOptions {
  /** HTTP status for a thrown error, fixed or chosen from the error. */
  status: number | ((error: unknown) => number)
  headers?: HeadersInit
  /** Text for the `error` field; defaults to the error's message. */
  message?: (error: unknown) => string
}

export function errorResponse(
  error: unknown,
  { status, headers, message = errorMessage }: ErrorResponseOptions
) {
  return NextResponse.json(
    { error: message(error) },
    {
      status: typeof status === 'number' ? status : status(error),
      headers,
    }
  )
}

/** Runs a route body, turning anything it throws into `{ error }` JSON. */
export async function withErrorResponse(
  options: ErrorResponseOptions,
  run: () => Promise<Response>
): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    return errorResponse(error, options)
  }
}

/** Missing MAL credentials are a setup problem (400); anything else is a 500. */
export function malConfigErrorStatus(error: unknown) {
  return error instanceof MalConfigError ? 400 : 500
}

/** Live MAL list routes: missing MAL setup is a 400, anything else is MAL failing (502). */
export const MAL_LIST_ERRORS = {
  status: (error: unknown) => (error instanceof MalConfigError ? 400 : 502),
  message: (error: unknown) =>
    error instanceof MalConfigError
      ? 'MAL is not configured. Connect MAL from /mal first.'
      : errorMessage(error),
} satisfies Omit<ErrorResponseOptions, 'headers'>

/** Best-effort side effect: logs a failure instead of throwing and reports whether it worked. */
export async function attempt(
  action: () => Promise<unknown>,
  warning: string
): Promise<boolean> {
  try {
    await action()
    return true
  } catch (error) {
    console.warn(warning, error)
    return false
  }
}

/** Starts the check workflow (forced, or a cleanup run); true if it was dispatched. */
export function tryDispatchCheckWorkflow(force: boolean): Promise<boolean> {
  return attempt(
    () => dispatchCheckWorkflow(force),
    `Failed to dispatch ${force ? 'forced' : 'cleanup'} check workflow:`
  )
}

export function parseMalId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new Error('malId must be a positive number')
  }
  return value
}
