/**
 * MotionSelectionState: mode, per-song lock, disabled cues, enabled groups, default fallback.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  MotionCueGroupView,
  MotionSelectionState,
} from '../../../cues/registries/MotionSelectionState'

type TCue = { id: string }

function groupWithCues(
  entries: [string, TCue][],
): MotionCueGroupView<TCue> & { motionCues: Map<string, TCue> } {
  return { motionCues: new Map(entries) }
}

describe('MotionSelectionState', () => {
  let state: MotionSelectionState<TCue>
  const groups = new Map<string, MotionCueGroupView<TCue>>()

  beforeEach(() => {
    state = new MotionSelectionState()
    groups.clear()
    groups.set(
      'g1',
      groupWithCues([
        ['c1', { id: 'c1' }],
        ['c2', { id: 'c2' }],
      ]),
    )
    groups.set('g2', groupWithCues([['d1', { id: 'd1' }]]))
    groups.set('default', groupWithCues([['def1', { id: 'def1' }]]))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const getGroup = (id: string) => groups.get(id)

  it("returns null when mode is 'none'", () => {
    state.setMotionSelectionMode('none')
    state.setEnabledMotionGroups(['g1'], () => true)
    expect(state.getRandomMotionCue(getGroup, null)).toBeNull()
  })

  it('clears once-per-song lock when setMotionSelectionMode is perCueChange or none', () => {
    state.setMotionSelectionMode('oncePerSong')
    state.setEnabledMotionGroups(['g1'], () => true)
    state.onMotionSongStart()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    state.getRandomMotionCue(getGroup, null)
    state.setMotionSelectionMode('perCueChange')
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    const second = state.getRandomMotionCue(getGroup, null)
    expect(second?.id).toBe('c2')
  })

  it('oncePerSong: first pick after song start locks; further calls return same cue until song end', () => {
    state.setMotionSelectionMode('oncePerSong')
    state.setEnabledMotionGroups(['g1'], () => true)
    state.onMotionSongStart()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const first = state.getRandomMotionCue(getGroup, null)
    expect(first?.id).toBe('c1')
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    const locked = state.getRandomMotionCue(getGroup, null)
    expect(locked?.id).toBe('c1')
    state.onMotionSongEnd()
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    const afterEnd = state.getRandomMotionCue(getGroup, null)
    expect(afterEnd?.id).toBe('c2')
  })

  it('clears lock when the locked cue becomes disabled', () => {
    state.setMotionSelectionMode('oncePerSong')
    state.setEnabledMotionGroups(['g1'], () => true)
    state.onMotionSongStart()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    state.getRandomMotionCue(getGroup, null)
    state.setDisabledMotionCues({ g1: ['c1'] })
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const next = state.getRandomMotionCue(getGroup, null)
    expect(next?.id).toBe('c2')
  })

  it('clears lock when enabled groups no longer include the locked group', () => {
    state.setMotionSelectionMode('oncePerSong')
    state.setEnabledMotionGroups(['g1', 'g2'], () => true)
    state.onMotionSongStart()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    state.getRandomMotionCue(getGroup, null)
    state.setEnabledMotionGroups(['g2'], (id) => id === 'g1' || id === 'g2')
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const next = state.getRandomMotionCue(getGroup, null)
    expect(next?.id).toBe('d1')
  })

  it('falls back to default group when no enabled groups have motion cues', () => {
    state.setEnabledMotionGroups([], () => true)
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const picked = state.getRandomMotionCue(getGroup, 'default')
    expect(picked?.id).toBe('def1')
  })

  it('returns null when pool is empty and default cannot supply a cue', () => {
    state.setEnabledMotionGroups([], () => true)
    expect(state.getRandomMotionCue(getGroup, null)).toBeNull()
  })

  it('returns null when enabled groups have no motion maps and default is missing', () => {
    state.setEnabledMotionGroups(['g1'], () => true)
    groups.set('g1', { motionCues: new Map() })
    expect(state.getRandomMotionCue(getGroup, null)).toBeNull()
  })
})
