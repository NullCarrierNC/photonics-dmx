import type {
  AudioEventNode,
  ValueSource,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { YargEventType } from '../../../../../photonics-dmx/types'
import { AUDIO_EVENT_OPTIONS, YARG_EVENT_OPTIONS } from './options'

// Helper to display ValueSource as text
const displayValueSource = (vs: ValueSource | undefined, defaultValue: string = ''): string => {
  if (!vs) return defaultValue
  if (vs.source === 'literal') {
    return String(vs.value ?? defaultValue)
  }
  return `$${vs.name}`
}

const getYargEventLabel = (eventType: YargEventType): string =>
  YARG_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getConditionLabel = (condition: string, timeSource?: ValueSource): string => {
  if (!condition) return 'none'
  if (condition === 'delay') {
    const timeText = displayValueSource(timeSource, '0')
    return `delay [${timeText}ms]`
  }
  return condition
}

const getTextColorForBg = (name: string): string => {
  const lightish = ['white', 'yellow', 'amber', 'chartreuse', 'cyan', 'transparent']
  return lightish.includes(name) ? '#111827' : '#f9fafb'
}

const HIDDEN_CUE_TYPES = new Set(['NoCue', 'UnknownCue', 'Strobe', 'DisableAll', 'Strobe_Off'])

/** Returns false for internal/system cue types that should never appear in the UI selector. */
function isCueTypeSelectable(type: string): boolean {
  if (HIDDEN_CUE_TYPES.has(type)) return false
  if (type.startsWith('Keyframe_')) return false
  return true
}

/** Returns the first item when sorted alphabetically by name (matches sidebar order). */
function firstByName<T extends { name?: string; id: string }>(items: T[]): T | null {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
  )
  return sorted[0] ?? null
}

export {
  displayValueSource,
  firstByName,
  getAudioEventLabel,
  getConditionLabel,
  getTextColorForBg,
  getYargEventLabel,
  isCueTypeSelectable,
}
