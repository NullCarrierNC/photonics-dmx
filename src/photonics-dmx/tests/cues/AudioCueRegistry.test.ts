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

/** A group holding one lighting cue per named cue type. */
function group(id: string, cueTypes: string[]): Parameters<AudioCueRegistry['registerGroup']>[0] {
  return {
    id,
    name: id,
    description: '',
    // The cue is named for its group so lookups can say which group answered, while cueType stays
    // the map key the registry is asked for.
    cues: new Map(cueTypes.map((t) => [t, { ...makeLightingCue(`${id}-${t}`), cueType: t }])),
  }
}

describe('AudioCueRegistry', () => {
  let registry: AudioCueRegistry

  beforeEach(() => {
    registry = AudioCueRegistry.getInstance()
    registry.reset()
  })

  describe('groups', () => {
    it('enables each group as it is registered', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.registerGroup(group('b', ['Chorus']))

      expect(registry.getRegisteredGroups()).toEqual(['a', 'b'])
      expect(registry.getEnabledGroups()).toEqual(['a', 'b'])
    })

    it('serves fallbacks from the first group registered', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.registerGroup(group('b', ['Chorus']))

      expect(registry.getDefaultGroupId()).toBe('a')
      expect(registry.getDefaultMotionGroupId()).toBe('a')
    })

    it('drops the fallback designation with the group it pointed at', () => {
      registry.registerGroup(group('a', ['Chorus']))

      expect(registry.unregisterGroup('a')).toBe(true)
      expect(registry.getDefaultGroupId()).toBeNull()
      expect(registry.unregisterGroup('a')).toBe(false)
    })

    it('keeps only the groups asked for', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.registerGroup(group('b', ['Chorus']))

      registry.setEnabledGroups(['b', 'unknown'])

      expect(registry.getEnabledGroups()).toEqual(['b'])
    })

    it('leaves nothing enabled when asked for nothing', () => {
      registry.registerGroup(group('a', ['Chorus']))

      registry.setEnabledGroups([])

      expect(registry.getEnabledGroups()).toEqual([])
    })
  })

  describe('cue lookup', () => {
    it('takes the cue from an enabled group', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.registerGroup(group('b', ['Chorus']))
      registry.setEnabledGroups(['b'])

      expect(registry.getCueImplementation('Chorus')?.id).toBe('id:b-Chorus')
    })

    it('falls back to the fallback group when no enabled group carries the cue', () => {
      registry.registerGroup(group('a', ['Chorus', 'Verse']))
      registry.registerGroup(group('b', ['Chorus']))
      registry.setEnabledGroups(['b'])

      expect(registry.getCueImplementation('Verse')?.id).toBe('id:a-Verse')
    })

    it('still plays the fallback group with nothing enabled', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.setEnabledGroups([])

      expect(registry.getCueImplementation('Chorus')?.id).toBe('id:a-Chorus')
    })

    it('skips a cue the user turned off, in the fallback group too', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.setDisabledCues({ a: ['Chorus'] })

      expect(registry.getCueImplementation('Chorus')).toBeNull()
    })

    it('reads a cue straight out of a named group', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.registerGroup(group('b', ['Chorus']))
      registry.setEnabledGroups(['a'])

      expect(registry.getCueImplementationFromGroup('Chorus', 'b')?.id).toBe('id:b-Chorus')
      expect(registry.getCueImplementationFromGroup('Verse', 'b')).toBeNull()
    })
  })

  describe('available cue types', () => {
    it('reports what the enabled groups carry', () => {
      registry.registerGroup(group('a', ['Chorus', 'Verse']))
      registry.registerGroup(group('b', ['Stomp']))
      registry.setEnabledGroups(['b'])

      expect(registry.getAvailableCueTypes()).toEqual(['Stomp'])
      expect(registry.getAvailableCueTypes(true).sort()).toEqual(['Chorus', 'Stomp', 'Verse'])
    })

    it('reports what the fallback group carries when the enabled groups carry none', () => {
      registry.registerGroup(group('a', ['Chorus']))
      registry.setEnabledGroups([])

      expect(registry.getAvailableCueTypes()).toEqual(['Chorus'])
    })

    it('omits a cue the user turned off', () => {
      registry.registerGroup(group('a', ['Chorus', 'Verse']))
      registry.setDisabledCues({ a: ['Verse'] })

      expect(registry.getAvailableCueTypes()).toEqual(['Chorus'])
    })
  })

  describe('cue details', () => {
    it('re-reads a group that is registered again with different cues', () => {
      registry.registerGroup(group('a', ['Chorus']))
      expect(registry.getCueDetails('a').map((c) => c.id)).toEqual(['Chorus'])

      registry.registerGroup(group('a', ['Chorus', 'Verse']))

      expect(registry.getCueDetails('a').map((c) => c.id)).toEqual(['Chorus', 'Verse'])
    })

    it('answers with nothing for a group it does not hold', () => {
      expect(registry.getCueDetails('missing')).toEqual([])
    })
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
