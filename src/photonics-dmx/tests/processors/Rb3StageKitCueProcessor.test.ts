/**
 * Drives Rb3StageKitCueProcessor via an EventEmitter (mirroring the RB3E listener) and a mock
 * YargCueRuntime, asserting the accumulated LED bank state and the dispatched cue frames.
 */
import { EventEmitter } from 'events'
import { describe, expect, it, jest } from '@jest/globals'
import { Rb3StageKitCueProcessor } from '../../processors/Rb3StageKitCueProcessor'
import type { YargCueRuntime } from '../../listeners/YARG/YargNetworkListener'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'

function mockRuntime(): {
  runtime: YargCueRuntime
  calls: Array<{ cueType: CueType; frame: CueData }>
} {
  const calls: Array<{ cueType: CueType; frame: CueData }> = []
  const runtime: YargCueRuntime = {
    notifySongStart: jest.fn(),
    notifySongEnd: jest.fn(),
    handleBeat: jest.fn(),
    handleMeasure: jest.fn(),
    handleKeyframeFirst: jest.fn(),
    handleKeyframeNext: jest.fn(),
    handleKeyframePrevious: jest.fn(),
    handleCue: jest.fn(async (cueType: CueType, frame: CueData) => {
      calls.push({ cueType, frame })
    }) as YargCueRuntime['handleCue'],
    handleDrumNote: jest.fn(),
    handleGuitarNote: jest.fn(),
    handleBassNote: jest.fn(),
    handleKeysNote: jest.fn(),
    handleVocalNote: jest.fn(),
  }
  return { runtime, calls }
}

/** A StageKit colour-bank packet. */
function colourPacket(color: string, positions: number[], rightChannel: number): unknown {
  return { positions, color, brightness: 'medium', fog: false, rightChannel, timestamp: 0 }
}

const RC = { red: 0x80, green: 0x40, blue: 0x20, yellow: 0x60 }

function setup(keepaliveMs: number | null = null): {
  emitter: EventEmitter
  proc: Rb3StageKitCueProcessor
  calls: Array<{ cueType: CueType; frame: CueData }>
} {
  const emitter = new EventEmitter()
  const { runtime, calls } = mockRuntime()
  const proc = new Rb3StageKitCueProcessor(runtime, { keepaliveMs })
  proc.startListening(emitter)
  return { emitter, proc, calls }
}

const lastRb3 = (calls: Array<{ cueType: CueType; frame: CueData }>): CueData | undefined =>
  [...calls].reverse().find((c) => c.cueType === CueType.RB3)?.frame

describe('Rb3StageKitCueProcessor', () => {
  it('builds an RB3 frame from a colour-bank packet', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('red', [0, 2], RC.red))
    const frame = lastRb3(calls)!
    expect(frame.lightingCue).toBe(CueType.RB3)
    expect(frame.ledBanks).toEqual({ red: 0b101, green: 0, blue: 0, yellow: 0 })
    expect(frame.ledColor).toBe('red')
    expect(frame.ledPositions).toEqual([0, 2])
  })

  it('replaces a colour bank rather than OR-ing it', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('red', [0, 1], RC.red))
    emitter.emit('stagekit:data', colourPacket('red', [2], RC.red))
    expect(lastRb3(calls)!.ledBanks!.red).toBe(0b100) // replaced, not 0b111
  })

  it('keeps the other banks when one colour is updated', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('red', [0], RC.red))
    emitter.emit('stagekit:data', colourPacket('blue', [1], RC.blue))
    expect(lastRb3(calls)!.ledBanks).toEqual({ red: 0b1, green: 0, blue: 0b10, yellow: 0 })
  })

  it('clears a bank on an empty-position packet for that colour', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('red', [0, 1], RC.red))
    emitter.emit('stagekit:data', colourPacket('red', [], RC.red))
    const frame = lastRb3(calls)!
    expect(frame.ledBanks!.red).toBe(0)
    expect(frame.ledColor).toBe('off')
  })

  it('routes strobe commands to the strobe cue and leaves banks intact', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('green', [3], RC.green))
    calls.length = 0
    emitter.emit('stagekit:data', {
      positions: [],
      color: 'off',
      brightness: 'medium',
      fog: false,
      strobeEffect: 'fast',
      rightChannel: 0x05,
      timestamp: 0,
    })
    expect(calls.some((c) => c.cueType === CueType.Strobe_Fast)).toBe(true)
    // No RB3 recolour dispatched by the strobe packet; the green bank is untouched next time.
    emitter.emit('stagekit:data', colourPacket('red', [0], RC.red))
    expect(lastRb3(calls)!.ledBanks).toEqual({ red: 0b1, green: 0b1000, blue: 0, yellow: 0 })
  })

  it('DisableAll (0xFF) blanks everything and fires Strobe_Off', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', colourPacket('red', [0, 1], RC.red))
    calls.length = 0
    emitter.emit('stagekit:data', {
      positions: [],
      color: 'off',
      brightness: 'medium',
      fog: false,
      strobeEffect: 'off',
      rightChannel: 0xff,
      timestamp: 0,
    })
    expect(calls.some((c) => c.cueType === CueType.Strobe_Off)).toBe(true)
    const frame = lastRb3(calls)!
    expect(frame.ledBanks).toEqual({ red: 0, green: 0, blue: 0, yellow: 0 })
    expect(frame.fogState).toBe(false)
  })

  it('reflects fog state on the frame', () => {
    const { emitter, calls } = setup()
    emitter.emit('stagekit:data', {
      positions: [0],
      color: 'red',
      brightness: 'medium',
      fog: true,
      rightChannel: RC.red,
      timestamp: 0,
    })
    expect(lastRb3(calls)!.fogState).toBe(true)
  })

  it('blanks on the menu transition and ignores packets while in a menu', () => {
    const { emitter, calls } = setup()
    emitter.emit('rb3e:gameState', { gameState: 'Menus' })
    expect(calls.some((c) => c.cueType === CueType.Blackout_Fast)).toBe(true)
    calls.length = 0
    emitter.emit('stagekit:data', colourPacket('red', [0], RC.red))
    expect(calls).toHaveLength(0) // ignored while in menu
    emitter.emit('rb3e:gameState', { gameState: 'InGame' })
    emitter.emit('stagekit:data', colourPacket('red', [0], RC.red))
    expect(lastRb3(calls)!.ledBanks!.red).toBe(0b1)
  })

  it('keepalive tick re-dispatches the current look (and strobe when active)', () => {
    const { emitter, proc, calls } = setup(null)
    emitter.emit('stagekit:data', {
      positions: [],
      color: 'off',
      brightness: 'medium',
      fog: false,
      strobeEffect: 'slow',
      rightChannel: 0x03,
      timestamp: 0,
    })
    calls.length = 0
    proc.tick()
    expect(calls.some((c) => c.cueType === CueType.RB3)).toBe(true)
    expect(calls.some((c) => c.cueType === CueType.Strobe_Slow)).toBe(true)
  })

  it('stops dispatching after stopListening', () => {
    const { emitter, proc, calls } = setup()
    proc.stopListening()
    emitter.emit('stagekit:data', colourPacket('red', [0], RC.red))
    expect(calls).toHaveLength(0)
  })
})
