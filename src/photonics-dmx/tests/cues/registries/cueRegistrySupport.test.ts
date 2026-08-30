import { describe, it, expect } from '@jest/globals'
import { DisabledCueStore, releaseSequencersFor } from '../../../cues/registries/cueRegistrySupport'

describe('DisabledCueStore', () => {
  it('sets and queries disabled cues by group', () => {
    const store = new DisabledCueStore()
    store.setAll({ g1: ['a', 'b'], g2: ['c'] })
    expect(store.isDisabled('g1', 'a')).toBe(true)
    expect(store.isDisabled('g1', 'z')).toBe(false)
    expect(store.isDisabled('g2', 'c')).toBe(true)
    expect(store.isDisabled('missing', 'a')).toBe(false)
  })

  it('setAll replaces the previous map', () => {
    const store = new DisabledCueStore()
    store.setAll({ g1: ['a'] })
    store.setAll({ g2: ['b'] })
    expect(store.isDisabled('g1', 'a')).toBe(false)
    expect(store.isDisabled('g2', 'b')).toBe(true)
  })

  it('clear removes everything', () => {
    const store = new DisabledCueStore()
    store.setAll({ g1: ['a'] })
    store.clear()
    expect(store.isDisabled('g1', 'a')).toBe(false)
  })
})

describe('releaseSequencersFor', () => {
  it('releases the sequencer from every cue and motion cue across groups', () => {
    const calls: string[] = []
    const mkCue = (id: string): { releaseSequencer: () => void } => ({
      releaseSequencer: () => calls.push(id),
    })
    const groups = [
      { cues: new Map([['c1', mkCue('c1')]]), motionCues: new Map([['m1', mkCue('m1')]]) },
      { cues: new Map([['c2', mkCue('c2')]]) },
    ]
    releaseSequencersFor(groups, {} as never)
    expect(calls.sort()).toEqual(['c1', 'c2', 'm1'])
  })

  it('tolerates cues that have no releaseSequencer', () => {
    const groups = [{ cues: new Map([['c1', {}]]) }]
    expect(() => releaseSequencersFor(groups, {} as never)).not.toThrow()
  })
})
