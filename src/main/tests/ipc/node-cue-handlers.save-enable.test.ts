import { describe, it, expect, jest } from '@jest/globals'

jest.mock('electron', () => ({ dialog: {}, ipcMain: {} }))
jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { NODE_CUES } from '../../../shared/ipcChannels'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import { CueStyle, INetCue } from '../../../photonics-dmx/cues/interfaces/INetCue'
import { ICueGroup } from '../../../photonics-dmx/cues/interfaces/INetCueGroup'

class MockCue implements INetCue {
  constructor(public cueId: string) {}
  get id(): string {
    return `mock-${this.cueId}`
  }
  style = CueStyle.Primary
  async execute(): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

function makeGroup(id: string): ICueGroup {
  return { id, name: id, cues: new Map([[CueType.Default, new MockCue(`${id}-default`)]]) }
}

describe('node-cue save opts the saved group in', () => {
  it('enables a newly-saved yarg group and refreshes the known baseline in one write', async () => {
    const registry = YargCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup(makeGroup('groupA'))
    registry.registerGroup(makeGroup('newGroup'))

    const stored = {
      yarg: {
        enabledGroups: ['groupA'],
        knownGroups: ['groupA'],
        disabledCues: {} as Record<string, string[]>,
      },
    }
    const config = {
      getPreference: (key: string) => (key === 'cueDomains' ? stored : undefined),
      updateCueDomain: jest.fn(async (domain: 'yarg', patch: Record<string, unknown>) => {
        Object.assign(stored[domain], patch)
      }),
    }
    const loader = { saveFile: jest.fn(async () => ({ success: true })) }
    const controllerManager = {
      getConfig: () => config,
      getNodeCueLoader: () => loader,
      refreshAudioCueSelection: jest.fn(),
    }

    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
      on: jest.fn(),
    }
    setupNodeCueHandlers(ipcMain as never, controllerManager as never)

    await handlers.get(NODE_CUES.SAVE)!(
      {},
      { mode: 'yarg', filename: 'f.json', content: { group: { id: 'newGroup' } } },
    )

    expect(registry.getEnabledGroups()).toEqual(expect.arrayContaining(['groupA', 'newGroup']))
    expect(stored.yarg.enabledGroups).toEqual(expect.arrayContaining(['groupA', 'newGroup']))
    expect(stored.yarg.knownGroups).toEqual(expect.arrayContaining(['groupA', 'newGroup']))
    // One combined enabled+known write for the change.
    expect(config.updateCueDomain).toHaveBeenCalledTimes(1)
  })
})
