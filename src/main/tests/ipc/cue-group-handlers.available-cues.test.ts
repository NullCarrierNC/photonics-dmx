import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { CueStyle, type INetCue } from '../../../photonics-dmx/cues/interfaces/INetCue'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import { LIGHT } from '../../../shared/ipcChannels'
import { setupCueGroupHandlers } from '../../ipc/cue-group-handlers'

type Handler = (...args: unknown[]) => unknown

function makeCue(description: string): INetCue {
  return {
    id: description,
    cueId: description,
    description,
    style: CueStyle.Primary,
    execute: async () => {},
    onStop: () => {},
    onPause: () => {},
  }
}

function registerGroups(registry: CueRegistry): void {
  registry.registerGroup({
    id: 'first',
    name: 'First',
    cues: new Map([[CueType.Default, makeCue('first default')]]),
  })
  registry.registerGroup({
    id: 'chosen',
    name: 'Chosen',
    cues: new Map([[CueType.Chorus, makeCue('chosen chorus')]]),
  })
  registry.setDefaultGroup('chosen')
}

describe.each([
  { domain: 'yarg' as const, channel: LIGHT.GET_AVAILABLE_CUES },
  { domain: 'rb3' as const, channel: LIGHT.GET_AVAILABLE_RB3_CUES },
])('$channel', ({ domain, channel }) => {
  let registry: CueRegistry
  let handlers: Map<string, Handler>

  beforeEach(() => {
    registry = getCueRegistry(domain)
    registry.reset()
    registerGroups(registry)
    handlers = new Map()
    const ipcMain = {
      handle: (name: string, fn: Handler) => handlers.set(name, fn),
      on: jest.fn(),
    }
    setupCueGroupHandlers(ipcMain as never, { getLifecyclePhase: () => 'running' } as never)
  })

  afterEach(() => {
    registry.reset()
  })

  it('lists the cues of the requested group', async () => {
    const result = await handlers.get(channel)!({}, 'first')
    expect(result).toEqual([
      {
        id: CueType.Default,
        yargDescription: 'first default',
        rb3Description: 'first default',
        groupName: 'First',
      },
    ])
  })

  it.each([undefined, '', '  '])('lists the default group for the group id %p', async (groupId) => {
    const result = await handlers.get(channel)!({}, groupId)
    expect(result).toEqual([
      {
        id: CueType.Chorus,
        yargDescription: 'chosen chorus',
        rb3Description: 'chosen chorus',
        groupName: 'Chosen',
      },
    ])
  })

  it('answers an empty list for an unknown group', async () => {
    expect(await handlers.get(channel)!({}, 'missing')).toEqual([])
  })
})
