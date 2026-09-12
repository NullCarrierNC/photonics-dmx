/**
 * Bounds for the float fields in a YARG datagram.
 *
 * The wire carries raw IEEE floats with no range guarantee, and the values feed timing and event
 * maths that only guard against zero and negatives. A denormal tempo yields a beat duration around
 * 1e47 ms and an enormous one yields zero, both of which pass a bare positive check, so they are
 * screened here at the point of decoding rather than at each consumer.
 */

/** Slowest tempo treated as real. */
export const MIN_BPM = 20

/** Fastest tempo treated as real. */
export const MAX_BPM = 400

/** Highest MIDI note number, so a stray float cannot report an active vocal. */
export const MAX_PITCH = 127

/** Reads a tempo, returning 0 for anything outside a musical range so consumers use their fallback. */
export function readTempo(buffer: Buffer, offset: number): number {
  const raw = buffer.readFloatLE(offset)
  if (!Number.isFinite(raw) || raw < MIN_BPM || raw > MAX_BPM) {
    return 0
  }
  return raw
}

/** Reads a vocal or harmony pitch, returning 0 for anything outside the MIDI range. */
export function readPitch(buffer: Buffer, offset: number): number {
  const raw = buffer.readFloatLE(offset)
  if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_PITCH) {
    return 0
  }
  return raw
}
