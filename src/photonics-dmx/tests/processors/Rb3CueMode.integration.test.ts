/**
 * Integration test for RB3 cue mode: drives the processor manager in 'cue' mode from a mock RB3E
 * listener through the RB3 chain runtime, asserting the StageKit packet stream reaches each rig
 * chain's RB3 cue handler (never the YARG slot) as a CueType.RB3 dispatch, LED edges fan out to
 * the sequencer, and menu / song-span events fan to the RB3 handlers.
 */
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ProcessorManager } from '../../processors/ProcessorManager'
import { ChainFanout } from '../../controllers/ChainFanout'
import { ChainCueRuntime } from '../../controllers/ChainCueRuntime'
import type { RigChain } from '../../controllers/RigChain'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'

/** A StageKit colour-bank packet (leftChannel is the raw bitmask derived from the positions). */
function colourPacket(color: string, positions: number[], rightChannel: number): unknown {
  const leftChannel = positions.reduce((m, p) => m | (1 << p), 0)
  return {
    positions,
    color,
    brightness: 'medium',
    fog: false,
    leftChannel,
    rightChannel,
    timestamp: 0,
  }
}

const RC = { red: 0x80, green: 0x40, blue: 0x20, yellow: 0x60 }

describe('RB3 cue mode (integration)', () => {
  let listener: EventEmitter
  let fanout: ChainFanout
  let rb3HandleCue: jest.Mock
  let yargHandleCue: jest.Mock
  let handleSongEvent: jest.Mock
  let notifySongStart: jest.Mock
  let notifySongEnd: jest.Mock
  let playMenuFrame: jest.Mock
  let clear: jest.Mock
  let manager: ProcessorManager

  const startCueMode = (): void => {
    manager = new ProcessorManager(fanout, {
      mode: 'cue',
      cueRuntime: new ChainCueRuntime(fanout, 'rb3'),
    })
    manager.setNetworkListener(listener)
  }

  beforeEach(() => {
    listener = new EventEmitter()
    rb3HandleCue = jest.fn(async () => {})
    yargHandleCue = jest.fn(async () => {})
    handleSongEvent = jest.fn()
    notifySongStart = jest.fn()
    notifySongEnd = jest.fn()
    playMenuFrame = jest.fn()
    clear = jest.fn()
    fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'primary',
        isPrimary: true,
        cueHandlers: {
          yarg: { handleCue: yargHandleCue },
          rb3: { handleCue: rb3HandleCue, notifySongStart, notifySongEnd },
        },
        sequencer: { handleSongEvent },
        rb3MenuCueHandler: { playMenuFrame, clear },
      } as unknown as RigChain,
    ])
  })

  afterEach(() => {
    manager?.destroy()
  })

  it('dispatches CueType.RB3 to the RB3 handler, never the YARG slot', () => {
    startCueMode()

    listener.emit('stagekit:data', colourPacket('red', [0, 2], RC.red))

    const rb3Calls = rb3HandleCue.mock.calls.filter((c) => c[0] === CueType.RB3)
    expect(rb3Calls.length).toBeGreaterThan(0)
    const frame = rb3Calls[rb3Calls.length - 1][1] as CueData
    expect(frame.ledColor).toBe('red')
    expect(frame.ledPositions).toEqual([0, 2])
    expect(yargHandleCue).not.toHaveBeenCalled()
  })

  it('defaults to the RB3 runtime when no cueRuntime is supplied, dispatching to the RB3 slot', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    manager.setNetworkListener(listener)

    listener.emit('stagekit:data', colourPacket('red', [0, 2], RC.red))

    expect(rb3HandleCue.mock.calls.some((c) => c[0] === CueType.RB3)).toBe(true)
    expect(yargHandleCue).not.toHaveBeenCalled()
  })

  it('fans an LED-on edge out to the chain sequencer', () => {
    startCueMode()

    listener.emit('stagekit:data', colourPacket('red', [2], RC.red))

    expect(handleSongEvent).toHaveBeenCalledWith('led-3')
  })

  it('reports cue as the active mode', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    expect(manager.getCurrentMode()).toBe('cue')
  })

  it('drives the menu look on a hub screen and clears it when gameplay begins', () => {
    startCueMode()

    listener.emit('rb3e:screenName', { screenName: 'main_hub_screen' })
    expect(playMenuFrame).toHaveBeenCalled()

    listener.emit('rb3e:gameState', { gameState: 'InGame' })
    expect(clear).toHaveBeenCalled()
  })

  it('a lit colour packet during the menu clears the menu look and renders the RB3 frame', () => {
    startCueMode()

    listener.emit('rb3e:screenName', { screenName: 'song_select_screen' })
    rb3HandleCue.mockClear()

    listener.emit('stagekit:data', colourPacket('blue', [4], RC.blue))
    expect(clear).toHaveBeenCalled()
    expect(rb3HandleCue.mock.calls.some((c) => c[0] === CueType.RB3)).toBe(true)
  })

  it('fans song start and end notifications to the RB3 handler across the song span', () => {
    startCueMode()

    listener.emit('stagekit:data', colourPacket('red', [0], RC.red))
    expect(notifySongStart).toHaveBeenCalledTimes(1)

    listener.emit('rb3e:gameState', { gameState: 'Menus' })
    expect(notifySongEnd).toHaveBeenCalledTimes(1)
  })
})
