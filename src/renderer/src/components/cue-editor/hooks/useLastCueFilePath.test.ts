import { describe, expect, it } from '@jest/globals'
import { fileModeForModeKey, modeKeyFor } from './useLastCueFilePath'
import type { NodeCueKind, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

const MODES: NodeCueMode[] = ['yarg', 'audio', 'rb3']
const KINDS: NodeCueKind[] = ['lighting', 'motion']

describe('modeKeyFor', () => {
  it('keys yarg and audio cues by kind', () => {
    expect(modeKeyFor('yarg', 'lighting', false)).toBe('yarg-cue')
    expect(modeKeyFor('yarg', 'motion', false)).toBe('yarg-motion-cue')
    expect(modeKeyFor('audio', 'lighting', false)).toBe('audio-cue')
    expect(modeKeyFor('audio', 'motion', false)).toBe('audio-motion-cue')
  })

  it('keys rb3 cues by kind too', () => {
    expect(modeKeyFor('rb3', 'lighting', false)).toBe('rb3-cue')
    expect(modeKeyFor('rb3', 'motion', false)).toBe('rb3-motion-cue')
  })

  it('never files an rb3 cue under an audio key', () => {
    for (const kind of KINDS) {
      expect(modeKeyFor('rb3', kind, false)).not.toMatch(/^audio/)
    }
  })

  it('resolves effects to yarg or audio only, with rb3 sharing the yarg effects', () => {
    for (const kind of KINDS) {
      expect(modeKeyFor('yarg', kind, true)).toBe('yarg-effect')
      expect(modeKeyFor('rb3', kind, true)).toBe('yarg-effect')
      expect(modeKeyFor('audio', kind, true)).toBe('audio-effect')
    }
  })

  it('returns a distinct key per cue context and never collides across modes', () => {
    const keys = MODES.flatMap((mode) => KINDS.map((kind) => modeKeyFor(mode, kind, false)))
    expect(new Set(keys).size).toBe(MODES.length * KINDS.length)
  })
})

describe('fileModeForModeKey', () => {
  it('round-trips every cue key back to the mode that produced it', () => {
    for (const mode of MODES) {
      for (const kind of KINDS) {
        expect(fileModeForModeKey(modeKeyFor(mode, kind, false))).toBe(mode)
      }
    }
  })

  it('maps effect keys to the mode that owns those effects', () => {
    expect(fileModeForModeKey('yarg-effect')).toBe('yarg')
    expect(fileModeForModeKey('audio-effect')).toBe('audio')
  })
})
