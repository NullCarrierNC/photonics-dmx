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
