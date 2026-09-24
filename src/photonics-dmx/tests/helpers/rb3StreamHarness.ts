import { EventEmitter } from 'events'
import { jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { PublisherTiming } from '../../controllers/DmxPublisher'
import { RigChain } from '../../controllers/RigChain'
import { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import {
  parseStageKitData,
  type StageKitPersistentState,
} from '../../listeners/RB3/rb3ePacketParser'
import { Rb3StageKitDirectProcessor } from '../../processors/Rb3StageKitDirectProcessor'
import type { DmxRig, RGBIO } from '../../types'
import { ManualTestClock } from './sequencerHarness'
import { createRecordingPublisher, type RecordingPublisher } from './recordingPublisher'
import { createMockDmxLight, createMockLightingConfig } from './testFixtures'

/** Light indices (0-based, front row) that are strobe-enabled. */
const RB3_STREAM_STROBE_LIGHTS = [0, 4]

/** What one light put on the wire. Light `i` owns channels 1 + 4i to 4 + 4i. */
interface WireLevel {
  dimmer: number
  red: number
  green: number
  blue: number
}

export interface Rb3StreamHarnessOptions {
  /** Render clock interval. Defaults to 10 ms. */
  clockMs?: number
  /** The publisher's output rate, which the processor's strobes also see. Omitted, every frame
   *  goes straight out. */
  outputRateHz?: number
  /** False leaves the listener with no processor, for a test that attaches its own. */
  directProcessor?: boolean
  /**
   * Runs the publisher's rate-governor timers only between render ticks, the way a main thread busy
   * with each frame gets to them.
   */
  governorTimersOnTick?: boolean
}

export interface Rb3StreamHarness {
  listener: EventEmitter
  chain: RigChain
  fanout: ChainFanout
  processor: Rb3StageKitDirectProcessor | null
  wire: RecordingPublisher
  /** Emits an RB3E game-state event. */
  gameState: (state: 'Menus' | 'InGame') => void
  /** Emits a StageKit datagram's two bytes as the listener parses them, strobe and fog carried. */
  stageKit: (left: number, right: number) => void
  /** Advances wall time a millisecond at a time, ticking the render clock on its interval. */
  step: (ms: number, onTick?: (nowMs: number) => void) => Promise<void>
  /** Menu frames painted so far (each sets the menu base). */
  menuFrames: () => number
  lightState: (index: number) => RGBIO | null
  wireLevel: (index: number) => WireLevel | null
  cleanup: () => void
}

/** Timers that fire only when `runDue` is called, in the order they fell due. */
class TickServicedTimers implements PublisherTiming {
  private pending = new Map<ReturnType<typeof setTimeout>, { dueAt: number; cb: () => void }>()

  constructor(public readonly now: () => number) {}

  setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
    // A real (fake-timer) handle that does nothing, so the handle type needs no stand-in.
    const handle = setTimeout(() => {}, ms)
    this.pending.set(handle, { dueAt: this.now() + ms, cb })
    return handle
  }

  clearTimer(handle: ReturnType<typeof setTimeout>): void {
    clearTimeout(handle)
    this.pending.delete(handle)
  }

  runDue(): void {
    const due = [...this.pending.entries()]
      .filter(([, timer]) => timer.dueAt <= this.now())
      .sort(([, a], [, b]) => a.dueAt - b.dueAt)
    for (const [handle, timer] of due) {
      this.pending.delete(handle)
      timer.cb()
    }
  }
}

/**
 * RB3 direct mode as it runs in the app, driven by a StageKit stream: a real RigChain (sequencer,
 * transition controller, light state) on a hand-ticked clock, the RB3 menu handler, the direct
 * processor on the chain fanout and a recording publisher. Eight front lights, two strobe-enabled.
 * Installs fake timers and a controlled `performance.now`, both undone by `cleanup`.
 */
export function createRb3StreamHarness(options: Rb3StreamHarnessOptions = {}): Rb3StreamHarness {
  const clockMs = options.clockMs ?? 10
  jest.useFakeTimers({ doNotFake: ['performance'] })
  let now = 1
  jest.spyOn(performance, 'now').mockImplementation(() => now)
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    jest.spyOn(console, level).mockImplementation(() => {})
  }

  const front = Array.from({ length: 8 }, (_, i) =>
    createMockDmxLight({
      id: `f${i + 1}`,
      fixtureId: `f${i + 1}`,
      position: i + 1,
      isStrobeEnabled: RB3_STREAM_STROBE_LIGHTS.includes(i),
      channels: { masterDimmer: 1 + 4 * i, red: 2 + 4 * i, green: 3 + 4 * i, blue: 4 + 4 * i },
    }),
  )
  const config = createMockLightingConfig({
    numLights: front.length,
    frontLights: front,
    backLights: [],
    strobeLights: RB3_STREAM_STROBE_LIGHTS.map((i) => front[i]),
  })
  const clock = new ManualTestClock(clockMs)
  const chain = new RigChain({ rigId: 'rig-a', config, clock })
  chain.rb3MenuCueHandler = new Rb3MenuCueHandler(chain.dmxLightManager, chain.sequencer)
  const setEffect = jest.spyOn(chain.sequencer, 'setEffect')
  const fanout = new ChainFanout()
  fanout.setChains([chain])

  const governorTimers = options.governorTimersOnTick ? new TickServicedTimers(() => now) : null
  const rig: DmxRig = { id: 'rig-a', name: 'A', active: true, config }
  const wire = createRecordingPublisher({
    rigs: [rig],
    chains: [chain],
    strobeState: fanout.strobeState,
    outputRateHz: options.outputRateHz,
    timing: governorTimers ?? undefined,
  })

  const listener = new EventEmitter()
  let processor: Rb3StageKitDirectProcessor | null = null
  if (options.directProcessor !== false) {
    const outputRateHz = options.outputRateHz ?? 0
    processor = new Rb3StageKitDirectProcessor(fanout, {}, fanout, () => outputRateHz)
    processor.startListening(listener)
  }

  let stageKitState: StageKitPersistentState = { strobeState: 'Strobe_Off', fogState: false }

  return {
    listener,
    chain,
    fanout,
    processor,
    wire,
    gameState: (state) =>
      listener.emit('rb3e:gameState', {
        gameState: state,
        platform: 'RB3E',
        timestamp: now,
        cueData: null,
      }),
    stageKit: (left, right) => {
      const parsed = parseStageKitData(left, right, stageKitState, now)
      stageKitState = parsed.state
      listener.emit('stagekit:data', parsed.data)
    },
    step: async (ms, onTick) => {
      for (let i = 0; i < ms; i++) {
        now += 1
        await jest.advanceTimersByTimeAsync(1)
        if (now % clockMs === 0) {
          governorTimers?.runDue()
          clock.tick(clockMs)
          await jest.advanceTimersByTimeAsync(0)
          onTick?.(now)
        }
      }
    },
    menuFrames: () => setEffect.mock.calls.filter(([name]) => name === 'rb3-menu-base').length,
    lightState: (index) => chain.lightStateManager.getLightState(`f${index + 1}`),
    wireLevel: (index) => {
      const buffer = wire.last()
      if (!buffer) return null
      const base = 1 + 4 * index
      return {
        dimmer: buffer[base] ?? 0,
        red: buffer[base + 1] ?? 0,
        green: buffer[base + 2] ?? 0,
        blue: buffer[base + 3] ?? 0,
      }
    },
    cleanup: () => {
      processor?.stopListening(listener)
      processor?.destroy()
      wire.shutdown()
      chain.dispose()
      jest.useRealTimers()
      jest.restoreAllMocks()
    },
  }
}
