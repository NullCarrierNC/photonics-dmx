import {
  NODE_EFFECT_TYPES,
  type LogicNode,
  type NodeEffectType,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NotesVariant } from './types'

/** MIME type used to identify drag operations originating from the Cue Editor node palette. */
export const NODE_DRAG_MIME = 'application/x-photonics-node'

export type NodeDragPayload =
  | { kind: 'system-event' }
  | { kind: 'event-listener' }
  | { kind: 'effect-listener' }
  | { kind: 'event-raiser' }
  | { kind: 'effect-raiser' }
  | { kind: 'action'; effectType: NodeEffectType }
  | { kind: 'logic'; logicType: LogicNode['logicType'] }
  | { kind: 'notes'; variant: NotesVariant }

// Exhaustive by construction: this map must list EVERY LogicNode logicType, so adding a new logic node
// type is a compile error here until it is registered. A missing entry makes parseNodeDrag reject the
// drop and the dragged node silently vanishes, so the completeness check has to be enforced by the type.
const LOGIC_TYPE_MEMBERSHIP: Record<LogicNode['logicType'], true> = {
  'variable': true,
  'math': true,
  'clamp': true,
  'expression': true,
  'select-from-list': true,
  'pulse': true,
  'conditional': true,
  'frame-gate': true,
  'tempo': true,
  'indexed-variable': true,
  'led-changed': true,
  'cue-data': true,
  'config-data': true,
  'lights-from-index': true,
  'color-from-index': true,
  'reverse-colors': true,
  'concat-colors': true,
  'shuffle-colors': true,
  'array-length': true,
  'reverse-lights': true,
  'create-pairs': true,
  'concat-lights': true,
  'build-ring': true,
  'delay': true,
  'debugger': true,
  'random': true,
  'shuffle-lights': true,
  'for-each-light': true,
}

const LOGIC_TYPES = new Set<string>(Object.keys(LOGIC_TYPE_MEMBERSHIP))

const NOTES_VARIANTS: ReadonlyArray<NotesVariant> = ['notes', 'info', 'important']

export const serializeNodeDrag = (payload: NodeDragPayload): string => JSON.stringify(payload)

/** Strict parser; returns null on any unexpected/malformed value rather than guessing. */
export const parseNodeDrag = (raw: string): NodeDragPayload | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const kind = (parsed as { kind?: unknown }).kind
  if (typeof kind !== 'string') return null

  switch (kind) {
    case 'system-event':
    case 'event-listener':
    case 'effect-listener':
    case 'event-raiser':
    case 'effect-raiser':
      return { kind }
    case 'action': {
      const effectType = (parsed as { effectType?: unknown }).effectType
      if (
        typeof effectType !== 'string' ||
        !(NODE_EFFECT_TYPES as readonly string[]).includes(effectType)
      ) {
        return null
      }
      return { kind: 'action', effectType: effectType as NodeEffectType }
    }
    case 'logic': {
      const logicType = (parsed as { logicType?: unknown }).logicType
      if (typeof logicType !== 'string' || !LOGIC_TYPES.has(logicType)) {
        return null
      }
      return { kind: 'logic', logicType: logicType as LogicNode['logicType'] }
    }
    case 'notes': {
      const variant = (parsed as { variant?: unknown }).variant
      if (typeof variant !== 'string' || !(NOTES_VARIANTS as readonly string[]).includes(variant)) {
        return null
      }
      return { kind: 'notes', variant: variant as NotesVariant }
    }
    default:
      return null
  }
}
