/**
 * Pure-JS microsecond busy-wait for precise DMX BREAK/MAB framing.
 *
 * enttec-open-dmx-usb bit-bangs DMX512 over a serial port. Without a precise
 * microsecond sleep it falls back to setTimeout(…, 1) for the BREAK and
 * Mark-After-Break, whose jitter on a busy event loop violates the DMX timing
 * spec and causes flicker. Blocking on the monotonic clock (process.hrtime,
 * immune to timer coalescing) holds the line state precisely during BREAK/MAB.
 *
 * Tthe library calls usleep(92)+usleep(12) once per
 * frame (~104 µs), so at 40 Hz this is ~4.2 ms/s (~0.4% of one core).
 */
export function usleep(microSeconds: number): void {
  if (!Number.isFinite(microSeconds) || microSeconds <= 0) {
    return // rejects 0, negative, NaN, Infinity
  }
  const end = process.hrtime.bigint() + BigInt(Math.round(microSeconds)) * 1000n
  while (process.hrtime.bigint() < end) {
    // Busy-wait: the line state must be held precisely during BREAK/MAB — do not yield.
  }
}
