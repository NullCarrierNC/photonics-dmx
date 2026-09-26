import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import * as fs from 'fs'
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
  validateOpenablePath,
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
import { CUE_CONSISTENCY_WINDOW_MS_MAX } from '../../../shared/cueConsistencyWindow'
import {
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  DMX_OUTPUT_REFRESH_RATE_HZ_MIN,
} from '../../../shared/dmxOutputRefresh'

describe('inputValidation', () => {
  describe('isPlainObject', () => {
    it.each([
      ['a plain object', { a: 1 }],
      ['a nested plain object', { a: { b: 2 } }],
    ])('returns true for %s', (_label, value) => {
      expect(isPlainObject(value)).toBe(true)
    })

    it.each([null, [1, 2, 3], undefined])('returns false for %p', (value) => {
      expect(isPlainObject(value)).toBe(false)
    })
  })

  describe('validateSenderId', () => {
    it.each(['sacn', 'artnet', 'ipc', 'enttecpro', 'opendmx'])(
      'accepts the known sender id %s',
      (id) => {
        expect(validateSenderId(id).ok).toBe(true)
      },
    )

    it.each([
      ['an unknown sender id', 'bogus'],
      ['an empty string', ''],
    ])('rejects %s', (_label, id) => {
      expect(validateSenderId(id).ok).toBe(false)
    })
  })

  describe('validateRigOutputs', () => {
    it.each([
      ['undefined as the publish-to-all default', undefined, undefined],
      ['null as undefined, as a JSON round-trip produces', null, undefined],
      ['an empty array as publish nowhere on the wire', [], []],
      ['a valid wire-sender array', ['sacn', 'opendmx'], ['sacn', 'opendmx']],
      [
        'repeated entries and deduplicates them',
        ['sacn', 'sacn', 'opendmx', 'sacn'],
        ['sacn', 'opendmx'],
      ],
    ])('accepts %s', (_label, outputs, expected) => {
      const result = validateRigOutputs(outputs)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(expected)
      }
    })

    it.each([
      ['"ipc", which is not a routable wire sender', ['ipc']],
      ['an unknown sender id', ['sacn', 'bogus']],
      ['a string', 'sacn'],
      ['an object', {}],
      ['a number', 42],
      ['an array containing a non-string entry', ['sacn', 123]],
    ])('rejects %s', (_label, outputs) => {
      expect(validateRigOutputs(outputs).ok).toBe(false)
    })
  })

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

  describe('validateDmxRigPayload outputs handling', () => {
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

    it.each([
      ['contain an invalid sender id', ['sacn', 'bogus']],
      ['is not an array', 'sacn'],
    ])('rejects a rig whose outputs %s', (_label, outputs) => {
      expect(validateDmxRigPayload({ ...baseRig, outputs }).ok).toBe(false)
    })
  })

  describe('validateRigMirrorFlag', () => {
    it.each([undefined, null])('accepts %p as undefined', (flag) => {
      expect(validateRigMirrorFlag(flag, 'mirrorHoriz')).toEqual({ ok: true, value: undefined })
    })

    it('accepts true and passes it through', () => {
      expect(validateRigMirrorFlag(true, 'mirrorVert')).toEqual({ ok: true, value: true })
    })

    it('normalizes false to undefined so the no-op default is never persisted', () => {
      expect(validateRigMirrorFlag(false, 'mirrorHoriz')).toEqual({ ok: true, value: undefined })
    })

    it.each([
      ['yes', 'mirrorHoriz'],
      [1, 'mirrorVert'],
      [{}, 'mirrorHoriz'],
    ] as const)('rejects the non-boolean %p with an error tagged %s', (value, field) => {
      const result = validateRigMirrorFlag(value, field)
      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain(field)
    })
  })

  describe('validateDmxRigPayload mirror handling', () => {
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

    it.each([
      ['mirrorHoriz', 'yes'],
      ['mirrorVert', 1],
    ])('rejects a non-boolean %s of %p', (field, value) => {
      expect(validateDmxRigPayload({ ...baseRig, [field]: value }).ok).toBe(false)
    })
  })

  describe('validateNumberInRange', () => {
    it('accepts numbers within range', () => {
      const result = validateNumberInRange(10, 1, 100, 'port')
      expect(result).toEqual({ ok: true, value: 10 })
    })

    it.each([
      ['the minimum', 1, 1],
      ['the maximum', 100, 100],
      ['a numeric string and coerces it', '50', 50],
    ])('accepts %s', (_label, input, value) => {
      expect(validateNumberInRange(input, 1, 100, 'x')).toEqual({ ok: true, value })
    })

    it.each([0, 101, NaN, Infinity])('rejects %p for a 1-100 range', (input) => {
      expect(validateNumberInRange(input, 1, 100, 'x').ok).toBe(false)
    })
  })

  describe('validateHost', () => {
    it.each([
      ['an IPv4 address', '127.0.0.1'],
      ['a hostname', 'example.local'],
      ['the IPv6 loopback', '::1'],
      ['an IPv6 address', '2001:db8::1'],
    ])('accepts %s', (_label, host) => {
      expect(validateHost(host).ok).toBe(true)
    })

    it.each([
      ['an empty host', ''],
      ['a host containing a space', 'bad host'],
      ['a path injection attempt', '../../../etc/passwd'],
    ])('rejects %s', (_label, host) => {
      expect(validateHost(host).ok).toBe(false)
    })
  })

  describe('validateSenderEnablePayload', () => {
    it('accepts valid artnet payload', () => {
      const result = validateSenderEnablePayload({ sender: 'artnet', host: '127.0.0.1' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.sender).toBe('artnet')
        if (result.value.sender === 'artnet') {
          expect(result.value.maxOutputRate).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT)
          expect(result.value.base_refresh_interval).toBe(23)
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
        expect(result.value.maxOutputRate).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT)
        expect(result.value.minRefreshRate).toBe(DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT)
      }
    })

    it.each([1, 63999])('accepts a sacn enable payload on universe %p', (universe) => {
      expect(validateSenderEnablePayload({ sender: 'sacn', universe }).ok).toBe(true)
    })

    it.each([0, 64000])(
      'refuses a sacn enable payload on universe %p, which the protocol does not define',
      (universe) => {
        expect(validateSenderEnablePayload({ sender: 'sacn', universe }).ok).toBe(false)
      },
    )

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

    it.each([
      { sender: 'ipc' },
      { sender: 'enttecpro', devicePath: '/dev/ttyUSB0' },
      { sender: 'opendmx', devicePath: 'COM3', dmxSpeed: 40 },
    ])('accepts the valid payload %p', (payload) => {
      const result = validateSenderEnablePayload(payload)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.sender).toBe(payload.sender)
    })

    describe('sACN unicast destination', () => {
      const sacn = (unicastDestination: unknown) =>
        validateSenderEnablePayload({ sender: 'sacn', useUnicast: true, unicastDestination })

      it.each([
        ['an IP address', '10.0.0.5'],
        ['a hostname', 'lights.local'],
      ])('accepts %s', (_label, host) => {
        const result = sacn(host)
        expect(result.ok && result.value.sender === 'sacn' && result.value.unicastDestination).toBe(
          host,
        )
      })

      it('reads an empty destination as none', () => {
        const result = sacn('')
        expect(result.ok && result.value.sender === 'sacn' && result.value.unicastDestination).toBe(
          undefined,
        )
      })

      it.each([
        ['a string that is not a host', 'not a host!'],
        ['a number', 42],
      ])('refuses %s as the destination', (_label, destination) => {
        expect(sacn(destination).ok).toBe(false)
      })
    })

    describe('serial device paths', () => {
      it.each([
        'COM3',
        'com12',
        '\\\\.\\COM14',
        '/dev/ttyUSB0',
        '/dev/tty.usbserial-A10KDJ7N',
        '/dev/cu.usbserial-A10KDJ7N',
        '/dev/ttyACM0',
        '/dev/serial/by-id/usb-FTDI_FT232R-if00-port0',
      ])('accepts %s', (devicePath) => {
        expect(validateSenderEnablePayload({ sender: 'enttecpro', devicePath }).ok).toBe(true)
        expect(validateSenderEnablePayload({ sender: 'opendmx', devicePath }).ok).toBe(true)
      })

      it.each([
        '/etc/passwd',
        '/dev/../etc/passwd',
        'ttyUSB0',
        'COM3; rm -rf /',
        '/tmp/port',
        'COM',
        '/dev/console',
        '/dev/disk0',
        '/dev/tty',
      ])('refuses %s', (devicePath) => {
        expect(validateSenderEnablePayload({ sender: 'enttecpro', devicePath }).ok).toBe(false)
        expect(validateSenderEnablePayload({ sender: 'opendmx', devicePath }).ok).toBe(false)
      })

      it('holds a stored port to the same rule, with an empty port meaning none chosen', () => {
        expect(validatePreferencesPayload({ enttecProConfig: { port: '/etc/passwd' } }).ok).toBe(
          false,
        )
        expect(validatePreferencesPayload({ openDmxConfig: { port: '' } }).ok).toBe(true)
        expect(validatePreferencesPayload({ openDmxConfig: { port: '/dev/ttyUSB0' } }).ok).toBe(
          true,
        )
      })
    })

    it.each([
      ['a non-object payload', 'bad'],
      ['a payload with no sender', { host: '127.0.0.1' }],
      ['enttecpro without a devicePath', { sender: 'enttecpro' }],
    ])('rejects %s', (_label, payload) => {
      expect(validateSenderEnablePayload(payload).ok).toBe(false)
    })

    describe.each([
      {
        sender: 'enttecpro',
        devicePath: '/dev/ttyUSB0',
        range: '10-44',
        clamps: [
          [2.4, 10],
          [44.6, 44],
          [20.5, 21],
        ],
      },
      {
        sender: 'opendmx',
        devicePath: 'COM3',
        range: '1-44',
        clamps: [
          [5, 5],
          [0, 1],
          [-3, 1],
          [20.5, 21],
          [1000, 44],
        ],
      },
    ])('$sender dmxSpeed', ({ sender, devicePath, range, clamps }) => {
      const enable = (fields: Record<string, unknown> = {}) =>
        validateSenderEnablePayload({ sender, devicePath, ...fields })
      const dmxSpeedOf = (result: ReturnType<typeof enable>): unknown =>
        result.ok ? (result.value as { dmxSpeed?: number }).dmxSpeed : 'rejected'

      it('stays undefined when the payload does not carry one', () => {
        const result = enable()
        expect(result.ok && result.value.sender).toBe(sender)
        expect(dmxSpeedOf(result)).toBeUndefined()
      })

      it.each(clamps)(`rounds and clamps a supplied %p into ${range} as %p`, (dmxSpeed, stored) => {
        expect(dmxSpeedOf(enable({ dmxSpeed }))).toBe(stored)
      })

      it.each([NaN, Infinity, -Infinity, '40', null])(
        'rejects a supplied %p with no fallback to a default',
        (dmxSpeed) => {
          expect(enable({ dmxSpeed }).ok).toBe(false)
        },
      )
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

    it.each(['bad', null, []])('rejects the non-object input %p', (input) => {
      expect(validateLightingConfiguration(input).ok).toBe(false)
    })

    it.each([
      ['numLights', -1],
      ['numLights', NaN],
      ['lightLayout', { id: 'x' }],
      ['lightLayout', 'not-object'],
      ['strobeType', 'Invalid'],
      ['frontLights', {}],
      ['backLights', null],
      ['strobeLights', 'x'],
    ])('rejects an invalid %s of %p', (field, value) => {
      expect(validateLightingConfiguration({ ...validPayload, [field]: value }).ok).toBe(false)
    })
  })

  describe('validateStringUnion', () => {
    const allowed = ['a', 'b', 'c'] as const

    it('accepts a member of the union', () => {
      const r = validateStringUnion('b', allowed, 'field')
      expect(r).toEqual({ ok: true, value: 'b' })
    })

    it.each([
      ['a value not in the union', 'z'],
      ['a number', 1],
      ['undefined', undefined],
    ])('rejects %s', (_label, value) => {
      expect(validateStringUnion(value, allowed, 'field').ok).toBe(false)
    })
  })

  describe('validateMotionSelectionMode', () => {
    it.each(['oncePerSong', 'perCueChange', 'none'])('accepts the supported mode %s', (mode) => {
      expect(validateMotionSelectionMode(mode).ok).toBe(true)
    })

    it.each([
      ['"withinSong", which is a cue-group mode and not a motion mode', 'withinSong'],
      ['a non-string input', null],
    ])('rejects %s', (_label, mode) => {
      expect(validateMotionSelectionMode(mode).ok).toBe(false)
    })
  })

  describe('validateCueGroupSelectionMode', () => {
    it.each(['oncePerSong', 'withinSong'])('accepts %s', (mode) => {
      expect(validateCueGroupSelectionMode(mode).ok).toBe(true)
    })

    it.each(['perCueChange', 'none'])('rejects the motion-only mode %s', (mode) => {
      expect(validateCueGroupSelectionMode(mode).ok).toBe(false)
    })
  })

  describe('validateStageKitPriority', () => {
    it.each(['prefer-for-tracked', 'random', 'never'])(
      'accepts the supported priority %s',
      (priority) => {
        expect(validateStageKitPriority(priority).ok).toBe(true)
      },
    )

    it.each(['always', 0])('rejects the unknown priority %p', (priority) => {
      expect(validateStageKitPriority(priority).ok).toBe(false)
    })
  })

  describe('validateCueType', () => {
    it('accepts a known CueType enum value', () => {
      const known = Object.values(CueType)[0] as string
      const r = validateCueType(known)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toBe(known)
    })

    it.each([
      ['an unknown string', 'not-a-real-cue'],
      ['an empty string', ''],
      ['null', null],
      ['a number', 7],
    ])('rejects %s', (_label, value) => {
      expect(validateCueType(value).ok).toBe(false)
    })
  })

  describe('validateCueRefPayload', () => {
    it.each([null, undefined])('accepts %p as the explicit "no active cue" value', (payload) => {
      expect(validateCueRefPayload(payload)).toEqual({ ok: true, value: null })
    })

    it('accepts a well-formed { groupId, cueId } object and trims whitespace', () => {
      const r = validateCueRefPayload({ groupId: '  g1 ', cueId: ' c1 ' })
      expect(r).toEqual({ ok: true, value: { groupId: 'g1', cueId: 'c1' } })
    })

    it.each([
      ['a string payload', 'bad'],
      ['a number payload', 42],
      ['an empty groupId', { groupId: '' }],
      ['a missing groupId', { cueId: 'c1' }],
      ['a blank cueId', { groupId: 'g1', cueId: '   ' }],
    ])('rejects %s', (_label, payload) => {
      expect(validateCueRefPayload(payload).ok).toBe(false)
    })
  })

  describe('validatePathUnderAllowedRoots', () => {
    const allowedRoots = ['/tmp/project', '/Users/tester']

    it('accepts paths under allowed roots', () => {
      const result = validatePathUnderAllowedRoots('/tmp/project/file.txt', allowedRoots)
      expect(result.ok).toBe(true)
    })

    it.each([
      ['a path outside the allowed roots', '/etc/passwd', allowedRoots],
      ['a path with a null byte', '/tmp/project/file\x00.txt', allowedRoots],
      ['a non-string path', 123, allowedRoots],
      ['an empty string path', '', allowedRoots],
      ['a path when the allowed roots are empty', '/tmp/foo', []],
    ])('rejects %s', (_label, candidate, roots) => {
      expect(validatePathUnderAllowedRoots(candidate, roots).ok).toBe(false)
    })

    describe('links', () => {
      let root: string

      beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-links-'))
      })

      afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
      })

      it('refuses a link under a root that points outside it', () => {
        const link = path.join(root, 'escape')
        fs.symlinkSync('/etc', link)

        expect(validatePathUnderAllowedRoots(link, [root]).ok).toBe(false)
        expect(validatePathUnderAllowedRoots(path.join(link, 'hosts'), [root]).ok).toBe(false)
      })

      it('accepts a file inside a root that is reached through a link', () => {
        const real = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-real-'))
        const linkedRoot = path.join(root, 'libraries')
        fs.symlinkSync(real, linkedRoot)
        try {
          expect(validatePathUnderAllowedRoots(path.join(real, 'cues.json'), [linkedRoot]).ok).toBe(
            true,
          )
        } finally {
          fs.rmSync(real, { recursive: true, force: true })
        }
      })

      it('accepts a file that does not exist yet under a root', () => {
        expect(validatePathUnderAllowedRoots(path.join(root, 'new', 'cues.json'), [root]).ok).toBe(
          true,
        )
      })
    })
  })

  describe('validateOpenablePath', () => {
    const allowedRoots = [os.tmpdir()]
    const under = (name: string) => path.join(os.tmpdir(), name)
    const inTempDir = (check: (dir: string) => void): void => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-openable-'))
      try {
        check(dir)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }

    it.each(['library.json', 'notes.txt', 'photonics.log', 'readme.md', 'rows.csv'])(
      'accepts %s, a file type the app opens',
      (name) => {
        expect(validateOpenablePath(under(name), allowedRoots).ok).toBe(true)
      },
    )

    it.each(['installer.exe', 'run.sh', 'payload.command', 'link.lnk', 'go.bat'])(
      'refuses to hand the executable %s to the system handler',
      (name) => {
        expect(validateOpenablePath(under(name), allowedRoots).ok).toBe(false)
      },
    )

    it('accepts a plain directory, which opens a file manager', () => {
      inTempDir((dir) => {
        expect(validateOpenablePath(dir, allowedRoots).ok).toBe(true)
      })
    })

    it('refuses a directory carrying an extension, which is what a macOS bundle is', () => {
      inTempDir((dir) => {
        const bundle = path.join(dir, 'Something.app')
        fs.mkdirSync(bundle)
        expect(validateOpenablePath(bundle, allowedRoots).ok).toBe(false)
      })
    })

    it('still refuses a path outside the allowed roots', () => {
      expect(validateOpenablePath('/etc/hosts.json', allowedRoots).ok).toBe(false)
    })

    it('refuses a link with no extension that leads to an application bundle', () => {
      inTempDir((dir) => {
        const bundle = path.join(dir, 'Something.app')
        fs.mkdirSync(bundle)
        const link = path.join(dir, 'harmless')
        fs.symlinkSync(bundle, link)
        expect(validateOpenablePath(link, allowedRoots).ok).toBe(false)
      })
    })

    describe('channel bounds', () => {
      const lightWith = (channels: Record<string, number>) => ({
        id: 'l1',
        name: 'L1',
        label: 'L1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: 'rgb',
        group: 'front',
        position: 1,
        channels,
      })
      const configWith = (channels: Record<string, number>) => ({
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows' },
        strobeType: 'None',
        frontLights: [{ ...lightWith(channels), fixtureId: 'tpl-1' }],
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

    describe('fixture type channels', () => {
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
      const layoutWith = (light: Record<string, unknown>) => ({
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows' },
        strobeType: 'None',
        frontLights: [{ ...light, fixtureId: 'tpl-1', group: 'front' }],
        backLights: [],
        strobeLights: [],
      })

      it.each([
        ['an RGB fixture missing blue', { channels: { masterDimmer: 1, red: 2, green: 3 } }],
        [
          'a moving head missing tilt',
          { fixture: 'rgb/mh', channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5 } },
        ],
        [
          'a strobe missing its strobe channel',
          { fixture: 'strobe', channels: { masterDimmer: 1 } },
        ],
        [
          'a channel the fixture type does not have',
          { channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, tilt: 5 } },
        ],
      ])('rejects %s', (_label, fields) => {
        expect(validateDmxFixturesArray([fixtureWith(fields)]).ok).toBe(false)
        expect(validateLightingConfiguration(layoutWith(fixtureWith(fields))).ok).toBe(false)
      })

      it('accepts an RGB fixture with an optional strobe channel', () => {
        const fields = {
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
        }
        expect(validateDmxFixturesArray([fixtureWith(fields)]).ok).toBe(true)
      })

      it.each([
        ['a null', null],
        ['an empty', ''],
      ])('refuses a template saved with %s id', (_label, id) => {
        expect(validateDmxFixturesArray([fixtureWith({ id })])).toEqual({
          ok: false,
          error: 'lights[0].id must be a non-empty string',
        })
      })

      it('rejects a layout light whose fixture type is unknown', () => {
        expect(
          validateLightingConfiguration(layoutWith(fixtureWith({ fixture: 'laser' }))).ok,
        ).toBe(false)
      })
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

      it.each([null, []])('normalises %p extraChannels to a missing key', (empty) => {
        const result = validateDmxFixturesArray([fixtureWith(empty)])
        if (!result.ok) throw new Error(result.error)
        expect('extraChannels' in result.value[0]!).toBe(false)
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
        const result = validateDmxFixturesArray([
          fixtureWith({
            brightnessScaling: { red: 100, green: 80 },
            extraChannels: [{ type: 'amber', channel: 5, scale: 100 }],
          }),
        ])
        if (!result.ok) throw new Error(result.error)
        expect(result.value[0]!.brightnessScaling).toEqual({ green: 80 })
        expect(result.value[0]!.extraChannels).toEqual([{ type: 'amber', channel: 5 }])
      })

      it.each([
        ['an all-default scaling object', { red: 100, green: 100 }],
        ['a null scaling', null],
      ])('drops %s entirely', (_label, scaling) => {
        const result = validateDmxFixturesArray([fixtureWith({ brightnessScaling: scaling })])
        if (!result.ok) throw new Error(result.error)
        expect('brightnessScaling' in result.value[0]!).toBe(false)
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
        const result = validateLightingConfiguration(config)
        if (!result.ok) throw new Error(result.error)
        expect(result.value.frontLights[0]!.brightnessScaling).toEqual({ green: 80 })

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
    it('holds cueConsistencyWindow to the range the settings box offers', () => {
      const atCeiling = validatePreferencesPayload({
        cueConsistencyWindow: CUE_CONSISTENCY_WINDOW_MS_MAX,
      })
      expect(atCeiling.ok).toBe(true)
      expect(
        validatePreferencesPayload({ cueConsistencyWindow: CUE_CONSISTENCY_WINDOW_MS_MAX + 1 }).ok,
      ).toBe(false)
    })

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

    // The stored host reaches the driver verbatim on the next launch, so a bad one keeps sending
    // the rig's output somewhere else.
    it.each(['10.0.0.5 ; rm -rf /', 'http://10.0.0.5', '10.0.0.5/24', '-leading'])(
      'refuses the Art-Net host %p, which is not an address',
      (host) => {
        const r = validatePreferencesPayload({ artNetConfig: { host } })
        expect(r.ok).toBe(false)
      },
    )

    it.each([
      ['10.0.0.5', '10.0.0.5'],
      ['  10.0.0.5  ', '10.0.0.5'],
      ['fe80::1', 'fe80::1'],
      ['lighting-desk.local', 'lighting-desk.local'],
      ['', ''],
    ])('accepts the Art-Net host %p and stores it trimmed as %p', (host, stored) => {
      const r = validatePreferencesPayload({ artNetConfig: { host } })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.artNetConfig?.host).toBe(stored)
    })

    it('accepts every Art-Net addressing field at the top of its range', () => {
      const inRange = { universe: 32767, net: 127, subnet: 15, subuni: 15, port: 65535 }
      expect(validatePreferencesPayload({ artNetConfig: inRange }).ok).toBe(true)
    })

    it.each([
      ['universe', 32768],
      ['net', 128],
      ['subnet', 16],
      ['subuni', 16],
      ['port', 0],
    ])('rejects an out-of-range Art-Net %s of %p', (field, value) => {
      const r = validatePreferencesPayload({ artNetConfig: { [field]: value } })
      expect(r.ok).toBe(false)
    })

    it('refuses a sACN unicast destination that is not an address', () => {
      const r = validatePreferencesPayload({
        sacnConfig: { unicastDestination: 'not a host!' },
      })
      expect(r.ok).toBe(false)
    })

    it.each([1, 63999])('accepts a sACN universe of %p', (universe) => {
      expect(validatePreferencesPayload({ sacnConfig: { universe } }).ok).toBe(true)
    })

    it.each([64000, 0, -1])('rejects an out-of-range sACN universe of %p', (universe) => {
      expect(validatePreferencesPayload({ sacnConfig: { universe } }).ok).toBe(false)
    })

    it('rejects a non-boolean sACN useUnicast', () => {
      expect(validatePreferencesPayload({ sacnConfig: { useUnicast: 'yes' } }).ok).toBe(false)
    })

    it('rejects non-number sacnConfig.refreshRateHz', () => {
      const payload: Record<string, unknown> = {
        sacnConfig: { refreshRateHz: 'fast' },
      }
      const r = validatePreferencesPayload(payload)
      expect(r.ok).toBe(false)
    })

    describe('shape validation for pass-through prefs', () => {
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

      const payloadAt = (field: string, value: unknown): Record<string, unknown> => {
        const [key, nested] = field.split('.')
        return { [key]: nested ? { [nested]: value } : value }
      }

      it.each([
        ['stageKitPrefs.yargPriority', 'random'],
        ['rb3Prefs.processingMode', 'direct'],
        ['rb3Prefs.processingMode', 'cue'],
        ['whiteChannelMixMode', 'w-only'],
        ['whiteChannelMixMode', 'strobe-rgbw'],
        ['whiteChannelMixMode', 'always-rgbw'],
        ['blackoutShortcutKey', 'escape'],
        ['blackoutShortcutKey', 'backquote'],
        ['blackoutShortcutScope', 'disabled'],
        ['blackoutShortcutScope', 'focused'],
        ['blackoutShortcutScope', 'system-wide'],
      ])('accepts a %s of %p from the allowed set', (field, value) => {
        expect(validatePreferencesPayload(payloadAt(field, value)).ok).toBe(true)
      })

      it.each([
        ['stageKitPrefs.yargPriority', 'bogus'],
        ['rb3Prefs.processingMode', 'Cue'],
        ['rb3Prefs', {}],
        ['rb3Prefs', 'cue'],
        ['whiteChannelMixMode', 'rgbw'],
        ['whiteChannelMixMode', 3],
        ['blackoutShortcutKey', 'backtick'],
        ['blackoutShortcutKey', '`'],
        ['blackoutShortcutKey', true],
        ['blackoutShortcutScope', 'systemwide'],
        ['blackoutShortcutScope', true],
      ])('rejects a %s of %p against the allowed set', (field, value) => {
        expect(validatePreferencesPayload(payloadAt(field, value)).ok).toBe(false)
      })

      it('keeps both blackout shortcut keys through the allowlist', () => {
        // The key map is what decides whether a key survives to be saved at all, so a payload that
        // validates but is silently stripped would leave the setting looking broken.
        const result = validatePreferencesPayload({
          blackoutShortcutKey: 'backquote',
          blackoutShortcutScope: 'system-wide',
        })
        expect(result.ok && result.value.blackoutShortcutKey).toBe('backquote')
        expect(result.ok && result.value.blackoutShortcutScope).toBe('system-wide')
      })

      it.each([
        [0, 0],
        [250, 250],
        [500, 500],
        [501, 500],
        [-5, 0],
        [120.6, 121],
      ])('holds a videoLagCompensationMs of %p inside its range as %p', (value, stored) => {
        const result = validatePreferencesPayload({ videoLagCompensationMs: value })
        expect(result.ok ? result.value.videoLagCompensationMs : 'rejected').toBe(stored)
      })

      it('holds the audio lag compensation the same way', () => {
        const result = validatePreferencesPayload({ audioLagCompensationMs: 501 })
        expect(result.ok && result.value.audioLagCompensationMs).toBe(500)
      })

      it.each([
        ['videoLagCompensationMs', 'slow'],
        ['videoLagCompensationMs', Number.NaN],
        ['audioLagCompensationMs', null],
      ])('rejects a %s of %p, which is not a usable number', (key, value) => {
        expect(validatePreferencesPayload({ [key]: value }).ok).toBe(false)
      })

      it('keeps both lag compensation keys through the allowlist', () => {
        // The key map is what decides whether a key survives to be saved at all, so a payload that
        // validates but is silently stripped would leave the setting looking broken.
        const result = validatePreferencesPayload({
          videoLagCompensationMs: 180,
          audioLagCompensationMs: 40,
        })
        expect(result.ok && result.value.videoLagCompensationMs).toBe(180)
        expect(result.ok && result.value.audioLagCompensationMs).toBe(40)
      })

      it('requires dmxSettingsPrefs expansion flags to be booleans', () => {
        expect(validatePreferencesPayload({ dmxSettingsPrefs: { artNetExpanded: true } }).ok).toBe(
          true,
        )
        expect(validatePreferencesPayload({ dmxSettingsPrefs: { artNetExpanded: 'yes' } }).ok).toBe(
          false,
        )
      })

      describe('simulationSettings shape', () => {
        const good = {
          registryType: 'YARG',
          groupId: 'default',
          effectId: null,
          venueSize: 'Small',
          bpm: 120,
          instrument: 'drums',
        }

        it('accepts a well-formed simulationSettings', () => {
          expect(validatePreferencesPayload({ simulationSettings: good }).ok).toBe(true)
        })

        it.each([
          ['registryType', 'X'],
          ['bpm', 'fast'],
          ['instrument', 'kazoo'],
        ])('rejects a %s of %p', (field, value) => {
          expect(
            validatePreferencesPayload({ simulationSettings: { ...good, [field]: value } }).ok,
          ).toBe(false)
        })
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

      it.each([
        [0, 1],
        [9999, 50],
        [51, 50],
      ])('clamps a clockRate of %p to %p, inside the window the Clock accepts', (rate, stored) => {
        const r = validatePreferencesPayload({ clockRate: rate })
        expect(r.ok && r.value.clockRate).toBe(stored)
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

      it.each([
        ['enttecProConfig', { port: 'COM3' }],
        ['openDmxConfig', { port: 'COM3', dmxSpeed: 40 }],
        ['dmxOutputConfig', { sacnEnabled: true }],
      ])('accepts the adapter config %s %p', (key, config) => {
        expect(validatePreferencesPayload({ [key]: config }).ok).toBe(true)
      })

      it.each([
        ['enttecProConfig', { port: 3 }],
        ['openDmxConfig', { port: 'COM3', dmxSpeed: 'fast' }],
        ['dmxOutputConfig', { sacnEnabled: 1 }],
      ])('rejects the malformed adapter config %s %p', (key, config) => {
        expect(validatePreferencesPayload({ [key]: config }).ok).toBe(false)
      })

      it.each([NaN, 'fast'])(
        'rejects an unusable enttecProConfig.dmxSpeed of %p without storing it',
        (dmxSpeed) => {
          expect(
            validatePreferencesPayload({ enttecProConfig: { port: 'COM3', dmxSpeed } }).ok,
          ).toBe(false)
        },
      )

      it('clamps a valid enttecProConfig.dmxSpeed to 10-44 without mutating the caller payload', () => {
        const payload = { enttecProConfig: { port: 'COM3', dmxSpeed: 2 } }
        const result = validatePreferencesPayload(payload)

        expect(result.ok).toBe(true)
        if (result.ok) {
          const cleaned = result.value as { enttecProConfig?: { dmxSpeed?: number } }
          expect(cleaned.enttecProConfig?.dmxSpeed).toBe(10)
        }
        // The caller's own object is untouched, only the validator's returned copy is normalized.
        expect(payload.enttecProConfig.dmxSpeed).toBe(2)
      })

      it.each([
        [5, 5],
        [0, 1],
        [200, 44],
      ])('stores an openDmxConfig.dmxSpeed of %p as %p', (dmxSpeed, stored) => {
        const result = validatePreferencesPayload({ openDmxConfig: { port: 'COM3', dmxSpeed } })
        expect(result.ok).toBe(true)
        if (result.ok) {
          const cleaned = result.value as { openDmxConfig?: { dmxSpeed?: number } }
          expect(cleaned.openDmxConfig?.dmxSpeed).toBe(stored)
        }
      })

      it.each([{ enabled: 'yes' }, { cueDurationMin: -1 }])(
        'rejects the malformed audioGameMode %p without storing it',
        (audioGameMode) => {
          expect(validatePreferencesPayload({ audioGameMode }).ok).toBe(false)
        },
      )

      it('accepts a well-formed audioGameMode', () => {
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

    it.each([null, []])('rejects the non-object payload %p', (payload) => {
      expect(validateAudioConfigPayload(payload).ok).toBe(false)
    })

    // The strobe threshold is a 0-1 fraction and the strobe probability a 0-100 percentage.
    it.each([
      ['strobeTriggerThreshold', 0.5],
      ['strobeProbability', 60],
    ])('accepts an in-range %s of %p', (key, value) => {
      expect(validateAudioConfigPayload({ [key]: value }).ok).toBe(true)
    })

    it.each([
      ['sensitivity', 0.05],
      ['noiseFloor', 256],
      ['strobeTriggerThreshold', 1.5],
      ['strobeProbability', 101],
    ])('rejects an out-of-range %s of %p', (key, value) => {
      expect(validateAudioConfigPayload({ [key]: value }).ok).toBe(false)
    })

    it.each([4096, 32, 32768])('accepts the power-of-two fftSize %p', (fftSize) => {
      expect(validateAudioConfigPayload({ fftSize }).ok).toBe(true)
    })

    it.each([
      ['not a power of two', 999],
      ['fractional, without rounding it', 4095.6],
      ['a numeric string', '4096'],
    ])('rejects an fftSize that is %s', (_label, fftSize) => {
      expect(validateAudioConfigPayload({ fftSize }).ok).toBe(false)
    })

    it('accepts an explicit deviceId clear for the system default', () => {
      const result = validateAudioConfigPayload({ deviceId: undefined })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.deviceId).toBeUndefined()
    })

    it.each([
      ['a non-string deviceId', 42],
      // The UI represents the default device as undefined, so '' is never a real selection.
      ['an empty deviceId', ''],
    ])('rejects %s when provided', (_label, deviceId) => {
      expect(validateAudioConfigPayload({ deviceId }).ok).toBe(false)
    })

    it.each([{ enabled: true }, { linearResponse: false }, { strobeEnabled: true }])(
      'accepts the boolean flag %p',
      (payload) => {
        expect(validateAudioConfigPayload(payload).ok).toBe(true)
      },
    )

    it('rejects a non-boolean flag', () => {
      expect(validateAudioConfigPayload({ strobeEnabled: 'yes' }).ok).toBe(false)
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

      it.each([
        ['a non-array', 'nope'],
        ['a set of seven bands', eightBands().slice(0, 7)],
      ])('rejects %s in place of exactly eight bands', (_label, bands) => {
        expect(validateAudioConfigPayload({ bands }).ok).toBe(false)
      })

      it.each([
        ['an empty id', { id: '' }],
        ['an empty name', { name: '' }],
        ['a minHz below range', { minHz: 10 }],
        ['a maxHz above range', { maxHz: 20001 }],
        ['inverted frequency bounds', { minHz: 500, maxHz: 400 }],
      ])('rejects a band member with %s', (_label, overrides) => {
        expect(validateAudioConfigPayload({ bands: eightBands(overrides) }).ok).toBe(false)
      })
    })

    it.each([
      ['beatDetection', validBeatDetection],
      ['smoothing', validSmoothing],
      ['idleDetection', validIdleDetection],
    ])('accepts a complete %s object', (key, value) => {
      expect(validateAudioConfigPayload({ [key]: value }).ok).toBe(true)
    })

    it.each([
      ['beatDetection', {}],
      ['beatDetection', { threshold: 2 }],
      ['smoothing', { enabled: true }],
      ['idleDetection', { enabled: true }],
    ])('rejects an incomplete %s object %p', (key, value) => {
      expect(validateAudioConfigPayload({ [key]: value }).ok).toBe(false)
    })

    it('rejects payloads with no recognised keys', () => {
      expect(validateAudioConfigPayload({ bogus: true }).ok).toBe(false)
    })
  })
})
