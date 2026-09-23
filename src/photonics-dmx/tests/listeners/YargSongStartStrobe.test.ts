import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { CueHandler } from '../../cueHandlers/CueHandler'
import type { CueRuntime } from '../../cueHandlers/CueRuntime'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { CueType, defaultCueData, type CueData } from '../../cues/types/cueTypes'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import type { DmxLightManager } from '../../controllers/DmxLightManager'
import { fakeLightingController } from '../helpers/fakeLightingController'

type FakeCue = INetCue & { execute: jest.Mock }

const fakeCue = (style: CueStyle, id: string): FakeCue =>
  ({ cueId: id, id, style, execute: jest.fn(), onStop: jest.fn() }) as unknown as FakeCue

const frame = (fields: Partial<CueData>): CueData => ({
  ...defaultCueData,
  trackMode: 'tracked',
  ...fields,
})

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('a YARG song that opens on a strobe', () => {
  const running: Array<{ listener: YargNetworkListener; handler: CueHandler }> = []

  afterEach(async () => {
    for (const { listener, handler } of running.splice(0)) {
      await listener.shutdown()
      handler.shutdown()
    }
  })

  it('plays the strobe on the first gameplay frames, which still carry the menu cue', async () => {
    const registry = CueRegistry.create()
    const menu = fakeCue(CueStyle.Primary, 'menu')
    const strobe = fakeCue(CueStyle.Secondary, 'strobe')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType: CueType) =>
        String(cueType).startsWith('Strobe') ? strobe : menu,
      )
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(null)
    const handler = new CueHandler({} as DmxLightManager, fakeLightingController(), { registry })
    handler.setMotionEnabled(false)
    const listener = new YargNetworkListener(handler as unknown as CueRuntime, {
      getFallbackCueTimeMs: () => 0,
    })
    running.push({ listener, handler })

    listener.processCueData(frame({ currentScene: 'Menu', lightingCue: CueType.Menu }))
    await settle()
    listener.processCueData(
      frame({ currentScene: 'Gameplay', lightingCue: CueType.Menu, strobeState: 'Strobe_Fast' }),
    )
    await settle()

    expect(strobe.execute).toHaveBeenCalled()
  })
})
