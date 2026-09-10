/**
 * Reading the success flag an IPC handler answers with.
 */

/**
 * Whether the main process refused. Only an explicit `success: false` counts, so a handler that
 * resolves nothing is read as having worked.
 */
export function wasRefused(result: unknown): result is { error?: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === false
  )
}

/**
 * The value a channel answers with, or a throw when it answered with a failure.
 *
 * A channel whose payload has no room for an error arm still has to say when it could not produce
 * one. Callers written against a value get that value or an exception, which is what a try around
 * the call already expects, and the failure carries the main process's own message.
 */
export function orThrow<T>(result: T | { success: false; error: string }): T {
  if (wasRefused(result)) {
    throw new Error(result.error ?? 'The main process refused without saying why')
  }
  return result as T
}
