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

const LOGIC_TYPES: ReadonlyArray<LogicNode['logicType']> = [
  'variable',
  'math',
  'conditional',
  'cue-data',
  'config-data',
  'lights-from-index',
  'color-from-index',
  'reverse-colors',
  'concat-colors',
  'shuffle-colors',
  'array-length',
  'reverse-lights',
  'create-pairs',
  'concat-lights',
  'build-ring',
  'delay',
  'debugger',
  'random',
  'shuffle-lights',
  'for-each-light',
]

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
      if (
        typeof logicType !== 'string' ||
        !(LOGIC_TYPES as readonly string[]).includes(logicType)
      ) {
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
