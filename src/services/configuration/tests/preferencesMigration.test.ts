import { DEFAULT_PREFERENCES } from '../configurationDefaults'
import {
  applyLegacySenderFlatToNested,
  migratePrefsV3ToV4,
  migratePrefsV4ToV5,
  migratePrefsV5ToV6,
  healStoredClockRate,
  healStoredSenderConfigs,
  repairCueDomains,
} from '../preferencesMigration'
import type { AppPreferences } from '../configurationDefaults'
import { validateSenderEnablePayload } from '../../../main/ipc/validation/senderValidation'
import {
  CUE_DOMAINS,
  createDefaultCueDomainPrefs,
  createDefaultCueDomains,
} from '../cueDomainTypes'

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

  it('does not throw on cueDomains that predate the rb3 domains', () => {
    const all = createDefaultCueDomains()
    const v4 = {
      ...DEFAULT_PREFERENCES,
      cueDomains: {
        yarg: all.yarg,
        audio: all.audio,
        yargMotion: all.yargMotion,
        audioMotion: all.audioMotion,
      },
    } as unknown
    const out = migratePrefsV4ToV5(v4, DEFAULT_PREFERENCES)
    for (const d of CUE_DOMAINS) {
      expect(out.cueDomains[d]).toBeDefined()
    }
  })
})

describe('migratePrefsV5ToV6', () => {
  const fourOldDomains = () => {
    const all = createDefaultCueDomains()
    return {
      yarg: all.yarg,
      audio: all.audio,
      yargMotion: all.yargMotion,
      audioMotion: all.audioMotion,
    }
  }

  it('seeds rb3 and rb3Motion for a v5 file that predates them, preserving everything else', () => {
    const all = createDefaultCueDomains()
    const v5 = {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 33,
      cueDomains: {
        ...fourOldDomains(),
        yarg: { ...all.yarg, enabledGroups: ['stagekit', 'custom'] },
      },
    } as unknown
    const out = migratePrefsV5ToV6(v5, DEFAULT_PREFERENCES)
    expect(out.cueDomains.rb3).toEqual(createDefaultCueDomainPrefs('rb3'))
    expect(out.cueDomains.rb3Motion).toEqual(createDefaultCueDomainPrefs('rb3Motion'))
    expect(out.cueDomains.yarg.enabledGroups).toEqual(['stagekit', 'custom'])
    expect(out.effectDebounce).toBe(33)
  })

  it('leaves an already-populated rb3 domain untouched', () => {
    const all = createDefaultCueDomains()
    const v5 = {
      ...DEFAULT_PREFERENCES,
      cueDomains: {
        ...all,
        rb3: { ...all.rb3, enabledGroups: ['stagekit'], disabledCues: { g: ['c'] } },
      },
    }
    const out = migratePrefsV5ToV6(v5, DEFAULT_PREFERENCES)
    expect(out.cueDomains.rb3.enabledGroups).toEqual(['stagekit'])
    expect(out.cueDomains.rb3.disabledCues).toEqual({ g: ['c'] })
  })

  it('falls back to default domains when cueDomains is missing', () => {
    const out = migratePrefsV5ToV6({ effectDebounce: 5 } as unknown, DEFAULT_PREFERENCES)
    for (const d of CUE_DOMAINS) {
      expect(out.cueDomains[d]).toBeDefined()
    }
    expect(out.cueDomains.rb3).toEqual(createDefaultCueDomainPrefs('rb3'))
  })

  it('is idempotent once already at v6', () => {
    const once = migratePrefsV5ToV6(DEFAULT_PREFERENCES, DEFAULT_PREFERENCES)
    const again = migratePrefsV5ToV6(once, DEFAULT_PREFERENCES)
    expect(again).toEqual(once)
  })
})

describe('healStoredSenderConfigs', () => {
  it('returns the same object when the stored sACN universe is one the protocol defines', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      sacnConfig: { universe: 4, useUnicast: false },
    } as AppPreferences
    expect(healStoredSenderConfigs(prefs)).toBe(prefs)
  })

  it('returns the same object when nothing stored a sACN block', () => {
    const prefs = { ...DEFAULT_PREFERENCES, sacnConfig: undefined } as AppPreferences
    expect(healStoredSenderConfigs(prefs)).toBe(prefs)
  })

  it('seeds missing Enttec Pro dmxSpeed to the default refresh rate', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      enttecProConfig: { port: 'COM3' },
    } as AppPreferences

    const out = healStoredSenderConfigs(prefs)

    expect(out).not.toBe(prefs)
    expect(out.enttecProConfig?.dmxSpeed).toBe(40)
    expect(out.enttecProConfig?.port).toBe('COM3')
  })

  it('keeps a stored OpenDMX rate below the network floor', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      openDmxConfig: { port: 'COM4', dmxSpeed: 5 },
    } as AppPreferences

    expect(healStoredSenderConfigs(prefs)).toBe(prefs)
  })

  it('brings a stored OpenDMX rate past the ceiling back to 44 Hz', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      openDmxConfig: { port: 'COM4', dmxSpeed: 500 },
    } as AppPreferences

    const out = healStoredSenderConfigs(prefs)

    expect(out.openDmxConfig).toEqual({ port: 'COM4', dmxSpeed: 44 })
  })

  it('seeds a missing OpenDMX rate to the default', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      openDmxConfig: { port: 'COM4' },
    } as AppPreferences

    expect(healStoredSenderConfigs(prefs).openDmxConfig?.dmxSpeed).toBe(40)
  })

  it('brings a stored universe below the range up to the lowest sACN defines', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 9,
      sacnConfig: { universe: 0, useUnicast: true, unicastDestination: '10.0.0.4' },
    } as AppPreferences

    const out = healStoredSenderConfigs(prefs)

    expect(out).not.toBe(prefs)
    expect(out.sacnConfig?.universe).toBe(1)
    expect(out.sacnConfig?.useUnicast).toBe(true)
    expect(out.sacnConfig?.unicastDestination).toBe('10.0.0.4')
    expect(out.effectDebounce).toBe(9)
  })
})

