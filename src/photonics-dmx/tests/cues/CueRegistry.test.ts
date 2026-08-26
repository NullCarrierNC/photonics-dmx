import { CueRegistry, CueStateUpdate } from '../../cues/registries/CueRegistry'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { setLogSink } from '../../../shared/logger'
import { afterEach, beforeEach, describe, it, expect } from '@jest/globals'

// Mock implementations
class MockCueImplementation implements INetCue {
  private _id: string
  constructor(
    private _name: string,
    public style: CueStyle = CueStyle.Primary,
  ) {
    this._id = `mock-${this._name}-${Math.random().toString(36).substring(2, 11)}`
  }
  get cueId(): string {
    return this._name
  }
  get id(): string {
    return this._id
  }
  description = 'Mock cue for testing'
  async execute(
    _data: CueData,
    _controller: ILightingController,
    _lightManager: DmxLightManager,
  ): Promise<void> {
    // Mock implementation
  }

  onStop(): void {
    // Mock lifecycle method
  }

  onPause(): void {
    // Mock lifecycle method
  }
}

describe('CueRegistry', () => {
  let registry: CueRegistry
  let defaultGroup: ICueGroup
  let customGroup: ICueGroup

  beforeEach(() => {
    registry = CueRegistry.getInstance()
    registry.reset() // Clear any existing groups

    // Create default group
    defaultGroup = {
      id: 'default',
      name: 'default',
      cues: new Map([
        [CueType.Default, new MockCueImplementation('default')],
        [CueType.Chorus, new MockCueImplementation('default-chorus')],
      ]),
    }

    // Create custom group
    customGroup = {
      id: 'custom',
      name: 'custom',
      cues: new Map([
        [CueType.Chorus, new MockCueImplementation('custom-chorus')],
        [CueType.Verse, new MockCueImplementation('custom-verse')],
      ]),
    }

    // Explicitly register and set the default group
    registry.registerGroup(defaultGroup)
    registry.setDefaultGroup(defaultGroup.id)
  })

  describe('registerGroup', () => {
    it('should register a group', () => {
      expect(registry.getAllGroups()).toContain('default')
    })

    it('should set default group when registering group named "default"', () => {
      const implementation = registry.getCueImplementation(CueType.Default, 'tracked')
      expect(implementation).toBeDefined()
      expect((implementation as MockCueImplementation).cueId).toBe('default')
    })
  })

  describe('getCueImplementation', () => {
    beforeEach(() => {
      registry.registerGroup(customGroup)
    })

    it('should return implementation from active group if available', () => {
      registry.setActiveGroups(['custom'])
      const implementation = registry.getCueImplementation(CueType.Chorus)
      expect(implementation).toBeDefined()
      expect(implementation).toBeInstanceOf(MockCueImplementation)
    })

    it('should fall back to default group if cue not in active group', () => {
      registry.setActiveGroups(['custom'])
      const implementation = registry.getCueImplementation(CueType.Default)
      expect(implementation).toBeDefined()
      expect(implementation).toBeInstanceOf(MockCueImplementation)
      expect((implementation as MockCueImplementation).cueId).toBe('default')
    })

    it('should return null if no implementation found', () => {
      registry.setActiveGroups(['custom'])
      const implementation = registry.getCueImplementation(CueType.BigRockEnding)
      expect(implementation).toBeNull()
    })

    it('logs a repeatedly-missing cue only once (dedup for the 30 Hz RB3 slot)', () => {
      registry.setActiveGroups(['custom'])
      // Prime the dedup with a different missing cue so the target's first miss is guaranteed to log,
      // regardless of state left by earlier tests on the singleton.
      registry.getCueImplementation(CueType.Sweep)
      const errors: string[] = []
      setLogSink((e) => {
        if (e.level === 'error') errors.push(e.message)
      })
      try {
        registry.getCueImplementation(CueType.BigRockEnding)
        registry.getCueImplementation(CueType.BigRockEnding)
        registry.getCueImplementation(CueType.BigRockEnding)
      } finally {
        setLogSink(undefined)
      }
      expect(
        errors.filter((m) => m.includes('No implementation found for cue: BigRockEnding')),
      ).toHaveLength(1)
    })
  })

  describe('getCueImplementationFromGroup', () => {
    beforeEach(() => {
      registry.registerGroup(customGroup)
    })

    it('should return implementation from the requested group (deterministic)', () => {
      const impl = registry.getCueImplementationFromGroup(CueType.Chorus, 'custom')
      expect(impl).toBeDefined()
      expect((impl as MockCueImplementation).cueId).toBe('custom-chorus')
    })

    it('should return same implementation on repeated calls with same group', () => {
      const a = registry.getCueImplementationFromGroup(CueType.Chorus, 'custom')
      const b = registry.getCueImplementationFromGroup(CueType.Chorus, 'custom')
      expect(a).toBe(b)
      expect((a as MockCueImplementation).cueId).toBe('custom-chorus')
    })

    it('should return default group cue when requested group does not have the cue', () => {
      const impl = registry.getCueImplementationFromGroup(CueType.Default, 'custom')
      expect(impl).toBeDefined()
      expect((impl as MockCueImplementation).cueId).toBe('default')
    })

    it('should return null when neither requested group nor default has the cue', () => {
      const impl = registry.getCueImplementationFromGroup(CueType.BigRockEnding, 'custom')
      expect(impl).toBeNull()
    })

    it('should not use active groups (explicit group only)', () => {
      registry.setActiveGroups(['default'])
      const impl = registry.getCueImplementationFromGroup(CueType.Chorus, 'custom')
      expect(impl).toBeDefined()
      expect((impl as MockCueImplementation).cueId).toBe('custom-chorus')
    })
  })

  describe('setActiveGroups', () => {
    beforeEach(() => {
      registry.registerGroup(customGroup)
    })

    it('should set active groups', () => {
      registry.setActiveGroups(['custom'])
      expect(registry.getActiveGroups()).toEqual(['custom'])
    })

    it('should clear active groups when empty array provided', () => {
      registry.setActiveGroups(['custom'])
      registry.setActiveGroups([])
      expect(registry.getActiveGroups()).toHaveLength(0)
    })

    it('should ignore non-existent group names', () => {
      registry.setActiveGroups(['custom', 'non-existent'])
      expect(registry.getActiveGroups()).toEqual(['custom'])
    })
  })

  describe('applyGroupDesignations', () => {
    const motionOnlyGroup = (id: string): ICueGroup => ({
      id,
      name: id,
      cues: new Map(),
      motionCues: new Map([['m1', new MockCueImplementation(`${id}-m1`)]]),
    })

    // The registry is a singleton whose groups outlive reset(), so each case drops what it added.
    afterEach(() => {
      for (const id of ['motion-default', 'mixed', 'stagekit', 'no-strobes']) {
        registry.unregisterGroup(id)
      }
    })

    it('routes a motion-only group to the motion default and leaves the lighting default alone', () => {
      registry.reset()
      const motion = motionOnlyGroup('motion-default')
      registry.registerGroup(motion)

      registry.applyGroupDesignations({ isDefault: true }, motion)

      expect(registry.getDefaultMotionGroupId()).toBe('motion-default')
      expect(registry.getDefaultGroupId()).toBeNull()
    })

    it('routes a lighting group to the lighting default', () => {
      registry.reset()
      registry.registerGroup(customGroup)

      registry.applyGroupDesignations({ isDefault: true }, customGroup)

      expect(registry.getDefaultGroupId()).toBe('custom')
      expect(registry.getDefaultMotionGroupId()).toBeNull()
    })

    it('serves both defaults from a group holding lighting and motion cues', () => {
      registry.reset()
      const mixed: ICueGroup = {
        id: 'mixed',
        name: 'mixed',
        cues: new Map([[CueType.Chorus, new MockCueImplementation('mixed-chorus')]]),
        motionCues: new Map([['m1', new MockCueImplementation('mixed-m1')]]),
      }
      registry.registerGroup(mixed)

      registry.applyGroupDesignations({ isDefault: true, isStageKit: true }, mixed)

      expect(registry.getDefaultGroupId()).toBe('mixed')
      expect(registry.getDefaultMotionGroupId()).toBe('mixed')
      expect(registry.getStageKitGroupId()).toBe('mixed')
    })

    it('serves a strobe from the stage kit group when a motion group claims the default', () => {
      registry.reset()
      const stageKit: ICueGroup = {
        id: 'stagekit',
        name: 'stagekit',
        cues: new Map([[CueType.Strobe_Fast, new MockCueImplementation('stagekit-strobe-fast')]]),
      }
      const noStrobes: ICueGroup = {
        id: 'no-strobes',
        name: 'no-strobes',
        cues: new Map([[CueType.Chorus, new MockCueImplementation('no-strobes-chorus')]]),
      }
      const motion = motionOnlyGroup('motion-default')

      registry.registerGroup(stageKit)
      registry.registerGroup(noStrobes)
      registry.registerGroup(motion)
      registry.applyGroupDesignations({ isDefault: true, isStageKit: true }, stageKit)
      registry.applyGroupDesignations({ isDefault: true }, motion)
      registry.setEnabledGroups(['no-strobes'])
      registry.setActiveGroups(['no-strobes'])
      registry.setStageKitPriority('random')

      const strobe = registry.getCueImplementation(CueType.Strobe_Fast, 'tracked')

      expect(strobe).toBeTruthy()
      expect(strobe!.cueId).toBe('stagekit-strobe-fast')
    })
  })

  describe('reset', () => {
    it('should clear all groups and active groups', () => {
      registry.registerGroup(customGroup)
      registry.setActiveGroups(['custom'])
      registry.reset()
      expect(registry.getAllGroups()).toHaveLength(2) // default and custom groups remain registered
      expect(registry.getActiveGroups()).toHaveLength(0) // but active groups are cleared
    })
  })

  describe('Consistency Throttling', () => {
    it('should use consistent group selection within the consistency window', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])

      // Set consistency window to 2 seconds
      registry.setCueConsistencyWindow(2000)

      // First call should randomly select a group
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()
      const firstGroupId = firstCue!.id.includes('group1') ? 'group1' : 'group2'

      // Second call within window should use same group
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()
      const secondGroupId = secondCue!.id.includes('group1') ? 'group1' : 'group2'

      expect(secondGroupId).toBe(firstGroupId)
    })

    it('should allow new randomization after consistency window expires', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])

      // Set consistency window to 0ms for testing (immediate expiration)
      registry.setCueConsistencyWindow(0)

      // First call
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()

      // Second call should allow new randomization since window is 0ms
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()

      // Both calls should work without hanging
      expect(firstCue).toBeDefined()
      expect(secondCue).toBeDefined()
    })

    it('should preserve consistency when setActiveGroups is called twice with the same list', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])
      registry.setCueConsistencyWindow(2000)

      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()
      const firstGroupId = firstCue!.id.includes('group1') ? 'group1' : 'group2'

      // Re-apply same active list (e.g. UI refresh) – should not clear consistency
      registry.setActiveGroups(['group1', 'group2'])

      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()
      const secondGroupId = secondCue!.id.includes('group1') ? 'group1' : 'group2'
      expect(secondGroupId).toBe(firstGroupId)
    })

    it('should clear consistency when setActiveGroups is called with a different list', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])
      registry.setCueConsistencyWindow(2000)

      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()

      // Change active groups (e.g. DMX preview toggle)
      registry.setActiveGroups(['group2'])

      const status = registry.getConsistencyStatus()
      expect(status.trackedCues).toHaveLength(0)

      // Next getCueImplementation must use the new active set (only group2)
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()
      expect(secondCue!.id).toContain('group2')
    })

    it('should provide consistency status information', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.setEnabledGroups(['group1'])
      registry.setActiveGroups(['group1'])

      // Set consistency window
      registry.setCueConsistencyWindow(2000)

      // Call a cue
      const cue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(cue).toBeTruthy()

      // Get status
      const status = registry.getConsistencyStatus()
      expect(status.windowMs).toBe(2000)
      expect(status.trackedCues).toHaveLength(1)
      expect(status.trackedCues[0].cueType).toBe(CueType.Cool_Automatic)
      expect(status.trackedCues[0].isWithinWindow).toBe(true)
    })

    it('should properly handle fallback logic with consistency system', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups with fallback scenario
      const defaultGroup: ICueGroup = {
        id: 'default',
        name: 'default',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('default-cool-auto')]]),
      }

      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([
          [CueType.Chorus, new MockCueImplementation('custom-chorus')],
          // Note: custom group does NOT have Cool_Automatic
        ]),
      }

      registry.registerGroup(defaultGroup)
      registry.registerGroup(customGroup)
      registry.setDefaultGroup('default')
      registry.setEnabledGroups(['custom']) // Only custom is enabled
      registry.setActiveGroups(['custom']) // Only custom is active

      // Set consistency window
      registry.setCueConsistencyWindow(2000)

      // First call to Cool_Automatic should use default group as fallback
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()
      expect(firstCue!.id).toContain('default-cool-auto')

      // Second call within window should use same fallback group
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()
      expect(secondCue!.id).toContain('default-cool-auto')

      // Verify consistency tracking shows fallback
      const status = registry.getConsistencyStatus()
      expect(status.trackedCues).toHaveLength(1)
      expect(status.trackedCues[0].cueType).toBe(CueType.Cool_Automatic)
      expect(status.trackedCues[0].lastGroupId).toBe('default')
      expect(status.trackedCues[0].isWithinWindow).toBe(true)
    })

    it('should use default group as fallback even when default is active', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups where default is active but other active groups don't have the cue
      const defaultGroup: ICueGroup = {
        id: 'default',
        name: 'default',
        cues: new Map([[CueType.Strobe_Fast, new MockCueImplementation('default-strobe-fast')]]),
      }

      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([
          [CueType.Chorus, new MockCueImplementation('custom-chorus')],
          // Note: custom group does NOT have Strobe_Fast
        ]),
      }

      registry.registerGroup(defaultGroup)
      registry.registerGroup(customGroup)
      registry.setDefaultGroup('default')
      registry.setEnabledGroups(['custom', 'default']) // Both enabled
      registry.setActiveGroups(['custom', 'default']) // Both active

      // Call Strobe_Fast - should use default group as fallback since custom doesn't have it
      const strobeCue = registry.getCueImplementation(CueType.Strobe_Fast, 'tracked')
      expect(strobeCue).toBeTruthy()
      expect(strobeCue!.id).toContain('default-strobe-fast')

      // Verify this was treated as a fallback
      const status = registry.getConsistencyStatus()
      expect(status.trackedCues).toHaveLength(1)
      expect(status.trackedCues[0].cueType).toBe(CueType.Strobe_Fast)
      expect(status.trackedCues[0].lastGroupId).toBe('default')
    })

    it('should prefer stage kit group when autoGen is false and stageKitPriority is prefer-for-tracked', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      // Set up test groups including a stage kit group
      const stageKitGroup: ICueGroup = {
        id: 'stagekit',
        name: 'stagekit',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('stagekit-cool-auto')]]),
      }

      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('custom-cool-auto')]]),
      }

      registry.registerGroup(stageKitGroup)
      registry.registerGroup(customGroup)
      registry.setStageKitGroup('stagekit')
      registry.setStageKitPriority('prefer-for-tracked')
      registry.setEnabledGroups(['stagekit', 'custom'])
      registry.setActiveGroups(['stagekit', 'custom'])

      // When trackMode is 'autogen' (auto-generated lighting), should use random selection (existing behavior)
      const cueWithAutoGen = registry.getCueImplementation(CueType.Cool_Automatic, 'autogen')
      expect(cueWithAutoGen).toBeTruthy()
      // Could be either group since it's random
      expect(['stagekit-cool-auto', 'custom-cool-auto']).toContain(cueWithAutoGen!.cueId)

      // When trackMode is 'tracked' (tracked lighting data), should prefer stage kit group
      const cueWithoutAutoGen = registry.getCueImplementation(CueType.Cool_Automatic, 'tracked')
      expect(cueWithoutAutoGen).toBeTruthy()
      expect(cueWithoutAutoGen!.cueId).toBe('stagekit-cool-auto')
    })
  })

  describe('cue group selection mode (once per song)', () => {
    it('with oncePerSong mode, one group is selected for all cues in the song until onSongEnd', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')],
          [CueType.Verse, new MockCueImplementation('group1-verse')],
        ]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')],
          [CueType.Verse, new MockCueImplementation('group2-verse')],
        ]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])
      registry.setCueGroupSelectionMode('oncePerSong')
      registry.setCueConsistencyWindow(0)

      registry.onSongStart()

      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()
      const lockedGroupId = firstCue!.id.includes('group1') ? 'group1' : 'group2'

      for (let i = 0; i < 3; i++) {
        const cue = registry.getCueImplementation(CueType.Cool_Automatic)
        expect(cue).toBeTruthy()
        expect(cue!.id.includes(lockedGroupId)).toBe(true)
      }

      const verseCue = registry.getCueImplementation(CueType.Verse)
      expect(verseCue).toBeTruthy()
      expect(verseCue!.id.includes(lockedGroupId)).toBe(true)

      registry.onSongEnd()

      const afterEndCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(afterEndCue).toBeTruthy()
    })

    it('with oncePerSong mode, uses default group as fallback when locked group does not have the cue', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      const defaultGroup: ICueGroup = {
        id: 'default',
        name: 'default',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('default-cool-auto')],
          [CueType.Strobe_Fast, new MockCueImplementation('default-strobe-fast')],
        ]),
      }
      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('custom-cool-auto')]]),
      }
      registry.registerGroup(defaultGroup)
      registry.registerGroup(customGroup)
      registry.setDefaultGroup('default')
      registry.setEnabledGroups(['custom'])
      registry.setActiveGroups(['custom'])
      registry.setCueGroupSelectionMode('oncePerSong')
      registry.setCueConsistencyWindow(0)

      registry.onSongStart()

      const coolCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(coolCue).toBeTruthy()
      expect(coolCue!.id).toContain('custom-cool-auto')

      const strobeCue = registry.getCueImplementation(CueType.Strobe_Fast)
      expect(strobeCue).toBeTruthy()
      expect(strobeCue!.id).toContain('default-strobe-fast')
    })

    it('with withinSong mode, onSongStart and onSongEnd do not change time-window behaviour', () => {
      const registry = CueRegistry.getInstance()
      registry.reset()

      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')]]),
      }
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([[CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')]]),
      }
      registry.registerGroup(group1)
      registry.registerGroup(group2)
      registry.setEnabledGroups(['group1', 'group2'])
      registry.setActiveGroups(['group1', 'group2'])
      registry.setCueGroupSelectionMode('withinSong')
      registry.setCueConsistencyWindow(2000)

      registry.onSongStart()
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(firstCue).toBeTruthy()
      const firstGroupId = firstCue!.id.includes('group1') ? 'group1' : 'group2'

      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(secondCue).toBeTruthy()
      const secondGroupId = secondCue!.id.includes('group1') ? 'group1' : 'group2'
      expect(secondGroupId).toBe(firstGroupId)

      registry.onSongEnd()
      registry.setCueConsistencyWindow(0)
      const thirdCue = registry.getCueImplementation(CueType.Cool_Automatic)
      expect(thirdCue).toBeTruthy()
    })
  })

  describe('setEnabledGroups (enabled vs active separation)', () => {
    it('does not overwrite active groups when setting enabled groups', () => {
      registry.reset()
      const groupA: ICueGroup = {
        id: 'groupA',
        name: 'Group A',
        cues: new Map([[CueType.Default, new MockCueImplementation('a-default')]]),
      }
      const groupB: ICueGroup = {
        id: 'groupB',
        name: 'Group B',
        cues: new Map([[CueType.Default, new MockCueImplementation('b-default')]]),
      }
      registry.registerGroup(groupA)
      registry.registerGroup(groupB)
      registry.setActiveGroups(['groupA'])
      expect(registry.getActiveGroups()).toEqual(['groupA'])

      registry.setEnabledGroups(['groupA', 'groupB'])
      expect(registry.getEnabledGroups()).toEqual(expect.arrayContaining(['groupA', 'groupB']))
      expect(registry.getActiveGroups()).toEqual(['groupA'])
    })

    it('removes from active any group that is no longer enabled', () => {
      registry.reset()
      const groupA: ICueGroup = {
        id: 'groupA',
        name: 'Group A',
        cues: new Map([[CueType.Default, new MockCueImplementation('a-default')]]),
      }
      const groupB: ICueGroup = {
        id: 'groupB',
        name: 'Group B',
        cues: new Map([[CueType.Default, new MockCueImplementation('b-default')]]),
      }
      registry.registerGroup(groupA)
      registry.registerGroup(groupB)
      registry.setEnabledGroups(['groupA', 'groupB'])
      registry.setActiveGroups(['groupA', 'groupB'])
      expect(registry.getActiveGroups()).toHaveLength(2)

      registry.setEnabledGroups(['groupA'])
      expect(registry.getActiveGroups()).toEqual(['groupA'])
    })
  })

  describe('per-role selection tracking', () => {
    const cueGroup = (id: string, style: CueStyle): ICueGroup => ({
      id,
      name: id,
      cues: new Map([
        [CueType.Chorus, new MockCueImplementation(`${id}-chorus`, style)],
        [CueType.Verse, new MockCueImplementation(`${id}-verse`, style)],
      ]),
    })

    const updates = (reg: CueRegistry): CueStateUpdate[] => {
      const seen: CueStateUpdate[] = []
      reg.setCueStateUpdateCallback((state) => seen.push(state))
      return seen
    }

    it('counts consecutive calls per role and reports the role limit', () => {
      registry.reset()
      registry.registerGroup(cueGroup('primaries', CueStyle.Primary))
      registry.setActiveGroups(['primaries'])
      const seen = updates(registry)

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Chorus)

      expect(seen.map((u) => u.counter)).toEqual([1, 2, 3])
      expect(seen.every((u) => u.cueStyle === 'primary')).toBe(true)
      expect(seen[0].limit).toBe(100)
    })

    it('secondary cues count on their own limit', () => {
      registry.reset()
      registry.registerGroup(cueGroup('secondaries', CueStyle.Secondary))
      registry.setActiveGroups(['secondaries'])
      const seen = updates(registry)

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Chorus)

      expect(seen.map((u) => u.counter)).toEqual([1, 2])
      expect(seen.every((u) => u.cueStyle === 'secondary')).toBe(true)
      expect(seen[0].limit).toBe(50)
    })

    it('restarts the counter when the cue type changes', () => {
      registry.reset()
      registry.registerGroup(cueGroup('primaries', CueStyle.Primary))
      registry.setActiveGroups(['primaries'])
      const seen = updates(registry)

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Verse)

      expect(seen.map((u) => u.counter)).toEqual([1, 2, 1])
    })

    it('restarts the counter when the source group changes', () => {
      registry.reset()
      registry.registerGroup(cueGroup('groupA', CueStyle.Primary))
      registry.registerGroup(cueGroup('groupB', CueStyle.Primary))
      registry.setActiveGroups(['groupA', 'groupB'])
      const seen = updates(registry)

      registry.getCueImplementationFromGroup(CueType.Chorus, 'groupA')
      registry.getCueImplementationFromGroup(CueType.Chorus, 'groupA')
      registry.getCueImplementationFromGroup(CueType.Chorus, 'groupB')

      expect(seen.map((u) => [u.groupId, u.counter])).toEqual([
        ['groupA', 1],
        ['groupA', 2],
        ['groupB', 1],
      ])
    })

    it('counts the two roles on separate counters when both styles are in play', () => {
      registry.reset()
      const mixed: ICueGroup = {
        id: 'mixed',
        name: 'mixed',
        cues: new Map([
          [CueType.Chorus, new MockCueImplementation('mixed-chorus', CueStyle.Primary)],
          [CueType.Verse, new MockCueImplementation('mixed-verse', CueStyle.Secondary)],
        ]),
      }
      registry.registerGroup(mixed)
      registry.setActiveGroups(['mixed'])
      const seen = updates(registry)

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Verse)
      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Verse)

      expect(seen.map((u) => [u.cueStyle, u.counter])).toEqual([
        ['primary', 1],
        ['secondary', 1],
        ['primary', 2],
        ['secondary', 2],
      ])
    })

    it('records the last cue and group for both roles', () => {
      registry.reset()
      const primaries = cueGroup('primaries', CueStyle.Primary)
      const secondaries = cueGroup('secondaries', CueStyle.Secondary)
      primaries.cues.delete(CueType.Verse)
      secondaries.cues.delete(CueType.Chorus)
      registry.registerGroup(primaries)
      registry.registerGroup(secondaries)
      registry.setActiveGroups(['primaries', 'secondaries'])

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Verse)

      const info = registry.getDebugInfo()
      expect(info.lastPrimaryCue).toMatchObject({ name: CueType.Chorus, group: 'primaries' })
      expect(info.lastSecondaryCue).toMatchObject({ name: CueType.Verse, group: 'secondaries' })
    })

    it('reports the cue state of the last resolution', () => {
      registry.reset()
      registry.registerGroup(cueGroup('primaries', CueStyle.Primary))
      registry.setActiveGroups(['primaries'])
      const seen = updates(registry)

      registry.getCueImplementation(CueType.Chorus)
      registry.getCueImplementation(CueType.Chorus)

      expect(registry.getCueState(CueType.Chorus)).toEqual(seen[seen.length - 1])
      expect(registry.getCueState(CueType.Chorus)).toEqual({
        cueType: CueType.Chorus,
        groupId: 'primaries',
        isFallback: false,
        cueStyle: 'primary',
        counter: 2,
        limit: 100,
      })
      expect(registry.getCueState(CueType.Verse)).toBeNull()
    })

    it('direct group resolutions record state against the role', () => {
      registry.reset()
      registry.registerGroup(cueGroup('groupA', CueStyle.Secondary))
      registry.registerGroup(cueGroup('groupB', CueStyle.Secondary))
      registry.setActiveGroups(['groupA', 'groupB'])
      const seen = updates(registry)

      for (let i = 0; i < 60; i++) {
        registry.getCueImplementationFromGroup(CueType.Chorus, 'groupA')
      }

      expect(seen).toHaveLength(60)
      expect(seen.every((u) => u.groupId === 'groupA')).toBe(true)
      expect(seen[59].counter).toBe(60)
      expect(registry.getCueState(CueType.Chorus)).toMatchObject({ groupId: 'groupA', counter: 60 })
    })

    it('keeps the same group for 101 resolutions inside the consistency window', () => {
      registry.reset()
      registry.registerGroup(cueGroup('groupA', CueStyle.Primary))
      registry.registerGroup(cueGroup('groupB', CueStyle.Primary))
      registry.setActiveGroups(['groupA', 'groupB'])
      registry.setCueConsistencyWindow(2000)
      const seen = updates(registry)

      for (let i = 0; i < 101; i++) {
        registry.getCueImplementation(CueType.Chorus)
      }

      expect(seen.every((u) => u.groupId === seen[0].groupId)).toBe(true)
      expect(seen[100].counter).toBe(101)
    })

    it('holds the locked group across a long run while once-per-song is active', () => {
      registry.reset()
      registry.registerGroup(cueGroup('groupA', CueStyle.Secondary))
      registry.registerGroup(cueGroup('groupB', CueStyle.Secondary))
      registry.setActiveGroups(['groupA', 'groupB'])
      registry.setCueGroupSelectionMode('oncePerSong')
      registry.onSongStart()
      const seen = updates(registry)

      for (let i = 0; i < 51; i++) {
        registry.getCueImplementation(CueType.Chorus)
      }

      const lockedGroup = seen[0].groupId
      expect(seen.every((u) => u.groupId === lockedGroup)).toBe(true)
      expect(seen[50].counter).toBe(51)
    })

    it('holds the stage kit group across a long run under stage kit priority', () => {
      registry.reset()
      registry.registerGroup(cueGroup('kit', CueStyle.Secondary))
      registry.registerGroup(cueGroup('other', CueStyle.Secondary))
      registry.setActiveGroups(['kit', 'other'])
      registry.setStageKitGroup('kit')
      const seen = updates(registry)

      for (let i = 0; i < 51; i++) {
        registry.getCueImplementation(CueType.Chorus, 'tracked')
      }

      expect(seen.every((u) => u.groupId === 'kit')).toBe(true)
      expect(seen[50].counter).toBe(51)
    })

    it('clears both roles on reset', () => {
      registry.reset()
      registry.registerGroup(cueGroup('primaries', CueStyle.Primary))
      registry.setActiveGroups(['primaries'])
      registry.getCueImplementation(CueType.Chorus)

      registry.reset()

      const info = registry.getDebugInfo()
      expect(info.lastPrimaryCue).toMatchObject({ name: null, group: null, counter: 0 })
      expect(info.lastSecondaryCue).toMatchObject({ name: null, group: null, counter: 0 })
    })
  })
})
