/**
 * Categorised event options for the cue editor's event-node dropdown.
 *
 * The values come from the mode's vocabulary rather than a list kept here, so the editor can never
 * offer an event the domain disallows nor miss one it allows. This file only decides how those
 * values are grouped and labelled for display. It reads the vocabulary rather than the whole
 * descriptor because the renderer bundles this, and the descriptor's runtime hooks cannot go there.
 */

import { getCueVocabulary } from '../../domains/vocabulary'
import type { NodeCueMode } from '../../types/nodeCueTypes'

/**
 * Event category definition for UI
 */
export interface EventCategory {
  category: string
  events: { value: string; label: string }[]
}

/** The categories, in display order. An event lands in the first one that claims it. */
const CATEGORIES: { category: string; claims: (value: string) => boolean }[] = [
  { category: 'Guitar', claims: (v) => v.startsWith('guitar-') },
  { category: 'Bass', claims: (v) => v.startsWith('bass-') },
  { category: 'Keys', claims: (v) => v.startsWith('keys-') },
  { category: 'Drums', claims: (v) => v.startsWith('drum-') },
  { category: 'Vocals', claims: (v) => v.startsWith('vocal-') },
  { category: 'RB3 StageKit', claims: (v) => /^(led-|fog-)/.test(v) },
  // Everything left is the cue lifecycle and the tempo/keyframe grid.
  { category: 'Timing', claims: () => true },
]

/** Order the categories are shown in, which is not the order they claim values in. */
const CATEGORY_ORDER = ['Timing', 'Guitar', 'Bass', 'Keys', 'Drums', 'Vocals', 'RB3 StageKit']

/** Values whose label is not the default rendering of the value itself. */
const EVENT_LABELS: Record<string, string> = {
  'cue-started': 'Cue Started (once per lifecycle)',
  'cue-called': 'Cue Called (every call)',
  'keyframe': 'Keyframe (any)',
  'vocal-note': 'Vocal Note On',
  'vocal-note-off': 'Vocal Note Off',
  'fog-on': 'Fog On',
  'fog-off': 'Fog Off',
}

const titleCase = (words: string[]): string =>
  words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

/**
 * The display label for one event value: an explicit override, then the LED positions, then the
 * instrument notes (shown without their instrument prefix, which the category already says), then
 * the plain title-cased value.
 */
function labelFor(value: string): string {
  const override = EVENT_LABELS[value]
  if (override) {
    return override
  }
  const led = /^led-([1-8])(-off)?$/.exec(value)
  if (led) {
    return `LED ${led[1]} ${led[2] ? 'Off' : 'On'}`
  }
  const instrument = /^(?:guitar|bass|keys|drum)-(.+)$/.exec(value)
  if (instrument) {
    return titleCase(instrument[1].split('-'))
  }
  return titleCase(value.split('-'))
}

/** Group one mode's authorable event types into the editor's categories, empty ones dropped. */
function eventCategoriesFor(mode: NodeCueMode): EventCategory[] {
  const byCategory = new Map<string, { value: string; label: string }[]>()
  for (const value of getCueVocabulary(mode).eventTypes) {
    const category = CATEGORIES.find((c) => c.claims(value))!.category
    const events = byCategory.get(category) ?? []
    events.push({ value, label: labelFor(value) })
    byCategory.set(category, events)
  }
  return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    events: byCategory.get(category)!,
  }))
}

/**
 * Categorized event options for YARG cues: the cue lifecycle, the tempo and keyframe grid, and the
 * notes played on each instrument. The RB3 StageKit LED and fog edges are absent because a YARG
 * datagram never carries them.
 */
export function getYargEventCategories(): EventCategory[] {
  return eventCategoriesFor('yarg')
}

/**
 * Categorized event options for RB3 cue mode. RB3 graphs are YARG-shaped, but the StageKit packet
 * stream only ever yields the lifecycle events plus LED/fog edges, so the tempo, keyframe and
 * instrument events are absent: picking one would wait forever.
 */
export function getRb3EventCategories(): EventCategory[] {
  return eventCategoriesFor('rb3')
}
