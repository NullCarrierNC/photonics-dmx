import { describe, it, expect, jest } from '@jest/globals'

jest.mock('electron', () => ({ dialog: {}, ipcMain: {} }))
jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { sendToAllWindows } from '../../utils/windowUtils'
import { NODE_CUES, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
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
    const registry = CueRegistry.getInstance()
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
    const loader = {
      saveFile: jest.fn(async () => ({ success: true })),
      getModes: () => ['yarg', 'audio', 'rb3'],
    }
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

  it('answers the save as saved with the enable failure beside it', async () => {
    const registry = CueRegistry.getInstance()
    registry.reset()
    registry.registerGroup(makeGroup('newGroup'))

    const stored = { yarg: { enabledGroups: [], knownGroups: [], disabledCues: {} } }
    const config = {
      getPreference: (key: string) => (key === 'cueDomains' ? stored : undefined),
      updateCueDomain: jest.fn(async () => {
        throw new Error('Failed to save configuration: disk full')
      }),
    }
    const loader = {
      saveFile: jest.fn(async () => ({ success: true, path: '/cues/yarg/f.json' })),
      getModes: () => ['yarg', 'audio', 'rb3'],
    }
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

    const result = await handlers.get(NODE_CUES.SAVE)!(
      {},
      { mode: 'yarg', filename: 'f.json', content: { group: { id: 'newGroup' } } },
    )

    expect(result).toEqual({
      success: true,
      path: '/cues/yarg/f.json',
      groupEnableError: 'Failed to save configuration: disk full',
    })
    expect(loader.saveFile).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['yarg', RENDERER_RECEIVE.YARG_CUE_GROUPS_CHANGED],
    ['rb3', RENDERER_RECEIVE.RB3_CUE_GROUPS_CHANGED],
  ] as const)('tells every window when a %s save enables its group', async (mode, event) => {
    const registry = mode === 'rb3' ? getCueRegistry('rb3') : CueRegistry.getInstance()
    registry.reset()
    registry.registerGroup(makeGroup('newGroup'))
    const empty = { enabledGroups: [], knownGroups: [], disabledCues: {} }
    const stored = { yarg: { ...empty }, rb3: { ...empty } }
    const config = {
      getPreference: (key: string) => (key === 'cueDomains' ? stored : undefined),
      updateCueDomain: jest.fn(async () => undefined),
    }
    const loader = {
      saveFile: jest.fn(async () => ({ success: true })),
      getModes: () => ['yarg', 'audio', 'rb3'],
    }
    const controllerManager = {
      getConfig: () => config,
      getNodeCueLoader: () => loader,
      refreshAudioCueSelection: jest.fn(),
      refreshRb3CueSelection: jest.fn(),
    }
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
      on: jest.fn(),
    }
    setupNodeCueHandlers(ipcMain as never, controllerManager as never)
    jest.mocked(sendToAllWindows).mockClear()

    await handlers.get(NODE_CUES.SAVE)!(
      {},
      { mode, filename: 'f.json', content: { group: { id: 'newGroup' } } },
    )

    expect(sendToAllWindows).toHaveBeenCalledWith(event, undefined)
  })
})
