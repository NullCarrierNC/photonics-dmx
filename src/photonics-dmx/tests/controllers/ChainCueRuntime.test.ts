import { describe, expect, it, jest } from '@jest/globals'
import { ChainCueRuntime } from '../../controllers/ChainCueRuntime'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { CueType } from '../../cues/types/cueTypes'
import { defaultCueData } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'

describe('ChainCueRuntime', () => {
  const setup = () => {
    const rb3HandleCue = jest.fn<(c: CueType, d: CueData) => Promise<void>>()
    const yargHandleCue = jest.fn<(c: CueType, d: CueData) => Promise<void>>()
    const rb3NotifyStart = jest.fn()
    const rb3StopActiveCue = jest.fn()
    const stopActiveCue = jest.fn()
    const handleSongEvent = jest.fn()
    const fanout = new ChainFanout()
    fanout.setChains([
      {
        rigId: 'a',
        isPrimary: true,
        cueHandlers: {
          yarg: { handleCue: yargHandleCue, stopActiveCue: stopActiveCue },
          rb3: {
            handleCue: rb3HandleCue,
            notifySongStart: rb3NotifyStart,
            stopActiveCue: rb3StopActiveCue,
          },
        },
        sequencer: { handleSongEvent },
      } as unknown as RigChain,
    ])
    return {
      fanout,
      rb3HandleCue,
      yargHandleCue,
      rb3NotifyStart,
      rb3StopActiveCue,
      stopActiveCue,
      handleSongEvent,
    }
  }

  it('fans handleCue to the RB3 handler slot, not the YARG slot', async () => {
    const { fanout, rb3HandleCue, yargHandleCue } = setup()
    await new ChainCueRuntime(fanout, 'rb3').handleCue(CueType.RB3, defaultCueData)
    expect(rb3HandleCue).toHaveBeenCalledWith(CueType.RB3, defaultCueData)
    expect(yargHandleCue).not.toHaveBeenCalled()
  })

  it('fans song notifications to the RB3 handler', () => {
    const { fanout, rb3NotifyStart } = setup()
    new ChainCueRuntime(fanout, 'rb3').notifySongStart()
    expect(rb3NotifyStart).toHaveBeenCalledTimes(1)
  })

  it('routes song events straight to the chain sequencer', () => {
    const { fanout, handleSongEvent } = setup()
    new ChainCueRuntime(fanout, 'rb3').handleSongEvent('led-3')
    expect(handleSongEvent).toHaveBeenCalledWith('led-3')
  })

  it('stopActiveCue fans to the RB3 handler slot, not the YARG slot', () => {
    const { fanout, rb3StopActiveCue, stopActiveCue } = setup()
    new ChainCueRuntime(fanout, 'rb3').stopActiveCue()
    expect(rb3StopActiveCue).toHaveBeenCalledTimes(1)
    expect(stopActiveCue).not.toHaveBeenCalled()
  })
})
