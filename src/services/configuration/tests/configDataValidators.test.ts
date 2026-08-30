import {
  validateAppPreferencesData,
  validateDmxRigsData,
  validateUserLightsData,
} from '../configDataValidators'
import { createDefaultCueDomains } from '../cueDomainTypes'
import { DEFAULT_PREFERENCES } from '../configurationDefaults'

type Prefs = Parameters<typeof validateAppPreferencesData>[0]

function validPrefs(): Prefs {
  return {
    effectDebounce: 0,
    complex: false,
    cueDomains: createDefaultCueDomains(),
    cueConsistencyWindow: 2000,
    clockRate: 10,
  } as unknown as Prefs
}

describe('validateAppPreferencesData selectionMode enum', () => {
  it('accepts the default cue domains', () => {
    expect(validateAppPreferencesData(validPrefs()).valid).toBe(true)
  })

  // ConfigFile.update validates before writing, so the shipped defaults must satisfy their own
  // schema or the first save of an untouched install would be refused. Cheap to check, and it
  // pins the precondition the write-time gate depends on.
  it('accepts DEFAULT_PREFERENCES as shipped', () => {
    const outcome = validateAppPreferencesData(DEFAULT_PREFERENCES as unknown as Prefs)
    expect(outcome).toEqual({ valid: true })
  })

  it('accepts every valid selectionMode (lighting and motion)', () => {
    for (const mode of ['oncePerSong', 'perCueChange', 'withinSong', 'none'] as const) {
      const p = validPrefs()
      p.cueDomains.yarg.selectionMode = mode
      expect(validateAppPreferencesData(p).valid).toBe(true)
    }
  })

  it('rejects a corrupt selectionMode so it routes to corruption-recovery instead of a silent default', () => {
    const p = validPrefs()
    ;(p.cueDomains.yarg as { selectionMode: string }).selectionMode = 'garbage'
    expect(validateAppPreferencesData(p).valid).toBe(false)
  })
})

// The AJV schemas are additionalProperties:true, so an added optional field must NOT trip the
// corruption-recovery path (which would wipe the file). These pin that invariant for extraChannels.
describe('extraChannels does not trigger config corruption-recovery', () => {
  it('validateUserLightsData accepts a fixture carrying extraChannels', () => {
    const data = {
      lights: [
        {
          id: 't1',
          position: 0,
          fixture: 'rgb',
          label: 'L',
          name: 'L',
          isStrobeEnabled: false,
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
          extraChannels: [
            { type: 'amber', channel: 5 },
            { type: 'fixed', channel: 6, value: 200 },
          ],
        },
      ],
    }
    expect(
      validateUserLightsData(data as unknown as Parameters<typeof validateUserLightsData>[0]).valid,
    ).toBe(true)
  })

  it('validateDmxRigsData accepts rig lights carrying extraChannels', () => {
    const light = {
      id: 'l1',
      fixtureId: 't1',
      position: 1,
      fixture: 'rgb',
      label: 'L',
      name: 'L',
      isStrobeEnabled: false,
      group: 'front',
      universe: 1,
      mount: 'floor',
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
      extraChannels: [{ type: 'amber', channel: 5 }],
    }
    const data = {
      rigs: [
        {
          id: 'rig-1',
          name: 'Rig',
          active: true,
          config: {
            numLights: 1,
            lightLayout: { id: 'two-rows', label: 'Two Rows' },
            strobeType: 'None',
            frontLights: [light],
            backLights: [],
            strobeLights: [],
          },
        },
      ],
      schemaVersion: 6,
    }
    expect(
      validateDmxRigsData(data as unknown as Parameters<typeof validateDmxRigsData>[0]).valid,
    ).toBe(true)
  })
})
