/**
 * Spec for the per-frame condition gate shared by cue entry-node selection and condition-based
 * action waits. Every branch is pinned here so the gate keeps identical semantics as the engine is
 * refactored around it.
 */

import { describe, expect, it } from '@jest/globals'
import { evaluateEventCondition } from '../../../cues/node/runtime/GraphExecutionPolicy'
import { createMockCueData } from '../../../../main/ipc/mockCueData'
import { DrumNoteType, InstrumentNoteType } from '../../../cues/types/cueTypes'
import type { CueData } from '../../../cues/types/cueTypes'

const frame = (overrides: Partial<CueData> = {}): CueData =>
  ({ ...createMockCueData({}), ...overrides }) as CueData

describe('evaluateEventCondition', () => {
  it('fires beat on any beat and measure only on Measure', () => {
    for (const beat of ['Strong', 'Weak', 'Measure'] as const) {
      expect(evaluateEventCondition('yarg', 'beat', frame({ beat }))).toBe(true)
    }
    expect(evaluateEventCondition('yarg', 'beat', frame({ beat: 'Off' }))).toBe(false)

    expect(evaluateEventCondition('yarg', 'measure', frame({ beat: 'Measure' }))).toBe(true)
    expect(evaluateEventCondition('yarg', 'measure', frame({ beat: 'Strong' }))).toBe(false)
  })

  it('excludes Measure from half-beat', () => {
    expect(evaluateEventCondition('yarg', 'half-beat', frame({ beat: 'Strong' }))).toBe(true)
    expect(evaluateEventCondition('yarg', 'half-beat', frame({ beat: 'Weak' }))).toBe(true)
    expect(evaluateEventCondition('yarg', 'half-beat', frame({ beat: 'Measure' }))).toBe(false)
  })

  it('fires the generic keyframe on all three directions and each directional on its own', () => {
    for (const keyframe of ['First', 'Next', 'Previous'] as const) {
      expect(evaluateEventCondition('yarg', 'keyframe', frame({ keyframe }))).toBe(true)
    }
    expect(evaluateEventCondition('yarg', 'keyframe', frame({ keyframe: 'Off' }))).toBe(false)

    expect(evaluateEventCondition('yarg', 'keyframe-first', frame({ keyframe: 'First' }))).toBe(
      true,
    )
    expect(evaluateEventCondition('yarg', 'keyframe-first', frame({ keyframe: 'Next' }))).toBe(
      false,
    )
    expect(evaluateEventCondition('yarg', 'keyframe-next', frame({ keyframe: 'Next' }))).toBe(true)
    expect(
      evaluateEventCondition('yarg', 'keyframe-previous', frame({ keyframe: 'Previous' })),
    ).toBe(true)
  })

  it('edge-triggers vocal notes against the previous frame', () => {
    const singing = { vocalNote: 60 }
    const silent = { vocalNote: 0 }

    expect(
      evaluateEventCondition('yarg', 'vocal-note', frame({ ...singing, previousFrame: silent })),
    ).toBe(true)
    // Held note: no new edge.
    expect(
      evaluateEventCondition('yarg', 'vocal-note', frame({ ...singing, previousFrame: singing })),
    ).toBe(false)
    expect(
      evaluateEventCondition(
        'yarg',
        'vocal-note-off',
        frame({ ...silent, previousFrame: singing }),
      ),
    ).toBe(true)
    expect(
      evaluateEventCondition('yarg', 'vocal-note-off', frame({ ...silent, previousFrame: silent })),
    ).toBe(false)
  })

  it('edge-triggers led-N on and off against the previous frame', () => {
    const lit = { ledBanks: { red: 0b00000001, green: 0, blue: 0, yellow: 0 } }
    const dark = { ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 } }

    expect(evaluateEventCondition('yarg', 'led-1', frame({ ...lit, previousFrame: dark }))).toBe(
      true,
    )
    expect(evaluateEventCondition('yarg', 'led-1', frame({ ...lit, previousFrame: lit }))).toBe(
      false,
    )
    expect(
      evaluateEventCondition('yarg', 'led-1-off', frame({ ...dark, previousFrame: lit })),
    ).toBe(true)
    expect(
      evaluateEventCondition('yarg', 'led-1-off', frame({ ...dark, previousFrame: dark })),
    ).toBe(false)
    // Position 2 is unaffected by position 1's edge.
    expect(evaluateEventCondition('yarg', 'led-2', frame({ ...lit, previousFrame: dark }))).toBe(
      false,
    )
  })

  it('fires a held led-N only when triggerOnColorChange opts in', () => {
    const red = { ledBanks: { red: 0b00000001, green: 0, blue: 0, yellow: 0 } }
    const blue = { ledBanks: { red: 0, green: 0, blue: 0b00000001, yellow: 0 } }
    const swapped = frame({ ...blue, previousFrame: red })

    expect(evaluateEventCondition('yarg', 'led-1', swapped)).toBe(false)
    expect(evaluateEventCondition('yarg', 'led-1', swapped, true)).toBe(true)
    // Same colour held: even opted in, nothing changed.
    expect(
      evaluateEventCondition('yarg', 'led-1', frame({ ...red, previousFrame: red }), true),
    ).toBe(false)
  })

  it('edge-triggers fog on and off', () => {
    expect(
      evaluateEventCondition(
        'yarg',
        'fog-on',
        frame({ fogState: true, previousFrame: { fogState: false } }),
      ),
    ).toBe(true)
    expect(
      evaluateEventCondition(
        'yarg',
        'fog-on',
        frame({ fogState: true, previousFrame: { fogState: true } }),
      ),
    ).toBe(false)
    expect(
      evaluateEventCondition(
        'yarg',
        'fog-off',
        frame({ fogState: false, previousFrame: { fogState: true } }),
      ),
    ).toBe(true)
  })

  it('delegates instrument events to the note matcher', () => {
    expect(
      evaluateEventCondition('yarg', 'drum-red', frame({ drumNotes: [DrumNoteType.RedDrum] })),
    ).toBe(true)
    expect(evaluateEventCondition('yarg', 'drum-red', frame({ drumNotes: [] }))).toBe(false)
    expect(
      evaluateEventCondition(
        'yarg',
        'guitar-red',
        frame({ guitarNotes: [InstrumentNoteType.Red] }),
      ),
    ).toBe(true)
  })

  it('fires an instrument note on its rising edge only', () => {
    const hit = { drumNotes: [DrumNoteType.RedDrum] }

    // Held across keepalive frames: the note is still present but already was, so no re-fire.
    expect(evaluateEventCondition('yarg', 'drum-red', frame({ ...hit, previousFrame: hit }))).toBe(
      false,
    )
    // Arriving against a baseline without it, and again after a release.
    expect(
      evaluateEventCondition(
        'yarg',
        'drum-red',
        frame({ ...hit, previousFrame: { drumNotes: [] } }),
      ),
    ).toBe(true)
    expect(
      evaluateEventCondition('yarg', 'guitar-red', {
        ...frame({ guitarNotes: [InstrumentNoteType.Red] }),
        previousFrame: { guitarNotes: [InstrumentNoteType.Red] },
      } as CueData),
    ).toBe(false)
  })

  it('treats an absent previousFrame as an empty baseline', () => {
    // The first frame of a cue has no baseline, so a note present on it counts as arriving.
    expect(
      evaluateEventCondition('yarg', 'drum-red', frame({ drumNotes: [DrumNoteType.RedDrum] })),
    ).toBe(true)
  })

  it('returns false for the entry-only and unknown conditions', () => {
    // cue-started / cue-called depend on session state, not cueData, so the gate never claims them.
    expect(evaluateEventCondition('yarg', 'cue-started', frame())).toBe(false)
    expect(evaluateEventCondition('yarg', 'cue-called', frame())).toBe(false)
    expect(evaluateEventCondition('yarg', 'none', frame())).toBe(false)
    expect(evaluateEventCondition('yarg', 'not-a-condition', frame())).toBe(false)
  })
})
