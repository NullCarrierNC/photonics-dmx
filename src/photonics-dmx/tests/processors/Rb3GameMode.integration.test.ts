/**
 * End-to-end RB3 game mode: the real Rb3StageKitCueProcessor + Rb3GameModeManager drive a primary-cue
 * switch on the first Light-1 (led-1) edge AFTER the dwell timer elapses — never before, and not on any
 * other LED. Each switch rotates the primary group (stamped on the dispatched frame) and re-rolls motion
 * via requestMotionRepick. A controllable clock stands in for the monotonic timer.
 */
let mockNowMs = 0
jest.mock('../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import { EventEmitter } from 'events'
import { describe, expect, it, jest } from '@jest/globals'
import { Rb3StageKitCueProcessor } from '../../processors/Rb3StageKitCueProcessor'
import { Rb3ChainRuntime } from '../../controllers/Rb3ChainRuntime'
import { ChainFanout } from '../../controllers/ChainFanout'
import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { CueType } from '../../cues/types/cueTypes'
import type { YargCueRuntime } from '../../listeners/YARG/YargNetworkListener'
import type { RigChain } from '../../controllers/RigChain'
import type { INetCue } from '../../cues/interfaces/INetCue'

/** A StageKit colour-bank packet; leftChannel is the bitmask of `positions`. */
function colourPacket(color: string, positions: number[]): unknown {
  return {
    positions,
    color,
    brightness: 'medium',
    fog: false,
    leftChannel: positions.reduce((m, p) => m | (1 << p), 0),
    rightChannel: 0x80,
    timestamp: 0,
  }
}

const DURATION = { min: 5, max: 5 } // deterministic 5s countdown

describe('RB3 game-mode integration (processor + manager + runtime)', () => {
  function setup(runtime: YargCueRuntime) {
    mockNowMs = 0
    const emitter = new EventEmitter()
    const proc = new Rb3StageKitCueProcessor(runtime, {
      keepaliveMs: null, // drive tick() directly
      getMotionSwitchDurationRangeSec: () => DURATION,
    })
    proc.startListening(emitter)
    const emit = (color: string, positions: number[]) =>
      emitter.emit('stagekit:data', colourPacket(color, positions))
    return { proc, emit }
  }

  it('fires a re-pick only on the first led-1 edge after the timer elapses', () => {
    const requestMotionRepick = jest.fn()
    const runtime = {
      notifySongStart: jest.fn(),
      notifySongEnd: jest.fn(),
      handleCue: jest.fn(async () => {}),
      handleSongEvent: jest.fn(),
      requestMotionRepick,
    } as unknown as YargCueRuntime
    const { proc, emit } = setup(runtime)

    // Song starts and Light 1 turns on (arms the timer; deadline = 0 + 5000).
    emit('red', [0])
    expect(requestMotionRepick).not.toHaveBeenCalled()

    // Before the timer: a keepalive tick doesn't arm, and a led-1 edge doesn't fire.
    mockNowMs = 3000
    proc.tick()
    emit('red', []) // led-1 off edge
    expect(requestMotionRepick).not.toHaveBeenCalled()

    // Past the timer: the tick arms a pending switch; the NEXT led-1 edge fires the re-pick.
    mockNowMs = 6000
    proc.tick()
    expect(requestMotionRepick).not.toHaveBeenCalled()
    emit('red', [0]) // led-1 on edge
    expect(requestMotionRepick).toHaveBeenCalledTimes(1)
  })

  it('does not fire on a non-Light-1 edge even after the timer elapses', () => {
    const requestMotionRepick = jest.fn()
    const runtime = {
      notifySongStart: jest.fn(),
      notifySongEnd: jest.fn(),
      handleCue: jest.fn(async () => {}),
      handleSongEvent: jest.fn(),
      requestMotionRepick,
    } as unknown as YargCueRuntime
    const { proc, emit } = setup(runtime)

    emit('red', [0]) // song start, led-1 on
    mockNowMs = 6000
    proc.tick() // arm pending switch

    // Light 2 toggles (green bit 1) while Light 1 stays on: no led-1 edge -> no re-pick.
    emit('green', [1])
    expect(requestMotionRepick).not.toHaveBeenCalled()

    // A real Light-1 edge then fires it.
    emit('red', [])
    expect(requestMotionRepick).toHaveBeenCalledTimes(1)
  })

  it('rotates the primary group on the switch and stamps it on the dispatched frame', () => {
    const requestMotionRepick = jest.fn()
    const handleCue = jest.fn(async (_cue: CueType, _frame: unknown) => {})
    const runtime = {
      notifySongStart: jest.fn(),
      notifySongEnd: jest.fn(),
      handleCue,
      handleSongEvent: jest.fn(),
      requestMotionRepick,
    } as unknown as YargCueRuntime
    const onPrimaryCueChange = jest.fn()

    mockNowMs = 0
    const emitter = new EventEmitter()
    const proc = new Rb3StageKitCueProcessor(runtime, {
      keepaliveMs: null,
      getMotionSwitchDurationRangeSec: () => DURATION,
      getPrimaryGroupPool: () => ['g1', 'g2'],
      onPrimaryCueChange,
    })
    proc.startListening(emitter)
    const emit = (color: string, positions: number[]) =>
      emitter.emit('stagekit:data', colourPacket(color, positions))

    emit('red', [0]) // song start -> initial primary picked
    const initial = onPrimaryCueChange.mock.calls[0]![0] as string
    expect(['g1', 'g2']).toContain(initial)

    mockNowMs = 6000
    proc.tick() // arm
    emit('red', []) // led-1 edge -> switch

    expect(requestMotionRepick).toHaveBeenCalledTimes(1)
    const rotated = onPrimaryCueChange.mock.calls.at(-1)![0] as string
    expect(rotated).not.toBe(initial) // avoid-repeat rotation across the two groups
    const rb3Frames = handleCue.mock.calls.filter((c) => c[0] === CueType.RB3)
    const lastFrame = rb3Frames.at(-1)![1] as { preferredCueGroup?: string }
    expect(lastFrame.preferredCueGroup).toBe(rotated)
  })

  it('reaches a real cue handler through Rb3ChainRuntime and picks a motion cue', () => {
    const registry = YargCueRegistry.create()
    const motionCue = { onStop: jest.fn(), execute: jest.fn() } as unknown as INetCue
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motionCue)
    jest
      .spyOn(registry, 'findYargMotionCueRef')
      .mockReturnValue({ groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' })

    const sequencer = {
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      handleSongEvent: jest.fn(),
    } as never
    const handler = new YargCueHandler({} as never, sequencer, {
      registry,
      getMotionCueProbabilityPercent: () => 100,
      getMotionCueMinimumHoldMs: () => 0,
    })
    const fanout = new ChainFanout()
    fanout.setChains([
      { isPrimary: true, rb3CueHandler: handler, sequencer } as unknown as RigChain,
    ])
    const runtime = new Rb3ChainRuntime(fanout)

    const proc = (() => {
      mockNowMs = 0
      const emitter = new EventEmitter()
      const p = new Rb3StageKitCueProcessor(runtime, {
        keepaliveMs: null,
        getMotionSwitchDurationRangeSec: () => DURATION,
      })
      p.startListening(emitter)
      return {
        tick: () => p.tick(),
        emit: (color: string, positions: number[]) =>
          emitter.emit('stagekit:data', colourPacket(color, positions)),
      }
    })()

    proc.emit('red', [0]) // song start, led-1 on
    mockNowMs = 6000
    proc.tick() // arm
    proc.emit('red', []) // led-1 edge -> re-pick fans to the handler

    const active = (handler as unknown as { currentMotionCue: INetCue | null }).currentMotionCue
    expect(active).toBe(motionCue)
    expect(registry.getRandomMotionCue).toHaveBeenCalled()
  })
})