describe('a healed sACN universe starts a sender', () => {
  it('heals a stored zero into a universe the enable payload accepts', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      sacnConfig: { universe: 0, useUnicast: false },
    } as AppPreferences

    const healed = healStoredSenderConfigs(prefs)
    const check = validateSenderEnablePayload({ sender: 'sacn', ...healed.sacnConfig })

    expect(check.ok).toBe(true)
  })
})

describe('healStoredClockRate', () => {
  it('returns the same object when the stored rate is one the clock accepts', () => {
    const prefs = { ...DEFAULT_PREFERENCES, clockRate: 10 } as AppPreferences
    expect(healStoredClockRate(prefs)).toBe(prefs)
  })

  it('brings a rate above the window down to the slowest the clock accepts', () => {
    const prefs = { ...DEFAULT_PREFERENCES, clockRate: 100, effectDebounce: 4 } as AppPreferences

    const out = healStoredClockRate(prefs)

    expect(out).not.toBe(prefs)
    expect(out.clockRate).toBe(50)
    expect(out.effectDebounce).toBe(4)
  })
})

describe('repairCueDomains', () => {
  it('returns the same object when every cue domain is complete', () => {
    const prefs = { ...DEFAULT_PREFERENCES, cueDomains: createDefaultCueDomains() }
    expect(repairCueDomains(prefs)).toBe(prefs)
  })

  it('seeds only the missing domains and preserves the rest', () => {
    const all = createDefaultCueDomains()
    const prefs = {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 9,
      cueDomains: {
        yarg: { ...all.yarg, enabledGroups: ['stagekit', 'mine'] },
        audio: all.audio,
        yargMotion: all.yargMotion,
        audioMotion: all.audioMotion,
      },
    } as unknown as AppPreferences
    const out = repairCueDomains(prefs)
    expect(out).not.toBe(prefs)
    expect(out.effectDebounce).toBe(9)
    expect(out.cueDomains.yarg.enabledGroups).toEqual(['stagekit', 'mine'])
    expect(out.cueDomains.rb3).toEqual(createDefaultCueDomainPrefs('rb3'))
    expect(out.cueDomains.rb3Motion).toEqual(createDefaultCueDomainPrefs('rb3Motion'))
  })

  it('completes a domain that is present but short of a required key', () => {
    const all = createDefaultCueDomains()
    const prefs = {
      ...DEFAULT_PREFERENCES,
      clockRate: 42,
      cueDomains: {
        ...all,
        rb3Motion: { enabledGroups: ['mine'], selectionMode: 'none' },
      },
    } as unknown as AppPreferences

    const out = repairCueDomains(prefs)

    expect(out.clockRate).toBe(42)
    expect(out.cueDomains.rb3Motion.enabledGroups).toEqual(['mine'])
    expect(out.cueDomains.rb3Motion.selectionMode).toBe('none')
    expect(out.cueDomains.rb3Motion.knownGroups).toEqual([])
    expect(out.cueDomains.rb3Motion.disabledCues).toEqual({})
  })

  it('replaces a required key stored in the wrong shape', () => {
    const all = createDefaultCueDomains()
    const prefs = {
      ...DEFAULT_PREFERENCES,
      cueDomains: {
        ...all,
        audio: { ...all.audio, enabledGroups: 'not-an-array', disabledCues: 7 },
      },
    } as unknown as AppPreferences

    const out = repairCueDomains(prefs)

    expect(out.cueDomains.audio.enabledGroups).toEqual([])
    expect(out.cueDomains.audio.disabledCues).toEqual({})
  })

  it('gives each repaired domain its own disabledCues', () => {
    const all = createDefaultCueDomains()
    const prefs = {
      ...DEFAULT_PREFERENCES,
      cueDomains: { ...all, rb3: {} },
    } as unknown as AppPreferences

    const out = repairCueDomains(prefs)
    out.cueDomains.rb3.disabledCues['group'] = ['cue']

    expect(createDefaultCueDomainPrefs('rb3').disabledCues).toEqual({})
  })

  it('leaves a malformed cueDomains untouched for validation to reject', () => {
    const prefs = { ...DEFAULT_PREFERENCES, cueDomains: null } as unknown as AppPreferences
    expect(repairCueDomains(prefs)).toBe(prefs)
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
