import {
  CueGroupCatalog,
  type LightingCueGroupCatalog,
} from '../../cues/registries/CueGroupCatalog'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { beforeEach, describe, it, expect } from '@jest/globals'

class MockCue implements INetCue {
  constructor(
    private _name: string,
    public style: CueStyle = CueStyle.Primary,
  ) {}
  get cueId(): string {
    return this._name
  }
  get id(): string {
    return this._name
  }
  description = 'Mock cue'
  async execute(
    _data: CueData,
    _controller: ILightingController,
    _lightManager: DmxLightManager,
  ): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

const group = (id: string, cueTypes: CueType[]): ICueGroup => ({
  id,
  name: id,
  cues: new Map(cueTypes.map((t) => [t, new MockCue(`${id}-${t}`)])),
})

const motionOnly = (id: string): ICueGroup => ({
  id,
  name: id,
  cues: new Map(),
  motionCues: new Map([['m1', new MockCue(`${id}-m1`)]]),
})

describe('CueGroupCatalog', () => {
  let catalog: LightingCueGroupCatalog

  beforeEach(() => {
    catalog = new CueGroupCatalog<CueType, INetCue, ICueGroup>()
  })

  it('registers a group enabled and active by default', () => {
    catalog.register(group('a', [CueType.Chorus]))
    expect(catalog.getAllGroups()).toEqual(['a'])
    expect(catalog.getEnabledGroups()).toEqual(['a'])
    expect(catalog.getActiveGroups()).toEqual(['a'])
  })

  it('keeps a disabled group disabled when a reload unregisters and registers it again', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.disableGroup('b')

    catalog.unregister('a')
    catalog.unregister('b')
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))

    expect(catalog.getEnabledGroups()).toEqual(['a'])
    expect(catalog.getActiveGroups()).toEqual(['a'])
  })

  it('keeps an enabled but inactive group inactive across a re-register', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.setActiveGroups(['a'])

    catalog.unregister('b')
    catalog.register(group('b', [CueType.Chorus]))

    expect(catalog.getEnabledGroups().sort()).toEqual(['a', 'b'])
    expect(catalog.getActiveGroups()).toEqual(['a'])
  })

  it('does not re-enable a disabled group registered again without an unregister', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.disableGroup('a')

    catalog.register(group('a', [CueType.Chorus, CueType.Verse]))

    expect(catalog.getEnabledGroups()).toEqual([])
  })

  it('forgets remembered membership once preferences are cleared', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.disableGroup('a')
    catalog.unregister('a')

    catalog.clearPreferences()
    catalog.register(group('a', [CueType.Chorus]))

    expect(catalog.getEnabledGroups()).toEqual(['a'])
  })

  it('unregister drops the group and any default or stage kit designation', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.setDefaultGroup('a')
    catalog.setDefaultMotionGroup('a')
    catalog.setStageKitGroup('a')

    expect(catalog.unregister('a')).toBe(true)
    expect(catalog.getAllGroups()).toEqual([])
    expect(catalog.getDefaultGroupId()).toBeNull()
    expect(catalog.getDefaultMotionGroupId()).toBeNull()
    expect(catalog.getStageKitGroupId()).toBeNull()
    expect(catalog.unregister('a')).toBe(false)
  })

  it('replace swaps the group in place and keeps its membership', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.register(group('c', [CueType.Chorus]))
    catalog.setActiveGroups(['a', 'c'])
    const rebuilt = group('a', [CueType.Chorus, CueType.Verse])

    expect(catalog.replace(rebuilt)).toBe(true)

    expect(catalog.getGroup('a')).toBe(rebuilt)
    expect(catalog.getAllGroups()).toEqual(['a', 'b', 'c'])
    expect(catalog.getEnabledGroups()).toEqual(['a', 'b', 'c'])
    expect(catalog.getActiveGroups()).toEqual(['a', 'c'])
    expect(catalog.replace(group('d', [CueType.Chorus]))).toBe(false)
  })

  it('replace drops the designations for the rebuilt file to apply again', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.setDefaultGroup('b')
    catalog.setStageKitGroup('b')

    catalog.replace(group('b', [CueType.Chorus]))

    expect(catalog.getDefaultGroupId()).toBe('a')
    expect(catalog.getStageKitGroupId()).toBeNull()
  })

  it('setDefaultGroup and setStageKitGroup reject unknown groups', () => {
    expect(() => catalog.setDefaultGroup('missing')).toThrow("group 'missing' not found")
    expect(() => catalog.setDefaultMotionGroup('missing')).toThrow("group 'missing' not found")
    expect(() => catalog.setStageKitGroup('missing')).toThrow("group 'missing' not found")
  })

  it('tracks the lighting and motion defaults independently', () => {
    catalog.register(group('lighting', [CueType.Chorus]))
    catalog.register(group('motion', [CueType.Verse]))

    catalog.setDefaultGroup('lighting')
    catalog.setDefaultMotionGroup('motion')

    expect(catalog.getDefaultGroupId()).toBe('lighting')
    expect(catalog.getDefaultMotionGroupId()).toBe('motion')

    catalog.unregister('motion')
    expect(catalog.getDefaultGroupId()).toBe('lighting')
    expect(catalog.getDefaultMotionGroupId()).toBeNull()
  })

  it('fills each fallback from the first group able to serve it', () => {
    catalog.register(motionOnly('m'))
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))

    expect(catalog.getDefaultGroupId()).toBe('a')
    expect(catalog.getDefaultMotionGroupId()).toBe('m')
  })

  it('never fills the lighting fallback from a motion-only group', () => {
    catalog.register(motionOnly('m'))

    expect(catalog.getDefaultGroupId()).toBeNull()
  })

  it('keeps a flagged fallback when a later group registers', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.setDefaultGroup('b')

    catalog.register(group('c', [CueType.Chorus]))

    expect(catalog.getDefaultGroupId()).toBe('b')
  })

  it('refills an emptied fallback from the first remaining group able to serve it', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(motionOnly('m'))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.setDefaultGroup('a')

    catalog.unregister('a')

    expect(catalog.getDefaultGroupId()).toBe('b')
  })

  it('routes a default claim by what the group holds', () => {
    catalog.register(group('lighting', [CueType.Chorus]))
    catalog.register(motionOnly('motion'))

    catalog.designateDefaults({ isDefault: true }, 'motion')

    expect(catalog.getDefaultMotionGroupId()).toBe('motion')
    expect(catalog.getDefaultGroupId()).toBe('lighting')
  })

  it('refuses to designate a group it does not hold', () => {
    expect(() => catalog.designateDefaults({ isDefault: true }, 'missing')).toThrow(
      "group 'missing' not found",
    )
  })

  it('clearPreferences drops both default designations', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.setDefaultGroup('a')
    catalog.setDefaultMotionGroup('a')

    catalog.clearPreferences()

    expect(catalog.getDefaultGroupId()).toBeNull()
    expect(catalog.getDefaultMotionGroupId()).toBeNull()
  })

  it('enable activates a newly enabled group but leaves a re-enabled one alone', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.disableGroup('a')
    expect(catalog.getActiveGroups()).toEqual([])

    expect(catalog.enableGroup('a')).toBe(true)
    expect(catalog.getActiveGroups()).toEqual(['a'])

    catalog.deactivateGroup('a')
    expect(catalog.enableGroup('a')).toBe(true)
    expect(catalog.getActiveGroups()).toEqual([])
  })

  it('only enabled groups can be activated', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.disableGroup('a')
    expect(catalog.activateGroup('a')).toBe(false)

    catalog.enableGroup('a')
    catalog.deactivateGroup('a')
    expect(catalog.activateGroup('a')).toBe(true)
    expect(catalog.isActive('a')).toBe(true)
  })

  it('setEnabledGroups prunes active groups without auto-activating new ones', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.setActiveGroups(['a', 'b'])

    catalog.setEnabledGroups(['a'])
    expect(catalog.getActiveGroups()).toEqual(['a'])

    catalog.setEnabledGroups(['a', 'b'])
    expect(catalog.getActiveGroups()).toEqual(['a'])
  })

  it('setActiveGroups reports whether the active set changed and skips disabled groups', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))

    expect(catalog.setActiveGroups(['a'])).toBe(true)
    expect(catalog.setActiveGroups(['a'])).toBe(false)

    catalog.disableGroup('b')
    expect(catalog.setActiveGroups(['a', 'b'])).toBe(false)
    expect(catalog.getActiveGroups()).toEqual(['a'])
  })

  it('cueFrom answers only for registered groups implementing an enabled cue', () => {
    catalog.register(group('a', [CueType.Chorus]))

    expect(catalog.cueFrom('a', CueType.Chorus)).not.toBeNull()
    expect(catalog.cueFrom('a', CueType.Verse)).toBeNull()
    expect(catalog.cueFrom('missing', CueType.Chorus)).toBeNull()

    catalog.setDisabledCues({ a: [CueType.Chorus] })
    expect(catalog.cueFrom('a', CueType.Chorus)).toBeNull()
    expect(catalog.isCueDisabled('a', CueType.Chorus)).toBe(true)
  })

  it('getActiveGroupsImplementing filters by activity, implementation and disabled cues', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.register(group('c', [CueType.Verse]))
    catalog.deactivateGroup('b')

    expect(catalog.getActiveGroupsImplementing(CueType.Chorus)).toEqual(['a'])

    catalog.setDisabledCues({ a: [CueType.Chorus] })
    expect(catalog.getActiveGroupsImplementing(CueType.Chorus)).toEqual([])
  })

  it('getCueAvailability reports active and registered implementers plus the default', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.register(group('b', [CueType.Chorus]))
    catalog.deactivateGroup('b')
    catalog.setDefaultGroup('b')

    expect(catalog.getCueAvailability(CueType.Chorus)).toEqual({
      activeGroupsWithCue: ['a'],
      allGroupsWithCue: ['a', 'b'],
      defaultHasCue: true,
    })
  })

  it('clearPreferences keeps registered groups but drops every preference', () => {
    catalog.register(group('a', [CueType.Chorus]))
    catalog.setDefaultGroup('a')
    catalog.setStageKitGroup('a')
    catalog.setDisabledCues({ a: [CueType.Chorus] })

    catalog.clearPreferences()

    expect(catalog.getAllGroups()).toEqual(['a'])
    expect(catalog.getEnabledGroups()).toEqual([])
    expect(catalog.getActiveGroups()).toEqual([])
    expect(catalog.getDefaultGroupId()).toBeNull()
    expect(catalog.getStageKitGroupId()).toBeNull()
    expect(catalog.isCueDisabled('a', CueType.Chorus)).toBe(false)
  })
})
