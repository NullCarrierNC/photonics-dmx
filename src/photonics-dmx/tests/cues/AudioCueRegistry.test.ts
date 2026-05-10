import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'

function makeLightingCue(id: string): IAudioCue {
  return {
    id: `id:${id}`,
    cueType: id,
    name: id,
    description: 'lighting',
    style: 'primary',
    execute: jest.fn(async () => {}) as IAudioCue['execute'],
  }
}

function makeMotionCue(id: string): IAudioCue {
  return {
    id: `id:${id}`,
    cueType: id,
    name: id,
    description: 'motion',
    execute: jest.fn(async () => {}) as IAudioCue['execute'],
  }
}

describe('AudioCueRegistry', () => {
  let registry: AudioCueRegistry

  beforeEach(() => {
    registry = AudioCueRegistry.getInstance()
    registry.reset()
  })

  it('getGroupSummaries omits groups with no lighting cues (motion-only)', () => {
    registry.registerGroup({
      id: 'motion-only',
      name: 'Motion only',
      description: '',
      cues: new Map(),
      motionCues: new Map([['m1', makeMotionCue('m1')]]),
    })
    registry.registerGroup({
      id: 'with-lighting',
      name: 'With lighting',
      description: '',
      cues: new Map([['lit-1', makeLightingCue('lit-1')]]),
    })

    const summaries = registry.getGroupSummaries()

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.id).toBe('with-lighting')
  })
})
