/**
 * Disabling the YARG listener leaves the rig dark and keeps it dark.
 *
 * Driven through the real loader, registry, `RigChain` and `Sequencer` under `VirtualTime`, so the
 * cues submit to real lights. A cue whose graph raises a persistent effect holds a live engine
 * until its handler is shut down, and the rig is cleared only after that.
 */
import * as path from 'path'
import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import { NodeCueLoader } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../../photonics-dmx/cues/node/loader/EffectLoader'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { VirtualTime } from '../../../photonics-dmx/sim/VirtualTime'
import { FrameDriver, type FrameState } from '../../../photonics-dmx/sim/FrameDriver'
import { getCueTypeFromId } from '../../../photonics-dmx/cues/types/cueTypes'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'

// Loads the bundled libraries and runs thousands of virtual frames per cue.
jest.setTimeout(120000)

class FakeUdpSocket extends EventEmitter {
  bind = jest.fn((_port: number, cb?: () => void) => {
    cb?.()
    this.emit('listening')
  })
  close = jest.fn((cb?: () => void) => cb?.())
  address = jest.fn(() => ({ address: '0.0.0.0', port: 36107 }))
}

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => new FakeUdpSocket()),
}))

const LIBRARY = 'yarg-stagekit'
const DEFAULTS_DIR = path.resolve(__dirname, '../../../../resources/defaults')
const FRONT_COUNT = 4
const BACK_COUNT = 4

/** Stage Kit cues whose graphs raise a persistent effect, so each holds a live engine. */
const PERSISTENT_RAISER_CUES = [
  'Cool_Automatic',
  'Warm_Automatic',
  'Sweep',
  'Harmony',
  'Dischord',
  'Menu',
  'Score',
]

function buildConfig(): LightingConfiguration {
  const makeLights = (count: number, group: 'front' | 'back', start: number): DmxLight[] =>
    Array.from({ length: count }, (_, index) => {
      const position = start + index + 1
      const base = position * 4 - 3
      return {
        id: `${group}-${position}`,
        name: `${group} ${position}`,
        label: `${group} ${position}`,
        isStrobeEnabled: false,
        universe: 1,
        fixture: FixtureTypes.RGB,
        group,
        position,
        channels: { red: base, green: base + 1, blue: base + 2, masterDimmer: base + 3 },
        fixtureId: `${group}-${position}`,
      } as DmxLight
    })

  return {
    numLights: FRONT_COUNT + BACK_COUNT,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: makeLights(FRONT_COUNT, 'front', 0),
    backLights: makeLights(BACK_COUNT, 'back', FRONT_COUNT),
    strobeLights: [],
  }
}

function makeDeps(chains: RigChain[]): ListenerCoordinatorDeps {
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  return {
    getDmxLightManager: () => chains[0].dmxLightManager,
    getEffectsController: () => chains[0].sequencer,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    getMotionEnabled: () => false,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveRb3MotionCueRef: () => null,
    getRb3MotionCueMinimumHoldMs: () => 5000,
    getRb3MotionCueProbabilityPercent: () => 100,
    getRb3MotionCueDurationRangeSec: () => ({ min: 5, max: 20 }),
    getRb3RotationEnabled: () => true,
    getFallbackCueTimeMs: () => 0,
    setVenuePostProcessing: jest.fn(),
    sendSenderError: jest.fn(),
    sendToAllWindows: jest.fn(),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => 'direct',
  } as unknown as ListenerCoordinatorDeps
}

/** One coordinator, one rig chain and the loaded cue libraries, torn down in afterEach. */
interface Harness {
  coordinator: ListenerCoordinator
  chain: RigChain
  virtualTime: VirtualTime
  lightIds: string[]
  loadedGroupIds: Record<'yarg' | 'rb3', string[]>
}

let active: Harness | null = null

