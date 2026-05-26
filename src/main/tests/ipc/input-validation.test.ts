import { describe, expect, it } from '@jest/globals'
import {
  isPlainObject,
  validateCueGroupSelectionMode,
  validateCueRefPayload,
  validateCueType,
  validateDmxRigPayload,
  validateHost,
  validateLightingConfiguration,
  validateMotionSelectionMode,
  validateNumberInRange,
  validatePathUnderAllowedRoots,
  validatePreferencesPayload,
  validateRigOutputs,
  validateSenderEnablePayload,
  validateSenderId,
  validateStageKitPriority,
  validateStringUnion,
} from '../../ipc/inputValidation'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import {
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  DMX_OUTPUT_REFRESH_RATE_HZ_MIN,
} from '../../../shared/dmxOutputRefresh'

describe('inputValidation', () => {
  describe('isPlainObject', () => {
    it('returns true for plain object', () => {
      expect(isPlainObject({ a: 1 })).toBe(true)
    })

    it('returns true for nested plain object', () => {
      expect(isPlainObject({ a: { b: 2 } })).toBe(true)
    })

    it('returns false for null and arrays', () => {
      expect(isPlainObject(null)).toBe(false)
      expect(isPlainObject([1, 2, 3])).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isPlainObject(undefined)).toBe(false)
    })
  })

  describe('validateSenderId', () => {
    it('accepts known sender ids', () => {
      expect(validateSenderId('sacn').ok).toBe(true)
      expect(validateSenderId('artnet').ok).toBe(true)
      expect(validateSenderId('ipc').ok).toBe(true)
      expect(validateSenderId('enttecpro').ok).toBe(true)
      expect(validateSenderId('opendmx').ok).toBe(true)
    })

    it('rejects unknown sender ids', () => {
      const result = validateSenderId('bogus')
      expect(result.ok).toBe(false)
    })

    it('rejects empty string', () => {
      expect(validateSenderId('').ok).toBe(false)
    })
  })

  describe('validateRigOutputs', () => {
    it('accepts undefined (legacy / publish-to-all default)', () => {
      const result = validateRigOutputs(undefined)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeUndefined()
      }
    })

    it('accepts null as undefined (defensive — JSON round-trip)', () => {
      const result = validateRigOutputs(null)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeUndefined()
      }
    })

    it('accepts an empty array (explicit "publish nowhere on wire")', () => {
      const result = validateRigOutputs([])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual([])
      }
    })

    it('accepts a valid wire-sender array', () => {
      const result = validateRigOutputs(['sacn', 'opendmx'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(['sacn', 'opendmx'])
      }
    })

    it('deduplicates repeated entries', () => {
      const result = validateRigOutputs(['sacn', 'sacn', 'opendmx', 'sacn'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(['sacn', 'opendmx'])
      }
    })

    it('rejects "ipc" (IPC is not a routable wire sender)', () => {
      const result = validateRigOutputs(['ipc'])
      expect(result.ok).toBe(false)
    })

    it('rejects unknown sender ids', () => {
      const result = validateRigOutputs(['sacn', 'bogus'])
      expect(result.ok).toBe(false)
    })

    it('rejects non-array values', () => {
      expect(validateRigOutputs('sacn').ok).toBe(false)
      expect(validateRigOutputs({}).ok).toBe(false)
      expect(validateRigOutputs(42).ok).toBe(false)
    })

    it('rejects arrays containing non-string entries', () => {
      const result = validateRigOutputs(['sacn', 123])
      expect(result.ok).toBe(false)
    })
  })

  describe('validateDmxRigPayload outputs handling', () => {
    const baseRig = {
      id: 'r1',
      name: 'Rig 1',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows' },
        strobeType: 'None',
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }

    it('omits outputs when not supplied (legacy default preserved)', () => {
      const result = validateDmxRigPayload(baseRig)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect('outputs' in result.value).toBe(false)
      }
    })

    it('passes through a valid outputs whitelist', () => {
      const result = validateDmxRigPayload({ ...baseRig, outputs: ['sacn'] })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.outputs).toEqual(['sacn'])
      }
    })

    it('rejects a rig whose outputs contain an invalid sender id', () => {
      const result = validateDmxRigPayload({ ...baseRig, outputs: ['sacn', 'bogus'] })
      expect(result.ok).toBe(false)
    })

    it('rejects a rig whose outputs is not an array', () => {
      const result = validateDmxRigPayload({ ...baseRig, outputs: 'sacn' })
      expect(result.ok).toBe(false)
    })
  })

  describe('validateNumberInRange', () => {
    it('accepts numbers within range', () => {
      const result = validateNumberInRange(10, 1, 100, 'port')
      expect(result).toEqual({ ok: true, value: 10 })
    })

    it('accepts boundary min and max', () => {
      expect(validateNumberInRange(1, 1, 100, 'x')).toEqual({ ok: true, value: 1 })
      expect(validateNumberInRange(100, 1, 100, 'x')).toEqual({ ok: true, value: 100 })
    })

    it('rejects below min and above max', () => {
      expect(validateNumberInRange(0, 1, 100, 'x').ok).toBe(false)
      expect(validateNumberInRange(101, 1, 100, 'x').ok).toBe(false)
    })

    it('rejects NaN and Infinity', () => {
      expect(validateNumberInRange(NaN, 1, 100, 'x').ok).toBe(false)
      expect(validateNumberInRange(Infinity, 1, 100, 'x').ok).toBe(false)
    })

    it('coerces string numbers', () => {
      expect(validateNumberInRange('50', 1, 100, 'x')).toEqual({ ok: true, value: 50 })
    })
  })

  describe('validateHost', () => {
    it('accepts ipv4 and hostname', () => {
      expect(validateHost('127.0.0.1').ok).toBe(true)
      expect(validateHost('example.local').ok).toBe(true)
    })

    it('accepts IPv6', () => {
      expect(validateHost('::1').ok).toBe(true)
      expect(validateHost('2001:db8::1').ok).toBe(true)
    })

    it('rejects invalid host values', () => {
      expect(validateHost('').ok).toBe(false)
      expect(validateHost('bad host').ok).toBe(false)
    })

    it('rejects path injection attempts', () => {
      expect(validateHost('../../../etc/passwd').ok).toBe(false)
    })
  })

  describe('validateSenderEnablePayload', () => {
    it('accepts valid artnet payload', () => {
      const result = validateSenderEnablePayload({ sender: 'artnet', host: '127.0.0.1' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.sender).toBe('artnet')
        if (result.value.sender === 'artnet') {
          expect(result.value.maxOutputRate).toBe(40)
          expect(result.value.base_refresh_interval).toBe(25)
        }
      }
    })

    it('accepts artnet payload with high refreshRateHz and clamps to 44 Hz', () => {
      const result = validateSenderEnablePayload({
        sender: 'artnet',
        host: '127.0.0.1',
        refreshRateHz: 300,
      })
      expect(result.ok).toBe(true)
      if (result.ok && result.value.sender === 'artnet') {
        expect(result.value.maxOutputRate).toBe(44)
        expect(result.value.base_refresh_interval).toBe(23)
      }
    })

    it('accepts artnet legacy maxOutputRate and clamps Hz into 10–44', () => {
      const result = validateSenderEnablePayload({
        sender: 'artnet',
        host: '127.0.0.1',
        maxOutputRate: 300,
      })
      expect(result.ok).toBe(true)
      if (result.ok && result.value.sender === 'artnet') {
        expect(result.value.maxOutputRate).toBe(44)
      }
    })

    it('accepts valid sacn payload', () => {
      const result = validateSenderEnablePayload({ sender: 'sacn', universe: 1 })
      expect(result.ok).toBe(true)
      if (result.ok && result.value.sender === 'sacn') {
        expect(result.value.maxOutputRate).toBe(40)
        expect(result.value.minRefreshRate).toBe(40)
      }
    })

    it('accepts sacn legacy maxOutputRate and clamps Hz into 10–44', () => {
      const result = validateSenderEnablePayload({
        sender: 'sacn',
        universe: 1,
        maxOutputRate: 300,
      })
      expect(result.ok).toBe(true)
      if (result.ok && result.value.sender === 'sacn') {
        expect(result.value.maxOutputRate).toBe(44)
        expect(result.value.minRefreshRate).toBe(44)
      }
    })

    it('accepts valid ipc payload', () => {
      const result = validateSenderEnablePayload({ sender: 'ipc' })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('ipc')
    })

    it('accepts valid enttecpro payload with devicePath', () => {
      const result = validateSenderEnablePayload({
        sender: 'enttecpro',
        devicePath: '/dev/ttyUSB0',
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('enttecpro')
    })

    it('accepts valid opendmx payload', () => {
      const result = validateSenderEnablePayload({
        sender: 'opendmx',
        devicePath: 'COM3',
        dmxSpeed: 40,
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('opendmx')
    })

    it('rejects non-object payload', () => {
      const result = validateSenderEnablePayload('bad')
      expect(result.ok).toBe(false)
    })

    it('rejects payload with missing sender', () => {
      const result = validateSenderEnablePayload({ host: '127.0.0.1' })
      expect(result.ok).toBe(false)
    })

    it('rejects enttecpro without devicePath', () => {
      const result = validateSenderEnablePayload({ sender: 'enttecpro' })
      expect(result.ok).toBe(false)
    })
  })

  describe('validateLightingConfiguration', () => {
    const validPayload = {
      numLights: 4,
      lightLayout: { id: 'layout-1', label: 'Default' },
      strobeType: 'None',
      frontLights: [],
      backLights: [],
      strobeLights: [],
    }

    it('accepts valid payload', () => {
      const result = validateLightingConfiguration(validPayload)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.numLights).toBe(4)
        expect(result.value.lightLayout).toEqual({ id: 'layout-1', label: 'Default' })
        expect(result.value.strobeType).toBe('None')
      }
    })

    it('rejects non-object input', () => {
      expect(validateLightingConfiguration('bad').ok).toBe(false)
      expect(validateLightingConfiguration(null).ok).toBe(false)
      expect(validateLightingConfiguration([]).ok).toBe(false)
    })

    it('rejects invalid numLights', () => {
      expect(validateLightingConfiguration({ ...validPayload, numLights: -1 }).ok).toBe(false)
      expect(validateLightingConfiguration({ ...validPayload, numLights: NaN }).ok).toBe(false)
    })

    it('rejects invalid lightLayout', () => {
      expect(validateLightingConfiguration({ ...validPayload, lightLayout: { id: 'x' } }).ok).toBe(
        false,
      )
      expect(validateLightingConfiguration({ ...validPayload, lightLayout: 'not-object' }).ok).toBe(
        false,
      )
    })

    it('rejects invalid strobeType', () => {
      expect(validateLightingConfiguration({ ...validPayload, strobeType: 'Invalid' }).ok).toBe(
        false,
      )
    })

    it('rejects non-array frontLights, backLights, or strobeLights', () => {
      expect(validateLightingConfiguration({ ...validPayload, frontLights: {} }).ok).toBe(false)
      expect(validateLightingConfiguration({ ...validPayload, backLights: null }).ok).toBe(false)
      expect(validateLightingConfiguration({ ...validPayload, strobeLights: 'x' }).ok).toBe(false)
    })
  })

  describe('validateStringUnion', () => {
    const allowed = ['a', 'b', 'c'] as const

    it('accepts a member of the union', () => {
      const r = validateStringUnion('b', allowed, 'field')
      expect(r).toEqual({ ok: true, value: 'b' })
    })

    it('rejects values not in the union', () => {
      expect(validateStringUnion('z', allowed, 'field').ok).toBe(false)
    })

    it('rejects non-string inputs', () => {
      expect(validateStringUnion(1, allowed, 'field').ok).toBe(false)
      expect(validateStringUnion(undefined, allowed, 'field').ok).toBe(false)
    })
  })

  describe('validateMotionSelectionMode', () => {
    it('accepts every supported mode', () => {
      for (const mode of ['oncePerSong', 'perCueChange', 'none'] as const) {
        expect(validateMotionSelectionMode(mode).ok).toBe(true)
      }
    })

    it('rejects "withinSong" (cue-group mode, not motion mode)', () => {
      expect(validateMotionSelectionMode('withinSong').ok).toBe(false)
    })

    it('rejects non-string inputs', () => {
      expect(validateMotionSelectionMode(null).ok).toBe(false)
    })
  })

  describe('validateCueGroupSelectionMode', () => {
    it('accepts oncePerSong and withinSong only', () => {
      expect(validateCueGroupSelectionMode('oncePerSong').ok).toBe(true)
      expect(validateCueGroupSelectionMode('withinSong').ok).toBe(true)
    })

    it('rejects motion-only modes', () => {
      expect(validateCueGroupSelectionMode('perCueChange').ok).toBe(false)
      expect(validateCueGroupSelectionMode('none').ok).toBe(false)
    })
  })

  describe('validateStageKitPriority', () => {
    it('accepts every supported priority', () => {
      for (const priority of ['prefer-for-tracked', 'random', 'never'] as const) {
        expect(validateStageKitPriority(priority).ok).toBe(true)
      }
    })

    it('rejects unknown priority', () => {
      expect(validateStageKitPriority('always').ok).toBe(false)
      expect(validateStageKitPriority(0).ok).toBe(false)
    })
  })

  describe('validateCueType', () => {
    it('accepts a known CueType enum value', () => {
      const known = Object.values(CueType)[0] as string
      const r = validateCueType(known)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toBe(known)
    })

    it('rejects an unknown string', () => {
      expect(validateCueType('not-a-real-cue').ok).toBe(false)
    })

    it('rejects empty / non-string inputs', () => {
      expect(validateCueType('').ok).toBe(false)
      expect(validateCueType(null).ok).toBe(false)
      expect(validateCueType(7).ok).toBe(false)
    })
  })

  describe('validateCueRefPayload', () => {
    it('accepts null and undefined as the explicit "no active cue" value', () => {
      expect(validateCueRefPayload(null)).toEqual({ ok: true, value: null })
      expect(validateCueRefPayload(undefined)).toEqual({ ok: true, value: null })
    })

    it('accepts a well-formed { groupId, cueId } object and trims whitespace', () => {
      const r = validateCueRefPayload({ groupId: '  g1 ', cueId: ' c1 ' })
      expect(r).toEqual({ ok: true, value: { groupId: 'g1', cueId: 'c1' } })
    })

    it('rejects non-object payloads', () => {
      expect(validateCueRefPayload('bad').ok).toBe(false)
      expect(validateCueRefPayload(42).ok).toBe(false)
    })

    it('rejects payloads missing groupId or cueId', () => {
      expect(validateCueRefPayload({ groupId: '' }).ok).toBe(false)
      expect(validateCueRefPayload({ cueId: 'c1' }).ok).toBe(false)
      expect(validateCueRefPayload({ groupId: 'g1', cueId: '   ' }).ok).toBe(false)
    })
  })

  describe('validatePathUnderAllowedRoots', () => {
    const allowedRoots = ['/tmp/project', '/Users/tester']

    it('accepts paths under allowed roots', () => {
      const result = validatePathUnderAllowedRoots('/tmp/project/file.txt', allowedRoots)
      expect(result.ok).toBe(true)
    })

    it('rejects paths outside allowed roots', () => {
      const result = validatePathUnderAllowedRoots('/etc/passwd', allowedRoots)
      expect(result.ok).toBe(false)
    })

    it('rejects path with null bytes', () => {
      const result = validatePathUnderAllowedRoots('/tmp/project/file\x00.txt', allowedRoots)
      expect(result.ok).toBe(false)
    })

    it('rejects non-string path', () => {
      expect(validatePathUnderAllowedRoots(123, allowedRoots).ok).toBe(false)
    })

    it('rejects empty string path', () => {
      expect(validatePathUnderAllowedRoots('', allowedRoots).ok).toBe(false)
    })

    it('rejects path when allowed roots is empty', () => {
      const result = validatePathUnderAllowedRoots('/tmp/foo', [])
      expect(result.ok).toBe(false)
    })
  })

  describe('validatePreferencesPayload', () => {
    it('clamps sacnConfig.refreshRateHz into allowed range', () => {
      const r = validatePreferencesPayload({
        sacnConfig: { universe: 1, useUnicast: false, refreshRateHz: 300 },
      })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.sacnConfig?.refreshRateHz).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_MAX)
    })

    it('clamps artNetConfig.refreshRateHz into allowed range', () => {
      const r = validatePreferencesPayload({
        artNetConfig: {
          host: '',
          universe: 0,
          net: 0,
          subnet: 0,
          subuni: 0,
          port: 6454,
          refreshRateHz: 3,
        },
      })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.artNetConfig?.refreshRateHz).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_MIN)
    })

    it('preserves default-range sacnConfig.refreshRateHz', () => {
      const r = validatePreferencesPayload({
        sacnConfig: {
          universe: 1,
          useUnicast: false,
          refreshRateHz: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
        },
      })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.sacnConfig?.refreshRateHz).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT)
    })

    it('rejects non-number sacnConfig.refreshRateHz', () => {
      const payload: Record<string, unknown> = {
        sacnConfig: { refreshRateHz: 'fast' },
      }
      const r = validatePreferencesPayload(payload)
      expect(r.ok).toBe(false)
    })
  })
})
