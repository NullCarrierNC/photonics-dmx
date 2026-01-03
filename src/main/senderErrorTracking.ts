// Track which senders have already had errors handled to prevent loops
const handledSenderErrors = new Set<string>();
const errorHandlingDebounce = new Map<string, number>(); // senderId -> timestamp

/**
 * Clear error tracking when a sender is successfully re-enabled.
 * This allows senders to be re-enabled after network errors.
 * @param senderId The ID of the sender to clear error tracking for
 */
export function clearSenderErrorTracking(senderId: string): void {
  handledSenderErrors.delete(senderId);
  errorHandlingDebounce.delete(senderId);
}

/**
 * Check if a sender's error has already been handled (to prevent loops)
 * @param senderId The ID of the sender to check
 * @returns true if the error has been handled, false otherwise
 */
export function isSenderErrorHandled(senderId: string): boolean {
  return handledSenderErrors.has(senderId);
}

/**
 * Mark a sender's error as handled
 * @param senderId The ID of the sender
 * @param timestamp The current timestamp
 */
export function markSenderErrorHandled(senderId: string, timestamp: number): void {
  handledSenderErrors.add(senderId);
  errorHandlingDebounce.set(senderId, timestamp);
}

/**
 * Get the last time an error was handled for a sender (for debouncing)
 * @param senderId The ID of the sender
 * @returns The timestamp of the last handled error, or 0 if never handled
 */
export function getLastErrorHandledTime(senderId: string): number {
  return errorHandlingDebounce.get(senderId) || 0;
}

/**
 * Remove a sender from error tracking (allows retry on error)
 * @param senderId The ID of the sender
 */
export function removeSenderErrorHandled(senderId: string): void {
  handledSenderErrors.delete(senderId);
}

