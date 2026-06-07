import { DEFAULT_PREFERENCES } from '../configurationDefaults'
import {
  applyLegacySenderFlatToNested,
  migratePrefsV3ToV4,
  migratePrefsV4ToV5,
} from '../preferencesMigration'
import { createDefaultCueDomains } from '../cueDomainTypes'

describe('migratePrefsV3ToV4', () => {
  it('maps flat v3 keys into cueDomains and drops legacy top-level fields', () => {
    const flat = {
      effectDebounce: 10,
      enabledCueGroups: ['a', 'b'],
      knownYargCueGroups: ['a', 'b'],
      enabledAudioCueGroups: ['c'],
      knownAudioCueGroups: ['c'],
      disabledYargCues: { a: ['x'] },
      disabledAudioCues: { c: ['t'] },
      enabledMotionCueGroups: ['m1'],
      knownMotionCueGroups: ['m1'],
      disabledMotionCues: { m1: ['q'] },
      enabledAudioMotionCueGroups: ['am1'],
      knownAudioMotionCueGroups: ['am1'],
      disabledAudioMotionCues: { am1: ['r'] },
      motionGroupSelectionMode: 'oncePerSong' as const,
      audioMotionGroupSelectionMode: 'none' as const,
      motionCueMinimumHoldMs: 3000,
      motionCueProbabilityPercent: 50,
      audioMotionCueProbabilityPercent: 60,
      activeYargMotionCueRef: { groupId: 'g1', cueId: 'c1' },
      activeAudioMotionCueRef: null,
      cueGroupSelectionMode: 'oncePerSong' as const,
    }
    const out = migratePrefsV3ToV4(flat, DEFAULT_PREFERENCES)
    expect(out.effectDebounce).toBe(10)
    expect('enabledCueGroups' in out).toBe(false)
    expect(out.cueDomains.yarg.enabledGroups).toEqual(['a', 'b'])
    expect(out.cueDomains.yarg.selectionMode).toBe('oncePerSong')
    expect(out.cueDomains.audio.enabledGroups).toEqual(['c'])
    expect(out.cueDomains.yargMotion.selectionMode).toBe('oncePerSong')
    expect(out.cueDomains.yargMotion.minimumHoldMs).toBe(3000)
    expect(out.cueDomains.audioMotion.minimumHoldMs).toBe(3000)
    expect(out.cueDomains.yargMotion.probabilityPercent).toBe(50)
    expect(out.cueDomains.audioMotion.probabilityPercent).toBe(60)
    expect(out.cueDomains.yargMotion.activeCueRef).toEqual({ groupId: 'g1', cueId: 'c1' })
    expect(out.cueDomains.audioMotion.activeCueRef).toBeNull()
  })

  it('moves enttecProPort into enttecProConfig and omits the flat key', () => {
    const flat = {
      enttecProPort: 'COM3',
    }
    const out = migratePrefsV3ToV4(flat, DEFAULT_PREFERENCES)
    expect('enttecProPort' in out).toBe(false)
    expect(out.enttecProConfig).toBeDefined()
    expect(out.enttecProConfig!.port).toBe('COM3')
  })

  it('moves openDmxPort and openDmxSpeed into openDmxConfig and omits flat keys', () => {
    const flat = {
      openDmxPort: '/dev/cu.usb',
      openDmxSpeed: 30,
    }
    const out = migratePrefsV3ToV4(flat, DEFAULT_PREFERENCES)
    expect('openDmxPort' in out).toBe(false)
    expect('openDmxSpeed' in out).toBe(false)
    expect(out.openDmxConfig).toBeDefined()
    expect(out.openDmxConfig!.port).toBe('/dev/cu.usb')
    expect(out.openDmxConfig!.dmxSpeed).toBe(30)
  })

  it('is idempotent when the input is already a merged v4 object', () => {
    const flatV3 = {
      effectDebounce: 1,
      enabledCueGroups: ['a'],
    }
    const once = migratePrefsV3ToV4(flatV3, DEFAULT_PREFERENCES)
    const again = migratePrefsV3ToV4(once, DEFAULT_PREFERENCES)
    expect(again).toEqual(once)
  })
})

