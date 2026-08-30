import { describe, expect, it } from '@jest/globals'
import * as os from 'os'
import * as path from 'path'
import {
  isPlainObject,
  validateAudioConfigPayload,
  validateCueGroupSelectionMode,
  validateCueRefPayload,
  validateCueType,
  validateDmxFixturesArray,
  validateDmxRigPayload,
  validateHost,
  validateLightingConfiguration,
  validateMotionSelectionMode,
  validateNumberInRange,
  validatePathUnderAllowedRoots,
  validatePreferencesPayload,
  validateRigMirrorFlag,
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

  describe('validateRigMirrorFlag', () => {
    it('accepts undefined and null as undefined', () => {
      expect(validateRigMirrorFlag(undefined, 'mirrorHoriz')).toEqual({
        ok: true,
        value: undefined,
      })
      expect(validateRigMirrorFlag(null, 'mirrorHoriz')).toEqual({ ok: true, value: undefined })
    })

    it('accepts true and passes it through', () => {
      expect(validateRigMirrorFlag(true, 'mirrorVert')).toEqual({ ok: true, value: true })
    })

    it('normalizes false to undefined so the no-op default is never persisted', () => {
      expect(validateRigMirrorFlag(false, 'mirrorHoriz')).toEqual({ ok: true, value: undefined })
    })

    it('rejects non-boolean values with a field-tagged error', () => {
      expect(validateRigMirrorFlag('yes', 'mirrorHoriz').ok).toBe(false)
      expect(validateRigMirrorFlag(1, 'mirrorVert').ok).toBe(false)
      expect(validateRigMirrorFlag({}, 'mirrorHoriz').ok).toBe(false)
    })
  })

  describe('validateDmxRigPayload mirror handling', () => {
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

    it('omits mirror fields when not supplied', () => {
      const result = validateDmxRigPayload(baseRig)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect('mirrorHoriz' in result.value).toBe(false)
        expect('mirrorVert' in result.value).toBe(false)
      }
    })

    it('passes through mirrorHoriz: true', () => {
      const result = validateDmxRigPayload({ ...baseRig, mirrorHoriz: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.mirrorHoriz).toBe(true)
        expect('mirrorVert' in result.value).toBe(false)
      }
    })

    it('passes through both mirrorHoriz and mirrorVert when true', () => {
      const result = validateDmxRigPayload({ ...baseRig, mirrorHoriz: true, mirrorVert: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.mirrorHoriz).toBe(true)
        expect(result.value.mirrorVert).toBe(true)
      }
    })

    it('strips mirror flags when set to false so the on-disk shape stays minimal', () => {
      const result = validateDmxRigPayload({ ...baseRig, mirrorHoriz: false, mirrorVert: false })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect('mirrorHoriz' in result.value).toBe(false)
        expect('mirrorVert' in result.value).toBe(false)
      }
    })

    it('rejects non-boolean mirror values', () => {
      expect(validateDmxRigPayload({ ...baseRig, mirrorHoriz: 'yes' }).ok).toBe(false)
      expect(validateDmxRigPayload({ ...baseRig, mirrorVert: 1 }).ok).toBe(false)
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

    describe('channel bounds', () => {
      const lightWith = (channels: Record<string, number>) => ({
        id: 'l1',
        name: 'L1',
        label: 'L1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: 'RGB',
        group: 'front',
        position: 1,
        channels,
      })
      const configWith = (channels: Record<string, number>) => ({
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows' },
        strobeType: 'None',
        frontLights: [lightWith(channels)],
        backLights: [],
        strobeLights: [],
      })

      it('accepts integer channels in 0-512 (0 = unassigned template slot)', () => {
        const result = validateLightingConfiguration(
          configWith({ red: 1, green: 2, blue: 3, masterDimmer: 0 }),
        )
        expect(result.ok).toBe(true)
      })

      it.each([
        ['huge masterDimmer', { red: 1, green: 2, blue: 3, masterDimmer: 5e9 }],
        ['negative channel', { red: -1, green: 2, blue: 3, masterDimmer: 4 }],
        ['NaN channel', { red: NaN, green: 2, blue: 3, masterDimmer: 4 }],
        ['fractional channel', { red: 1.5, green: 2, blue: 3, masterDimmer: 4 }],
      ])('rejects %s', (_label, channels) => {
        const result = validateLightingConfiguration(configWith(channels))
        expect(result.ok).toBe(false)
      })

      it('rejects out-of-range template channels in validateDmxFixturesArray', () => {
        const result = validateDmxFixturesArray([
          lightWith({ red: 1, green: 700, blue: 3, masterDimmer: 4 }),
        ])
        expect(result.ok).toBe(false)
      })

      it.each([['rgbw'], ['rgbw/mh'], ['rgb/s']])(
        'rejects the retired fixture type %s (loaded data is migrated before it reaches here)',
        (fixtureType) => {
          const el = lightWith({ red: 1, green: 2, blue: 3, masterDimmer: 4 })
          el.fixture = fixtureType
          expect(validateDmxFixturesArray([el]).ok).toBe(false)
        },
      )
    })

    describe('extra channels', () => {
      const fixtureWith = (extraChannels: unknown): Record<string, unknown> => ({
        id: 'l1',
        name: 'L1',
        label: 'L1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: 'rgb',
        position: 1,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
        extraChannels,
      })

      it('accepts valid extra channels including duplicates, channel 0, and fixed 0/255', () => {
        const result = validateDmxFixturesArray([
          fixtureWith([
            { type: 'amber', channel: 5 },
            { type: 'red', channel: 6 },
            { type: 'red', channel: 7 },
            { type: 'white', channel: 0 },
            { type: 'fixed', channel: 8, value: 0 },
            { type: 'fixed', channel: 9, value: 255 },
          ]),
        ])
        expect(result.ok).toBe(true)
      })

      it('accepts a fixture with no extraChannels key', () => {
        const el: Record<string, unknown> = fixtureWith(undefined)
        delete el.extraChannels
        expect(validateDmxFixturesArray([el]).ok).toBe(true)
      })

      it('normalises null and [] extraChannels to a missing key', () => {
        for (const empty of [null, []]) {
          const el = fixtureWith(empty)
          const result = validateDmxFixturesArray([el])
          expect(result.ok).toBe(true)
          expect('extraChannels' in el).toBe(false)
        }
      })

      it.each([
        ['unknown type', [{ type: 'infrared', channel: 5 }]],
        ['channel 513', [{ type: 'amber', channel: 513 }]],
        ['negative channel', [{ type: 'amber', channel: -1 }]],
        ['fractional channel', [{ type: 'amber', channel: 1.5 }]],
        ['fixed without value', [{ type: 'fixed', channel: 5 }]],
        ['fixed value out of range', [{ type: 'fixed', channel: 5, value: 300 }]],
        ['value on a non-fixed row', [{ type: 'amber', channel: 5, value: 100 }]],
        ['null value on a non-fixed row', [{ type: 'amber', channel: 5, value: null }]],
        ['non-object entry', ['nope']],
      ])('rejects %s', (_label, extraChannels) => {
        expect(validateDmxFixturesArray([fixtureWith(extraChannels)]).ok).toBe(false)
      })

      it('validates extra channels on rig-snapshot lights via the layout path', () => {
        const rigLight = {
          id: 'l1',
          name: 'L1',
          label: 'L1',
          isStrobeEnabled: false,
          universe: 1,
          fixture: 'rgb',
          group: 'front',
          position: 1,
          fixtureId: 'tpl-1',
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
          extraChannels: [{ type: 'amber', channel: 5 }],
        }
        const config = {
          numLights: 1,
          lightLayout: { id: 'two-rows', label: 'Two Rows' },
          strobeType: 'None',
          frontLights: [rigLight],
          backLights: [],
          strobeLights: [],
        }
        expect(validateLightingConfiguration(config).ok).toBe(true)

        const badRigLight = { ...rigLight, extraChannels: [{ type: 'amber', channel: 999 }] }
        expect(validateLightingConfiguration({ ...config, frontLights: [badRigLight] }).ok).toBe(
          false,
        )
      })
    })

    describe('brightness scaling', () => {
      const fixtureWith = (fields: Record<string, unknown>): Record<string, unknown> => ({
        id: 'l1',
        name: 'L1',
        label: 'L1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: 'rgb',
        position: 1,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
        ...fields,
      })

      it('accepts integer percents 0–100 on base channels and colour extras', () => {
        const result = validateDmxFixturesArray([
          fixtureWith({
            brightnessScaling: { red: 0, green: 80, blue: 99 },
            extraChannels: [{ type: 'amber', channel: 5, scale: 55 }],
          }),
        ])
        expect(result.ok).toBe(true)
      })

      it('accepts a fixture with no scaling at all', () => {
        expect(validateDmxFixturesArray([fixtureWith({})]).ok).toBe(true)
      })

      it.each([
        ['percent above 100', { brightnessScaling: { red: 101 } }],
        ['negative percent', { brightnessScaling: { red: -1 } }],
        ['fractional percent', { brightnessScaling: { red: 99.5 } }],
        ['string percent', { brightnessScaling: { red: '80' } }],
        ['unknown colour key', { brightnessScaling: { white: 80 } }],
        ['non-object scaling', { brightnessScaling: 80 }],
        ['extra scale above 100', { extraChannels: [{ type: 'amber', channel: 5, scale: 101 }] }],
        ['extra scale fractional', { extraChannels: [{ type: 'amber', channel: 5, scale: 1.5 }] }],
        [
          'scale on a fixed row',
          { extraChannels: [{ type: 'fixed', channel: 5, value: 10, scale: 50 }] },
        ],
      ])('rejects %s', (_label, fields) => {
        expect(validateDmxFixturesArray([fixtureWith(fields)]).ok).toBe(false)
      })

      it('normalises 100% away so an unscaled fixture stays key-less', () => {
        const el = fixtureWith({
          brightnessScaling: { red: 100, green: 80 },
          extraChannels: [{ type: 'amber', channel: 5, scale: 100 }],
        })
        expect(validateDmxFixturesArray([el]).ok).toBe(true)
        expect(el.brightnessScaling).toEqual({ green: 80 })
        expect((el.extraChannels as Array<Record<string, unknown>>)[0]).toEqual({
          type: 'amber',
          channel: 5,
        })
      })

      it('drops an all-default scaling object and a null one entirely', () => {
        for (const scaling of [{ red: 100, green: 100 }, null]) {
          const el = fixtureWith({ brightnessScaling: scaling })
          expect(validateDmxFixturesArray([el]).ok).toBe(true)
          expect('brightnessScaling' in el).toBe(false)
        }
      })

      it('validates and normalises scaling on rig-snapshot lights via the layout path', () => {
        const rigLight = {
          id: 'l1',
          name: 'L1',
          label: 'L1',
          isStrobeEnabled: false,
          universe: 1,
          fixture: 'rgb',
          group: 'front',
          position: 1,
          fixtureId: 'tpl-1',
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
          brightnessScaling: { green: 80, blue: 100 },
        }
        const config = {
          numLights: 1,
          lightLayout: { id: 'two-rows', label: 'Two Rows' },
          strobeType: 'None',
          frontLights: [rigLight],
          backLights: [],
          strobeLights: [],
        }
        expect(validateLightingConfiguration(config).ok).toBe(true)
        expect(rigLight.brightnessScaling).toEqual({ green: 80 })

        const badRigLight = { ...rigLight, brightnessScaling: { green: 200 } }
        expect(validateLightingConfiguration({ ...config, frontLights: [badRigLight] }).ok).toBe(
          false,
        )
      })
    })

    describe('default roots', () => {
      // Outside a real Electron runtime the packaged check fails closed, so the defaults here are
      // homedir + tmpdir WITHOUT cwd — the same roots a packaged app gets. (A packaged app launched
      // from Finder has cwd '/', under which every path would pass.)
      it('rejects a system path with the default roots', () => {
        expect(validatePathUnderAllowedRoots('/etc/hosts').ok).toBe(false)
      })

      it('accepts a homedir path with the default roots', () => {
        const result = validatePathUnderAllowedRoots(path.join(os.homedir(), 'somefile.json'))
        expect(result.ok).toBe(true)
      })
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

    describe('shape validation for pass-through prefs (M-7)', () => {
      it('accepts a well-formed brightness object', () => {
        const r = validatePreferencesPayload({
          brightness: { low: 10, medium: 80, high: 180, max: 255 },
        })
        expect(r.ok).toBe(true)
      })

      it.each([
        ['out-of-range level', { low: 10, medium: 80, high: 300, max: 255 }],
        ['non-integer level', { low: 10.5, medium: 80, high: 180, max: 255 }],
        ['missing level', { low: 10, medium: 80, high: 180 }],
        ['negative level', { low: -1, medium: 80, high: 180, max: 255 }],
      ])('rejects a malformed brightness: %s', (_label, brightness) => {
        expect(validatePreferencesPayload({ brightness }).ok).toBe(false)
      })

      it('validates stageKitPrefs.yargPriority against the allowed set', () => {
        expect(validatePreferencesPayload({ stageKitPrefs: { yargPriority: 'random' } }).ok).toBe(
          true,
        )
        expect(validatePreferencesPayload({ stageKitPrefs: { yargPriority: 'bogus' } }).ok).toBe(
          false,
        )
      })

      it('validates rb3Prefs.processingMode against the allowed set', () => {
        expect(validatePreferencesPayload({ rb3Prefs: { processingMode: 'direct' } }).ok).toBe(true)
        expect(validatePreferencesPayload({ rb3Prefs: { processingMode: 'cue' } }).ok).toBe(true)
        expect(validatePreferencesPayload({ rb3Prefs: { processingMode: 'Cue' } }).ok).toBe(false)
        expect(validatePreferencesPayload({ rb3Prefs: {} }).ok).toBe(false)
        expect(validatePreferencesPayload({ rb3Prefs: 'cue' }).ok).toBe(false)
      })

      it('validates whiteChannelMixMode against the allowed set', () => {
        expect(validatePreferencesPayload({ whiteChannelMixMode: 'w-only' }).ok).toBe(true)
        expect(validatePreferencesPayload({ whiteChannelMixMode: 'strobe-rgbw' }).ok).toBe(true)
        expect(validatePreferencesPayload({ whiteChannelMixMode: 'always-rgbw' }).ok).toBe(true)
        expect(validatePreferencesPayload({ whiteChannelMixMode: 'rgbw' }).ok).toBe(false)
        expect(validatePreferencesPayload({ whiteChannelMixMode: 3 }).ok).toBe(false)
      })

      it('requires dmxSettingsPrefs expansion flags to be booleans', () => {
        expect(validatePreferencesPayload({ dmxSettingsPrefs: { artNetExpanded: true } }).ok).toBe(
          true,
        )
        expect(validatePreferencesPayload({ dmxSettingsPrefs: { artNetExpanded: 'yes' } }).ok).toBe(
          false,
        )
      })

      it('validates the simulationSettings shape', () => {
        const good = {
          registryType: 'YARG',
          groupId: 'default',
          effectId: null,
          venueSize: 'Small',
          bpm: 120,
          instrument: 'drums',
        }
        expect(validatePreferencesPayload({ simulationSettings: good }).ok).toBe(true)
        expect(
          validatePreferencesPayload({ simulationSettings: { ...good, registryType: 'X' } }).ok,
        ).toBe(false)
        expect(
          validatePreferencesPayload({ simulationSettings: { ...good, bpm: 'fast' } }).ok,
        ).toBe(false)
        expect(
          validatePreferencesPayload({ simulationSettings: { ...good, instrument: 'kazoo' } }).ok,
        ).toBe(false)
      })
    })

    // effectDebounce, complex and clockRate are required with a declared type by the prefs schema,
    // so a wrong type reaching disk sends the whole file to corrupt-recovery on the next load.
    describe('schema-required scalars', () => {
      it.each([
        ['effectDebounce', 'x'],
        ['complex', 'yes'],
        ['clockRate', 'slow'],
      ])('rejects a wrong-typed %s', (key, badValue) => {
        expect(validatePreferencesPayload({ [key]: badValue }).ok).toBe(false)
      })

      it.each([
        ['effectDebounce', 250],
        ['complex', true],
        ['clockRate', 10],
      ])('accepts a well-typed %s', (key, goodValue) => {
        const r = validatePreferencesPayload({ [key]: goodValue })
        expect(r.ok).toBe(true)
        expect((r as { value: Record<string, unknown> }).value[key]).toBe(goodValue)
      })

      it('keeps yargFallbackCueTimeMs in the payload and bounds it', () => {
        const r = validatePreferencesPayload({ yargFallbackCueTimeMs: 30000 })
        expect(r.ok && r.value.yargFallbackCueTimeMs).toBe(30000)
        expect(validatePreferencesPayload({ yargFallbackCueTimeMs: 600001 }).ok).toBe(false)
        expect(validatePreferencesPayload({ yargFallbackCueTimeMs: 'later' }).ok).toBe(false)
      })

      it('clamps clockRate into the window the Clock accepts', () => {
        const under = validatePreferencesPayload({ clockRate: 0 })
        expect(under.ok && under.value.clockRate).toBe(1)
        const over = validatePreferencesPayload({ clockRate: 9999 })
        expect(over.ok && over.value.clockRate).toBe(100)
      })
    })

    describe('window state', () => {
      it('clamps unusable extents rather than losing the whole save', () => {
        const r = validatePreferencesPayload({ windowState: { width: 0, height: -5 } })
        expect(r.ok && r.value.windowState).toEqual({ width: 1, height: 1 })
      })

      it('keeps negative coordinates, which are valid on a multi-monitor desktop', () => {
        const state = { width: 800, height: 600, x: -1920, y: 0 }
        const r = validatePreferencesPayload({ windowState: state })
        expect(r.ok && r.value.windowState).toEqual(state)
      })

      it.each(['windowState', 'cueEditorWindowState', 'audioPreviewWindowState'])(
        'rejects a non-finite extent on %s',
        (key) => {
          expect(validatePreferencesPayload({ [key]: { width: NaN, height: 600 } }).ok).toBe(false)
        },
      )
    })

    describe('booleans, adapter configs and audio', () => {
      it.each(['motionEnabled', 'allowMultipleActiveRigs', 'leftMenuCollapsed'])(
        'rejects a non-boolean %s',
        (key) => {
          expect(validatePreferencesPayload({ [key]: 'yes' }).ok).toBe(false)
          expect(validatePreferencesPayload({ [key]: true }).ok).toBe(true)
        },
      )

      it('validates the adapter config shapes', () => {
        expect(validatePreferencesPayload({ enttecProConfig: { port: 'COM3' } }).ok).toBe(true)
        expect(validatePreferencesPayload({ enttecProConfig: { port: 3 } }).ok).toBe(false)
        expect(
          validatePreferencesPayload({ openDmxConfig: { port: 'COM3', dmxSpeed: 40 } }).ok,
        ).toBe(true)
        expect(
          validatePreferencesPayload({ openDmxConfig: { port: 'COM3', dmxSpeed: 'fast' } }).ok,
        ).toBe(false)
        expect(validatePreferencesPayload({ dmxOutputConfig: { sacnEnabled: true } }).ok).toBe(true)
        expect(validatePreferencesPayload({ dmxOutputConfig: { sacnEnabled: 1 } }).ok).toBe(false)
      })

      it('rejects a malformed audioGameMode instead of storing it', () => {
        expect(validatePreferencesPayload({ audioGameMode: { enabled: 'yes' } }).ok).toBe(false)
        expect(validatePreferencesPayload({ audioGameMode: { cueDurationMin: -1 } }).ok).toBe(false)
        expect(validatePreferencesPayload({ audioGameMode: { enabled: true } }).ok).toBe(true)
      })

      it('accepts an unregistered activeAudioCueType but caps its length', () => {
        expect(validatePreferencesPayload({ activeAudioCueType: 'user:authored' }).ok).toBe(true)
        expect(validatePreferencesPayload({ activeAudioCueType: 42 }).ok).toBe(false)
        expect(validatePreferencesPayload({ activeAudioCueType: 'x'.repeat(201) }).ok).toBe(false)
      })

      it('rejects a malformed nested audioConfig update', () => {
        expect(
          validatePreferencesPayload({
            audioConfig: { sensitivity: 'loud' },
          }).ok,
        ).toBe(false)
        expect(
          validatePreferencesPayload({
            audioConfig: {
              beatDetection: { threshold: 0.3, decayRate: 0.8, minInterval: 100 },
            },
          }).ok,
        ).toBe(true)
      })
    })
  })

  describe('validateAudioConfigPayload', () => {
    const validBeatDetection = { threshold: 0.3, decayRate: 0.8, minInterval: 100 }
    const validSmoothing = { enabled: true, alpha: 0.7 }
    const validIdleDetection = {
      enabled: true,
      thresholdPct: 20,
      minIdleSeconds: 5,
      resumeSeconds: 3,
      idleColor: 'blue',
      idleBrightness: 'low',
    }

    it('accepts a valid partial scalar update', () => {
      const result = validateAudioConfigPayload({ sensitivity: 2.5 })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sensitivity).toBe(2.5)
    })

    it('rejects non-object payloads', () => {
      expect(validateAudioConfigPayload(null).ok).toBe(false)
      expect(validateAudioConfigPayload([]).ok).toBe(false)
    })

    it('rejects out-of-range sensitivity and noiseFloor', () => {
      expect(validateAudioConfigPayload({ sensitivity: 0.05 }).ok).toBe(false)
      expect(validateAudioConfigPayload({ noiseFloor: 256 }).ok).toBe(false)
    })

    it('rejects fftSize values that are not a power of two', () => {
      expect(validateAudioConfigPayload({ fftSize: 4096 }).ok).toBe(true)
      expect(validateAudioConfigPayload({ fftSize: 999 }).ok).toBe(false)
    })

    it('requires fftSize to be an integer without rounding', () => {
      expect(validateAudioConfigPayload({ fftSize: 4095.6 }).ok).toBe(false)
      expect(validateAudioConfigPayload({ fftSize: '4096' }).ok).toBe(false)
      expect(validateAudioConfigPayload({ fftSize: 32 }).ok).toBe(true)
      expect(validateAudioConfigPayload({ fftSize: 32768 }).ok).toBe(true)
    })

    it('accepts an explicit deviceId clear for the system default', () => {
      const result = validateAudioConfigPayload({ deviceId: undefined })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.deviceId).toBeUndefined()
    })

    it('rejects a non-string or empty deviceId when provided', () => {
      expect(validateAudioConfigPayload({ deviceId: 42 }).ok).toBe(false)
      // The UI represents the default device as undefined, so '' is never a real selection.
      expect(validateAudioConfigPayload({ deviceId: '' }).ok).toBe(false)
    })

    it('accepts the boolean flags and rejects non-booleans', () => {
      expect(validateAudioConfigPayload({ enabled: true }).ok).toBe(true)
      expect(validateAudioConfigPayload({ linearResponse: false }).ok).toBe(true)
      expect(validateAudioConfigPayload({ strobeEnabled: true }).ok).toBe(true)
      expect(validateAudioConfigPayload({ strobeEnabled: 'yes' }).ok).toBe(false)
    })

    it('range-checks the strobe scalars', () => {
      // threshold is a 0-1 fraction, probability is a 0-100 percentage.
      expect(validateAudioConfigPayload({ strobeTriggerThreshold: 0.5 }).ok).toBe(true)
      expect(validateAudioConfigPayload({ strobeTriggerThreshold: 1.5 }).ok).toBe(false)
      expect(validateAudioConfigPayload({ strobeProbability: 60 }).ok).toBe(true)
      expect(validateAudioConfigPayload({ strobeProbability: 101 }).ok).toBe(false)
    })

    describe('bands', () => {
      const band = (i: number, overrides: Record<string, unknown> = {}) => ({
        id: `band-${i}`,
        name: `Band ${i}`,
        minHz: 20 + i * 100,
        maxHz: 100 + i * 100,
        gain: 1,
        ...overrides,
      })
      const eightBands = (overrides: Record<string, unknown> = {}, at = 0) =>
        Array.from({ length: 8 }, (_, i) => (i === at ? band(i, overrides) : band(i)))

      it('accepts a complete set of eight bands', () => {
        const result = validateAudioConfigPayload({ bands: eightBands() })
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.value.bands).toHaveLength(8)
      })

      it('rejects a non-array or a set that is not exactly eight bands', () => {
        expect(validateAudioConfigPayload({ bands: 'nope' }).ok).toBe(false)
        expect(validateAudioConfigPayload({ bands: eightBands().slice(0, 7) }).ok).toBe(false)
      })

      it('rejects a malformed band member', () => {
        expect(validateAudioConfigPayload({ bands: eightBands({ id: '' }) }).ok).toBe(false)
        expect(validateAudioConfigPayload({ bands: eightBands({ name: '' }) }).ok).toBe(false)
      })

      it('rejects out-of-range or inverted frequency bounds', () => {
        expect(validateAudioConfigPayload({ bands: eightBands({ minHz: 10 }) }).ok).toBe(false)
        expect(validateAudioConfigPayload({ bands: eightBands({ maxHz: 20001 }) }).ok).toBe(false)
        expect(
          validateAudioConfigPayload({ bands: eightBands({ minHz: 500, maxHz: 400 }) }).ok,
        ).toBe(false)
      })
    })

    it('requires a complete beatDetection object', () => {
      expect(validateAudioConfigPayload({ beatDetection: validBeatDetection }).ok).toBe(true)
      expect(validateAudioConfigPayload({ beatDetection: {} }).ok).toBe(false)
      expect(validateAudioConfigPayload({ beatDetection: { threshold: 2 } }).ok).toBe(false)
    })

    it('requires a complete smoothing object', () => {
      expect(validateAudioConfigPayload({ smoothing: validSmoothing }).ok).toBe(true)
      expect(validateAudioConfigPayload({ smoothing: { enabled: true } }).ok).toBe(false)
    })

    it('requires a complete idleDetection object', () => {
      expect(validateAudioConfigPayload({ idleDetection: validIdleDetection }).ok).toBe(true)
      expect(validateAudioConfigPayload({ idleDetection: { enabled: true } }).ok).toBe(false)
    })

    it('rejects payloads with no recognised keys', () => {
      expect(validateAudioConfigPayload({ bogus: true }).ok).toBe(false)
    })
  })
})
