import { DEFAULT_PREFERENCES } from '../configurationDefaults'
import { applyLegacySenderFlatToNested, migratePrefsV3ToV4 } from '../preferencesMigration'

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
