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
