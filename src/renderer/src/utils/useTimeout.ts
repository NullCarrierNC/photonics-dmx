import { useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for managing timeouts with automatic cleanup
 * 
 * @param callback The function to call after the timeout
 * @param delay The timeout delay in milliseconds
 * @returns An object with functions to control the timeout
 */
export function useTimeout(callback: () => void, delay: number | null) {
  // Store the callback in a ref so we can update it without resetting the timer
  const callbackRef = useRef(callback);
  // Store the timeout ID for cleanup
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update the callback ref when the callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Set up the timeout
  const set = useCallback(() => {
    // Clear any existing timeout first
    clear();
    
    // Only set a new timeout if we have a positive delay
    if (delay !== null && delay >= 0) {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current();
      }, delay);
    }
  }, [delay]);

  // Clear the timeout
  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Reset the timeout (clear and set again)
  const reset = useCallback(() => {
    clear();
    set();
  }, [clear, set]);

  // Clean up the timeout on unmount
  useEffect(() => {
    return clear;
  }, [clear]);

  return { set, clear, reset };
}

/**
 * Simplified version of useTimeout that automatically sets the timeout
 * when the component mounts or when delay changes.
 * 
 * @param callback The function to call after the timeout
 * @param delay The timeout delay in milliseconds
 * @returns An object with functions to control the timeout
 */
export function useTimeoutEffect(callback: () => void, delay: number | null) {
  const { clear, reset } = useTimeout(callback, delay);

  // Set the timeout when the component mounts or when dependencies change
  useEffect(() => {
    // Only set the timeout if we have a valid delay
    if (delay !== null && delay >= 0) {
      reset();
    }
    return clear;
  }, [delay, reset, clear]);

  return { clear, reset };
} 