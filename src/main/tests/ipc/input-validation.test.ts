import { describe, expect, it } from '@jest/globals'
import {
  isPlainObject,
  validateHost,
  validateLightingConfiguration,
  validateNumberInRange,
  validatePathUnderAllowedRoots,
  validateSenderEnablePayload,
  validateSenderId,
} from '../../ipc/inputValidation'

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
      if (result.ok) expect(result.value.sender).toBe('artnet')
    })

    it('accepts valid sacn payload', () => {
      const result = validateSenderEnablePayload({ sender: 'sacn', universe: 1 })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('sacn')
    })

    it('accepts valid ipc payload', () => {
      const result = validateSenderEnablePayload({ sender: 'ipc' })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('ipc')
    })

    it('accepts valid enttecpro payload with port', () => {
      const result = validateSenderEnablePayload({ sender: 'enttecpro', port: '/dev/ttyUSB0' })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe('enttecpro')
    })

    it('accepts valid opendmx payload', () => {
      const result = validateSenderEnablePayload({
        sender: 'opendmx',
        port: 'COM3',
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

    it('rejects enttecpro without port', () => {
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
})
