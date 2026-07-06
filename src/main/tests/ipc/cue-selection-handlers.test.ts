import { beforeEach, describe, it, expect, jest } from '@jest/globals'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { INetCue, CueStyle } from '../../../photonics-dmx/cues/interfaces/INetCue'
import { ICueGroup } from '../../../photonics-dmx/cues/interfaces/INetCueGroup'
import { CueData, CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import { ILightingController } from '../../../photonics-dmx/controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { CONFIG } from '../../../shared/ipcChannels'

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { registerCueSelectionConfigHandlers } from '../../ipc/config/cue-selection-handlers'

class MockCue implements INetCue {
  private _id: string
  constructor(public cueId: string) {
    this._id = `mock-${cueId}`
  }
  get id(): string {
    return this._id
  }
  style = CueStyle.Primary
  async execute(_d: CueData, _c: ILightingController, _l: DmxLightManager): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

function makeGroup(id: string): ICueGroup {
  return { id, name: id, cues: new Map([[CueType.Default, new MockCue(`${id}-default`)]]) }
}

describe('cue-selection-handlers: enabling a group at runtime', () => {
  let registry: YargCueRegistry
  let handlers: Map<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    registry = YargCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup(makeGroup('groupA'))
    registry.registerGroup(makeGroup('groupB'))

    handlers = new Map()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
      on: jest.fn(),
    }
    const controllerManager = {
      getConfig: () => ({
        updateCueDomain: jest.fn(async () => {}),
        getPreference: jest.fn(() => ({ yarg: { disabledCues: {} } })),
      }),
    }

    registerCueSelectionConfigHandlers(ipcMain as any, controllerManager as any)
  })

  it('makes a group enabled at runtime immediately active and selectable (no restart)', async () => {
    const setEnabled = handlers.get(CONFIG.SET_ENABLED_CUE_GROUPS)!

    // Start with only groupA enabled/active; groupB is disabled (removed from the active set).
    await setEnabled({}, ['groupA'])
    expect(registry.getActiveGroups()).toEqual(['groupA'])
    expect(registry.getCueImplementation(CueType.Default, 'simulated')).not.toBeNull()

    // Re-enable groupB at runtime: it must become active (selectable) without re-registering.
    await setEnabled({}, ['groupA', 'groupB'])
    expect(registry.getActiveGroups()).toEqual(expect.arrayContaining(['groupA', 'groupB']))
    expect(registry.getCueImplementationFromGroup(CueType.Default, 'groupB')).not.toBeNull()
  })
})

describe('cue-selection-handlers: GET/SET serialization per domain', () => {
  it('does not let a mid-flight GET revert a concurrent SET on the registry', async () => {
    const registry = YargCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup(makeGroup('groupA'))
    registry.registerGroup(makeGroup('groupB'))
    registry.registerGroup(makeGroup('groupC'))

    // Stored state whose knownGroups lags the registry, so the GET reconcile computes a change and
    // therefore issues a write we can park on a barrier while a SET is enqueued behind it.
    const stored = {
      yarg: {
        enabledGroups: ['groupA'],
        knownGroups: ['groupA'],
        disabledCues: {} as Record<string, string[]>,
      },
    }
    let releaseGetWrite!: () => void
    const getWriteBarrier = new Promise<void>((r) => {
      releaseGetWrite = r
    })
    let writes = 0

    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
      on: jest.fn(),
    }
    const config = {
      getAllPreferences: () => ({ cueDomains: stored, stageKitPrefs: { yargPriority: 'random' } }),
      getPreference: (key: string) => (key === 'cueDomains' ? stored : undefined),
      updateCueDomain: jest.fn(async (domain: 'yarg', patch: Record<string, unknown>) => {
        writes += 1
        if (writes === 1) {
          await getWriteBarrier // hold the GET's write open
        }
        Object.assign(stored[domain], patch)
      }),
    }
    const controllerManager = { getConfig: () => config }

    registerCueSelectionConfigHandlers(ipcMain as never, controllerManager as never)
    const getEnabled = handlers.get(CONFIG.GET_ENABLED_CUE_GROUPS)!
    const setEnabled = handlers.get(CONFIG.SET_ENABLED_CUE_GROUPS)!

    const getPromise = getEnabled({}) // parks on the write barrier mid-reconcile
    const setPromise = setEnabled({}, ['groupB']) // queued behind the GET on the domain's op chain

    await Promise.resolve()
    releaseGetWrite()
    await Promise.all([getPromise, setPromise])

    // The SET ran strictly after the GET, so the registry reflects the SET, not the GET's snapshot.
    expect(registry.getEnabledGroups()).toEqual(['groupB'])
  })
})
