/**
 * Event names a cue graph can wait on: the runtime's own lifecycle events, and the song events
 * each supported game sends.
 */

/**
 * Node system events - cue lifecycle events handled by the node cue system.
 * These are NOT song events and should NOT be used in action timing.
 */
export const NODE_SYSTEM_EVENTS = [
  'cue-started', // Fires once per cue lifecycle (first YARG call after creation)
  'cue-called', // Fires every YARG call (for repeated work)
] as const

/**
 * Represents node system lifecycle events
 */
export type NodeSystemEvent = (typeof NODE_SYSTEM_EVENTS)[number]

/**
 * Song events carried by a YARG datagram: the tempo grid, keyframe advances, and the notes played on
 * each instrument. An RB3 cue can never receive these, so they are not in the RB3 vocabulary.
 */
export const YARG_SONG_EVENTS = [
  'beat',
  'measure',
  'half-beat',
  'keyframe',
  'keyframe-first',
  'keyframe-next',
  'keyframe-previous',
  // Guitar events
  'guitar-open',
  'guitar-green',
  'guitar-red',
  'guitar-yellow',
  'guitar-blue',
  'guitar-orange',
  // Bass events
  'bass-open',
  'bass-green',
  'bass-red',
  'bass-yellow',
  'bass-blue',
  'bass-orange',
  // Keys events
  'keys-open',
  'keys-green',
  'keys-red',
  'keys-yellow',
  'keys-blue',
  'keys-orange',
  // Drum events
  'drum-kick',
  'drum-red',
  'drum-yellow',
  'drum-blue',
  'drum-green',
  'drum-yellow-cymbal',
  'drum-blue-cymbal',
  'drum-green-cymbal',
  // Vocal events (note-on/note-off edges from any vocal or harmony part)
  'vocal-note',
  'vocal-note-off',
] as const

/**
 * Song events carried by the RB3 StageKit packet stream, which a YARG cue can never receive.
 *
 * The LED edges are aggregates across colour banks: led-N fires when position N lights up, led-N-off
 * when it clears. Bank state persists between packets, so these are edge-triggered against the
 * previous frame (like vocal events), not level-triggered.
 */
export const RB3_SONG_EVENTS = [
  'led-1',
  'led-2',
  'led-3',
  'led-4',
  'led-5',
  'led-6',
  'led-7',
  'led-8',
  'led-1-off',
  'led-2-off',
  'led-3-off',
  'led-4-off',
  'led-5-off',
  'led-6-off',
  'led-7-off',
  'led-8-off',
  'fog-on',
  'fog-off',
] as const

/**
 * Everything an action's `waitForCondition` / `waitUntilCondition` may name: the two timing
 * primitives followed by every song event of either mode. Per-mode authoring vocabularies are built
 * from the two song-event lists above, so this superset stays the union.
 */
export const WAIT_CONDITIONS = ['none', 'delay', ...YARG_SONG_EVENTS, ...RB3_SONG_EVENTS] as const

/**
 * Represents song-based wait conditions for action timing - derived from WAIT_CONDITIONS
 */
export type WaitCondition = (typeof WAIT_CONDITIONS)[number]

/**
 * Combined event types for YARG event nodes.
 * Includes both system events and song events.
 */
export const NET_EVENT_TYPES = [...NODE_SYSTEM_EVENTS, ...WAIT_CONDITIONS] as const

/**
 * Represents all valid event types for YARG event nodes
 */
export type NetEventType = (typeof NET_EVENT_TYPES)[number]