describe('migratePrefsV4ToV5', () => {
  it('applies the new defaults to the four changed settings', () => {
    const v4 = {
      ...DEFAULT_PREFERENCES,
      cueConsistencyWindow: 60000,
      stageKitPrefs: { yargPriority: 'prefer-for-tracked' as const },
      cueDomains: {
        ...createDefaultCueDomains(),
        yargMotion: { ...createDefaultCueDomains().yargMotion, probabilityPercent: 100 },
        audioMotion: { ...createDefaultCueDomains().audioMotion, probabilityPercent: 100 },
      },
    }
    const out = migratePrefsV4ToV5(v4, DEFAULT_PREFERENCES)
    expect(out.cueConsistencyWindow).toBe(10000)
    expect(out.stageKitPrefs!.yargPriority).toBe('random')
    expect(out.cueDomains.yargMotion.probabilityPercent).toBe(50)
    expect(out.cueDomains.audioMotion.probabilityPercent).toBe(50)
  })

  it('overwrites previously customized values for the changed settings', () => {
    const v4 = {
      ...DEFAULT_PREFERENCES,
      cueConsistencyWindow: 25000,
      stageKitPrefs: { yargPriority: 'never' as const },
      cueDomains: {
        ...createDefaultCueDomains(),
        yargMotion: { ...createDefaultCueDomains().yargMotion, probabilityPercent: 80 },
        audioMotion: { ...createDefaultCueDomains().audioMotion, probabilityPercent: 30 },
      },
    }
    const out = migratePrefsV4ToV5(v4, DEFAULT_PREFERENCES)
    expect(out.cueConsistencyWindow).toBe(10000)
    expect(out.stageKitPrefs!.yargPriority).toBe('random')
    expect(out.cueDomains.yargMotion.probabilityPercent).toBe(50)
    expect(out.cueDomains.audioMotion.probabilityPercent).toBe(50)
  })

  it('preserves unrelated preferences and selection modes', () => {
    const v4 = {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 42,
      cueDomains: {
        ...createDefaultCueDomains(),
        yarg: {
          ...createDefaultCueDomains().yarg,
          enabledGroups: ['stagekit', 'custom'],
          selectionMode: 'oncePerSong' as const,
        },
        yargMotion: {
          ...createDefaultCueDomains().yargMotion,
          selectionMode: 'none' as const,
          minimumHoldMs: 8000,
        },
      },
    }
    const out = migratePrefsV4ToV5(v4, DEFAULT_PREFERENCES)
    expect(out.effectDebounce).toBe(42)
    expect(out.cueDomains.yarg.enabledGroups).toEqual(['stagekit', 'custom'])
    expect(out.cueDomains.yarg.selectionMode).toBe('oncePerSong')
    expect(out.cueDomains.yargMotion.selectionMode).toBe('none')
    expect(out.cueDomains.yargMotion.minimumHoldMs).toBe(8000)
  })

  it('falls back to defaults when cueDomains or stageKitPrefs are missing', () => {
    const partial = { effectDebounce: 7 } as unknown
    const out = migratePrefsV4ToV5(partial, DEFAULT_PREFERENCES)
    expect(out.cueConsistencyWindow).toBe(10000)
    expect(out.stageKitPrefs!.yargPriority).toBe('random')
    expect(out.cueDomains.yargMotion.probabilityPercent).toBe(50)
    expect(out.cueDomains.audioMotion.probabilityPercent).toBe(50)
  })

  it('is idempotent once already at v5 defaults', () => {
    const once = migratePrefsV4ToV5(DEFAULT_PREFERENCES, DEFAULT_PREFERENCES)
    const again = migratePrefsV4ToV5(once, DEFAULT_PREFERENCES)
    expect(again).toEqual(once)
  })
})

describe('applyLegacySenderFlatToNested', () => {
  it('applies straggler flat fields onto existing nested defaults from merge', () => {
    const src: Record<string, unknown> = {
      enttecProPort: 'COM1',
    }
    const out = applyLegacySenderFlatToNested(src, { ...DEFAULT_PREFERENCES })
    expect(out.enttecProConfig?.port).toBe('COM1')
    const src2: Record<string, unknown> = { openDmxPort: 'tty0', openDmxSpeed: 25 }
    const out2 = applyLegacySenderFlatToNested(src2, { ...DEFAULT_PREFERENCES })
    expect(out2.openDmxConfig?.port).toBe('tty0')
    expect(out2.openDmxConfig?.dmxSpeed).toBe(25)
  })
})
