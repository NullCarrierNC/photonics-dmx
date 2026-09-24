import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import type { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'

type FakeCue = INetCue & { execute: jest.Mock; onStop: jest.Mock }

function fakeCue(id: string): FakeCue {
  return {
    cueId: id,
    id,
    style: CueStyle.Primary,
    execute: jest.fn(async () => {}),
    onStop: jest.fn(),
  } as unknown as FakeCue
}

function frame(lightingCue: CueType): CueData {
  return { ...defaultCueData, currentScene: 'Gameplay', trackMode: 'tracked', lightingCue }
}

describe('Consistency Window 0 across two rigs', () => {
  let registry: CueRegistry
  let cues: FakeCue[]
  let handlers: CueHandler[]

  beforeEach(() => {
    registry = CueRegistry.create()
    cues = []
    const groupIds = ['g1', 'g2', 'g3']
    for (const id of groupIds) {
      const verse = fakeCue(`${id}-verse`)
      const chorus = fakeCue(`${id}-chorus`)
      cues.push(verse, chorus)
      const group: ICueGroup = {
        id,
        name: id,
        cues: new Map<CueType, INetCue>([
          [CueType.Verse, verse],
          [CueType.Chorus, chorus],
        ]),
      }
      registry.registerGroup(group)
    }
    registry.setEnabledGroups(groupIds)
    registry.setActiveGroups(groupIds)
    registry.setStageKitPriority('random')
    registry.setCueConsistencyWindow(0)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    let flip = 0
    jest.spyOn(Math, 'random').mockImplementation(() => [0, 0.5, 0.99][flip++ % 3])
    handlers = [0, 1].map(
      () =>
        new CueHandler(new DmxLightManager(createMockLightingConfig()), fakeLightingController(), {
          registry,
        }),
    )
  })

  afterEach(() => {
    for (const handler of handlers) handler.shutdown()
    jest.restoreAllMocks()
  })

  const dispatch = async (cueType: CueType): Promise<void> => {
    const token = {}
    for (const handler of handlers) await handler.handleCue(cueType, frame(cueType), token)
  }

  it('plays one instance of a held cue on both rigs and never swaps it', async () => {
    for (let f = 0; f < 30; f++) await dispatch(CueType.Verse)

    const played = cues.filter((c) => c.execute.mock.calls.length > 0)
    expect(played).toHaveLength(1)
    expect(played[0].execute).toHaveBeenCalledTimes(60)
    expect(cues.every((c) => c.onStop.mock.calls.length === 0)).toBe(true)
  })

  it('picks again when the chart moves to another cue and back', async () => {
    await dispatch(CueType.Verse)
    await dispatch(CueType.Chorus)
    await dispatch(CueType.Verse)

    const verses = cues.filter((c) => c.cueId.endsWith('verse') && c.execute.mock.calls.length > 0)
    expect(verses.length).toBeGreaterThan(1)
  })
})
