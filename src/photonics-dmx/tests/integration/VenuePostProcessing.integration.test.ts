/**
 * The whole venue post-processing path in one piece: real YARG packet bytes into the real listener,
 * the listener's callback into a real DmxPublisher, and the resulting DMX channel values on the
 * wire. Proves the wiring the unit tests stub either side of.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import { VenueFrameProcessor } from '../../controllers/VenueFrameProcessor'
import { PostProcessingByte, SceneIndexByte } from '../../listeners/YARG/yargTypes'
import type { CueRuntime } from '../../cueHandlers/CueRuntime'
import { ConfigStrobeType, FixtureTypes, type DmxRig, type RGBIO } from '../../types'
import { buildYargPacket } from '../helpers/yargPacket'

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    bind: (_port: number, cb: () => void) => cb(),
    close: (cb?: () => void) => cb?.(),
    on: jest.fn(),
  })),
}))

const RED: RGBIO = {
  red: 255,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

const DARK: RGBIO = {
  red: 0,
  green: 0,
  blue: 0,
  intensity: 0,
  opacity: 1,
  blendMode: 'replace',
}

/** Two fixtures side by side, so a bleed has somewhere to spill to. */
function makeRig(): DmxRig {
  const lights = [
    { id: 'f1', channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } },
    { id: 'f2', channels: { masterDimmer: 5, red: 6, green: 7, blue: 8 } },
  ].map((light, index) => ({
    id: light.id,
    fixtureId: `tpl-${light.id}`,
    position: index + 1,
    name: light.id,
    label: light.id,
    fixture: FixtureTypes.RGB,
    isStrobeEnabled: false,
    group: 'front' as const,
    universe: 1,
    mount: 'floor' as const,
    channels: light.channels,
  }))
  return {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: lights.length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: lights as unknown as DmxRig['config']['frontLights'],
      backLights: [],
      strobeLights: [],
    },
  }
}

function noopRuntime(): CueRuntime {
  return {
    notifySongStart: jest.fn(),
    notifySongEnd: jest.fn(),
    handleBeat: jest.fn(),
    handleMeasure: jest.fn(),
    handleKeyframeFirst: jest.fn(),
    handleKeyframeNext: jest.fn(),
    handleKeyframePrevious: jest.fn(),
    handleCue: jest.fn(async () => {}),
    handleDrumNote: jest.fn(),
    handleGuitarNote: jest.fn(),
    handleBassNote: jest.fn(),
    handleKeysNote: jest.fn(),
    handleVocalNote: jest.fn(),
    stopActiveStrobe: jest.fn(),
    resetSessionState: jest.fn(),
  } as unknown as CueRuntime
}

function setup(): {
  feedPacket: (postProcessing: number) => void
  litColour: () => [number, number, number]
  neighbourColour: () => [number, number, number]
  neighbourEmitted: () => number
  listener: YargNetworkListener
} {
  const sender = {
    send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => false,
    sendIpc: jest.fn(),
  }
  const venue = new VenueFrameProcessor()
  const publisher = new DmxPublisher(
    sender as unknown as SenderManager,
    new LightStateManager(),
    undefined,
    { frameProcessor: venue },
  )
  publisher.updateActiveRigs([makeRig()])

  const listener = new YargNetworkListener(noopRuntime(), {
    onVenuePostProcessing: (state) => venue.setVenuePostProcessing(state),
  })

  return {
    feedPacket(postProcessing) {
      const packet = buildYargPacket({
        datagramVersion: 5,
        scene: SceneIndexByte.Gameplay,
        postProcessing,
        playerStarPower: [],
      })
      ;(listener as unknown as { deserializePacket(b: Buffer): void }).deserializePacket(packet)
    },
    litColour() {
      const buffer = publishFrame()
      return [buffer[2]!, buffer[3]!, buffer[4]!]
    },
    neighbourColour() {
      const buffer = publishFrame()
      return [buffer[6]!, buffer[7]!, buffer[8]!]
    },
    /** Red the neighbour actually puts out, which is its colour scaled by the master dimmer. */
    neighbourEmitted() {
      const buffer = publishFrame()
      return (buffer[6]! * buffer[5]!) / 255
    },
    listener,
  }

  function publishFrame(): Record<number, number> {
    publisher.publish(
      new Map([
        ['f1', RED],
        ['f2', DARK],
      ]),
    )
    const calls = sender.send.mock.calls
    return calls[calls.length - 1]![1] as Record<number, number>
  }
}

describe('venue post-processing end to end', () => {
  it('greys the rig when a packet reports BlackAndWhite', async () => {
    const ctx = setup()
    expect(ctx.litColour()).toEqual([255, 0, 0])

    ctx.feedPacket(PostProcessingByte.BlackAndWhite)
    expect(ctx.litColour()).toEqual([76, 76, 76])

    await ctx.listener.shutdown()
  })

  it('tints the rig when a packet reports SepiaTone', async () => {
    const ctx = setup()
    ctx.feedPacket(PostProcessingByte.SepiaTone)
    const [r, g, b] = ctx.litColour()
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)

    await ctx.listener.shutdown()
  })

  it('returns to cue colour when the packet goes back to Default', async () => {
    const ctx = setup()
    ctx.feedPacket(PostProcessingByte.BlackAndWhite)
    expect(ctx.litColour()).toEqual([76, 76, 76])

    ctx.feedPacket(PostProcessingByte.Default)
    expect(ctx.litColour()).toEqual([255, 0, 0])

    await ctx.listener.shutdown()
  })

  it('returns to cue colour when the listener stops', async () => {
    const ctx = setup()
    ctx.feedPacket(PostProcessingByte.BlackAndWhite)
    expect(ctx.litColour()).toEqual([76, 76, 76])

    await ctx.listener.stop()
    expect(ctx.litColour()).toEqual([255, 0, 0])
  })

  it('spills onto a dark neighbour when a packet reports Bloom', async () => {
    const ctx = setup()
    expect(ctx.neighbourColour()).toEqual([0, 0, 0])

    ctx.feedPacket(PostProcessingByte.Bloom)
    const [r, g, b] = ctx.neighbourColour()
    // Colour carries the hue at full and the master dimmer carries the level, so the wash is
    // attenuated once rather than twice.
    expect(r).toBe(255)
    expect([g, b]).toEqual([0, 0])
    expect(ctx.neighbourEmitted()).toBeGreaterThan(60)
    expect(ctx.neighbourEmitted()).toBeLessThan(255)

    ctx.feedPacket(PostProcessingByte.Default)
    expect(ctx.neighbourColour()).toEqual([0, 0, 0])

    await ctx.listener.shutdown()
  })
})