async function harness(): Promise<Harness> {
  const virtualTime = new VirtualTime({ frameStepMs: 10 })
  virtualTime.install()

  getCueRegistry('yarg').reset()
  const loader = new NodeCueLoader({
    baseDir: DEFAULTS_DIR,
    registries: {
      yarg: getCueRegistry('yarg'),
      rb3: getCueRegistry('rb3'),
      audio: AudioCueRegistry.getInstance(),
    },
    effectLoader: new EffectLoader({ baseDir: DEFAULTS_DIR }),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  })
  await loader.loadAll()
  const summaries = loader.getSummary()

  const chain = new RigChain({
    rigId: 'rig-under-test',
    config: buildConfig(),
    clock: virtualTime,
  })
  const coordinator = new ListenerCoordinator(makeDeps([chain]))
  const lightManager = chain.dmxLightManager as DmxLightManager

  active = {
    coordinator,
    chain,
    virtualTime,
    lightIds: lightManager.getLights(['front', 'back'], ['all']).map((light) => light.id),
    loadedGroupIds: {
      yarg: summaries.yarg.map((s) => s.groupId),
      rb3: summaries.rb3.map((s) => s.groupId),
    },
  }
  return active
}

afterEach(async () => {
  const current = active
  active = null
  if (!current) return
  // Every listener and chain is torn down here, so no timer outlives the test.
  await current.coordinator.disableYarg()
  await current.coordinator.disableRb3()
  current.chain.dispose()
  for (const domain of ['yarg', 'rb3'] as const) {
    const registry = getCueRegistry(domain)
    for (const id of current.loadedGroupIds[domain]) {
      registry.unregisterGroup(id)
    }
    registry.reset()
  }
  current.virtualTime.dispose()
})

/** Drive the cue at 30 Hz with 120 BPM beats, the way the listener forwards YARG frames. */
async function runCue(h: Harness, cue: string, durationMs: number): Promise<void> {
  const handler = h.chain.cueHandlers.yarg
  if (!handler) {
    throw new Error('YARG cue handler was not built by the coordinator')
  }
  const cueType = getCueTypeFromId(cue)
  if (!cueType) {
    throw new Error(`Unknown cue '${cue}'`)
  }
  const state: FrameState = { cue: cueType, venue: 'Large', bpm: 120, vocalActive: false }
  const driver = new FrameDriver(handler, () => state, LIBRARY, 'yarg')

  const frameMs = 1000 / 30
  const beatMs = 60000 / 120
  let nextFrame = 0
  let nextBeat = 0
  let beatCount = 0
  for (let elapsed = 0; elapsed < durationMs; elapsed += 10) {
    if (elapsed >= nextBeat) {
      await driver.dispatch({ beat: beatCount % 4 === 0 ? 'Measure' : 'Strong' })
      beatCount++
      nextBeat += beatMs
    }
    if (elapsed >= nextFrame) {
      await driver.dispatch({})
      nextFrame += frameMs
    }
    await h.virtualTime.advance(10)
  }
}

/** Lights whose published state puts colour on stage. */
function litLights(h: Harness): string[] {
  return h.lightIds.filter((id) => {
    const state = h.chain.lightStateManager.getLightState(id)
    if (!state) return false
    return state.intensity > 0 && state.red + state.green + state.blue > 0
  })
}

describe('ListenerCoordinator disableYarg blackout', () => {
  it.each(PERSISTENT_RAISER_CUES)(
    'leaves the rig dark after disabling YARG while %s is running',
    async (cue) => {
      const h = await harness()
      await h.coordinator.enableYargInternal()
      await runCue(h, cue, 2300)
      expect(litLights(h).length).toBeGreaterThan(0)

      await h.coordinator.disableYarg()

      // The sequencer keeps ticking after the toggle, so the rig is sampled well past the
      // blackout rather than only at it.
      for (let step = 0; step < 100; step++) {
        await h.virtualTime.advance(20)
        expect(litLights(h)).toEqual([])
      }
    },
  )
})
