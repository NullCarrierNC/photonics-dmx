/**
 * Integration test for RB3 cue mode: drives the processor manager in 'cue' mode from a mock RB3E
 * listener through a real ChainFanout, asserting the StageKit packet stream reaches each rig
 * chain's YargCueHandler as a CueType.RB3 dispatch and that LED edges fan out to the sequencer.
 */
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ProcessorManager } from '../../processors/ProcessorManager'
import { ChainFanout } from '../../controllers/ChainFanout'
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
  let handleCue: jest.Mock
  let handleSongEvent: jest.Mock
  let playMenuFrame: jest.Mock
  let clear: jest.Mock
  let manager: ProcessorManager

  beforeEach(() => {
    listener = new EventEmitter()
    handleCue = jest.fn(async () => {})
    handleSongEvent = jest.fn()
    playMenuFrame = jest.fn()
    clear = jest.fn()
    fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'primary',
        isPrimary: true,
        yargCueHandler: { handleCue },
        sequencer: { handleSongEvent },
        rb3MenuCueHandler: { playMenuFrame, clear },
      } as unknown as RigChain,
    ])
  })

  afterEach(() => {
    manager?.destroy()
  })

  it('dispatches CueType.RB3 to the chain handler for each StageKit packet', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    manager.setNetworkListener(listener)

    listener.emit('stagekit:data', colourPacket('red', [0, 2], RC.red))

    const rb3Calls = handleCue.mock.calls.filter((c) => c[0] === CueType.RB3)
    expect(rb3Calls.length).toBeGreaterThan(0)
    const frame = rb3Calls[rb3Calls.length - 1][1] as CueData
    expect(frame.ledColor).toBe('red')
    expect(frame.ledPositions).toEqual([0, 2])
  })

  it('fans an LED-on edge out to the chain sequencer', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    manager.setNetworkListener(listener)

    listener.emit('stagekit:data', colourPacket('red', [2], RC.red))

    expect(handleSongEvent).toHaveBeenCalledWith('led-3')
  })

  it('reports cue as the active mode', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    expect(manager.getCurrentMode()).toBe('cue')
  })

  it('drives the menu look on a hub screen and clears it when gameplay begins', () => {
    manager = new ProcessorManager(fanout, { mode: 'cue' })
    manager.setNetworkListener(listener)

    listener.emit('rb3e:screenName', { screenName: 'main_hub_screen' })
    expect(playMenuFrame).toHaveBeenCalled()

    listener.emit('rb3e:gameState', { gameState: 'InGame' })
    expect(clear).toHaveBeenCalled()
  })
})
