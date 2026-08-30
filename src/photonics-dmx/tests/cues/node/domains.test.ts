/**
 * Spec for the per-mode domain descriptors: which family a mode belongs to, how it resolves cue data
 * and per-frame conditions, and what vocabulary it may author.
 */

import { describe, expect, it } from '@jest/globals'
import { CUE_DOMAIN_DESCRIPTORS, getCueDomain } from '../../../cues/domains'
import { extractCueDataValue } from '../../../cues/node/runtime/dataExtractors'
import { createMockCueData, createMockAudioCueData } from '../../../../main/ipc/mockCueData'
import { getYargEventCategories, getRb3EventCategories } from '../../../cues/node/utils/eventUtils'
import type { CueData } from '../../../cues/types/cueTypes'
import type { NodeCueMode } from '../../../cues/types/nodeCueTypes'

const ALL_MODES: NodeCueMode[] = ['yarg', 'rb3', 'audio']

const netFrame = (overrides: Partial<CueData> = {}): CueData =>
  ({ ...createMockCueData({}), ...overrides }) as CueData

describe('cue domain descriptors', () => {
  it('gives every mode a descriptor whose id matches its key', () => {
    for (const mode of ALL_MODES) {
      expect(getCueDomain(mode).id).toBe(mode)
      expect(CUE_DOMAIN_DESCRIPTORS[mode]).toBe(getCueDomain(mode))
    }
  })

  it('puts the two net modes in one family and audio in the other', () => {
    expect(getCueDomain('yarg').family).toBe('net')
    expect(getCueDomain('rb3').family).toBe('net')
    expect(getCueDomain('audio').family).toBe('audio')

    // Runtime behaviour is family-level, so yarg and rb3 share the very same hooks rather than
    // holding two copies that could drift.
    expect(getCueDomain('rb3').isEventTriggered).toBe(getCueDomain('yarg').isEventTriggered)
    expect(getCueDomain('rb3').extractCueData).toBe(getCueDomain('yarg').extractCueData)
  })

  it('folds rb3 effects onto the yarg effect tree', () => {
    expect(getCueDomain('rb3').effectMode).toBe('yarg')
    expect(getCueDomain('audio').effectMode).toBe('audio')
  })
})

describe('cue data resolves by declared mode', () => {
  it('reads a net frame through the net extractor with lightingCue absent', () => {
    // The declared mode is the only signal, so an optional field missing from the frame cannot
    // divert the lookup to the other family.
    const frame = netFrame({ beatsPerMinute: 120 })
    delete (frame as Partial<CueData>).lightingCue

    expect(extractCueDataValue('bpm', frame, 'cue', 'yarg')).toBe(120)
    expect(extractCueDataValue('bpm', frame, 'cue', 'rb3')).toBe(120)
  })

  it('reads an audio frame through the audio extractor', () => {
    const audio = createMockAudioCueData(3)
    expect(extractCueDataValue('execution-count', audio, 'cue', 'audio')).toBe(3)
  })

  it('resolves the same property id differently per family', () => {
    // 'cue-type' is a net property. Audio has no such column and answers with its own default.
    const net = extractCueDataValue('cue-type', netFrame(), 'cue', 'yarg')
    const audio = extractCueDataValue('cue-type', createMockAudioCueData(1), 'cue', 'audio')
    expect(net).not.toBe(audio)
  })

  it('keeps the net extractor a superset so an rb3 cue can read a shared property', () => {
    // Only the authoring vocabulary is per-mode. A file reading outside its own list still
    // resolves, so the split constrains what an editor offers without narrowing what runs.
    expect(getCueDomain('rb3').cueDataProperties).not.toContain('venue-size')
    expect(extractCueDataValue('venue-size', netFrame({ venueSize: 'Large' }), 'cue', 'rb3')).toBe(
      'Large',
    )
  })
})

describe('per-mode authoring vocabulary', () => {
  it('offers the StageKit edges to rb3 and the song events to yarg, not the reverse', () => {
    const yarg = getCueDomain('yarg').eventTypes
    const rb3 = getCueDomain('rb3').eventTypes

    expect(rb3).toContain('led-1')
    expect(rb3).toContain('fog-on')
    expect(rb3).not.toContain('beat')
    expect(rb3).not.toContain('drum-kick')

    expect(yarg).toContain('beat')
    expect(yarg).toContain('drum-kick')
    expect(yarg).not.toContain('led-1')
    expect(yarg).not.toContain('fog-on')

    // Both still author the lifecycle events, which belong to no song stream.
    for (const events of [yarg, rb3]) {
      expect(events).toContain('cue-started')
      expect(events).toContain('cue-called')
    }
  })

  it('splits the cue-data properties the same way', () => {
    expect(getCueDomain('rb3').cueDataProperties).toContain('led-red-states')
    expect(getCueDomain('yarg').cueDataProperties).not.toContain('led-red-states')
    expect(getCueDomain('yarg').cueDataProperties).toContain('venue-size')
  })

  it('is the only source of the editor categories', () => {
    const categorised = (cats: { events: { value: string }[] }[]): string[] =>
      cats.flatMap((c) => c.events.map((e) => e.value))

    for (const [mode, cats] of [
      ['yarg', getYargEventCategories()],
      ['rb3', getRb3EventCategories()],
    ] as const) {
      // Equality, not containment: the categories are derived from the descriptor, so the editor can
      // neither offer an event the domain disallows nor miss one it allows.
      expect(categorised(cats).sort()).toEqual([...getCueDomain(mode).eventTypes].sort())
    }
  })
})
