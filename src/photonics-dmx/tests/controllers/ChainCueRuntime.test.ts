import { describe, expect, it, jest } from '@jest/globals'
import { ChainCueRuntime } from '../../controllers/ChainCueRuntime'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { CueType } from '../../cues/types/cueTypes'
import { defaultCueData } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import { resetLogConfiguration, setLogSink } from '../../../shared/logger'

describe('ChainCueRuntime', () => {
  const setup = () => {
    const rb3HandleCue = jest.fn<(c: CueType, d: CueData, token?: object) => Promise<void>>()
    const yargHandleCue = jest.fn<(c: CueType, d: CueData, token?: object) => Promise<void>>()
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
    expect(rb3HandleCue).toHaveBeenCalledWith(CueType.RB3, defaultCueData, expect.any(Object))
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

  describe('a chain whose cue fails', () => {
    const twoChains = (failing: jest.Mock, sibling: jest.Mock): ChainFanout => {
      const fanout = new ChainFanout()
      fanout.setChains(
        [
          { rigId: 'broken', handleCue: failing },
          { rigId: 'fine', handleCue: sibling },
        ].map(
          ({ rigId, handleCue }) =>
            ({
              rigId,
              isPrimary: rigId === 'broken',
              cueHandlers: { yarg: { handleCue } },
            }) as unknown as RigChain,
        ),
      )
      return fanout
    }

    const capturedErrors = (): string[] => {
      const errors: string[] = []
      setLogSink((e) => {
        if (e.level === 'error') errors.push(e.message)
      })
      return errors
    }

    it('reports the failure once and still dispatches the other rigs', async () => {
      const failing = jest.fn(async () => {
        throw new Error('cue would not load')
      })
      const sibling = jest.fn(async () => {})
      const runtime = new ChainCueRuntime(twoChains(failing, sibling), 'yarg')
      const errors = capturedErrors()
      try {
        await runtime.handleCue(CueType.Verse, defaultCueData)
        await runtime.handleCue(CueType.Verse, defaultCueData)
      } finally {
        resetLogConfiguration()
      }

      expect(sibling).toHaveBeenCalledTimes(2)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('broken')
    })

    it('reports the failure again after the rig has run the cue', async () => {
      let fail = true
      const failing = jest.fn(async () => {
        if (fail) throw new Error('cue would not load')
      })
      const runtime = new ChainCueRuntime(
        twoChains(
          failing,
          jest.fn(async () => {}),
        ),
        'yarg',
      )
      const errors = capturedErrors()
      try {
        await runtime.handleCue(CueType.Verse, defaultCueData)
        fail = false
        await runtime.handleCue(CueType.Verse, defaultCueData)
        fail = true
        await runtime.handleCue(CueType.Verse, defaultCueData)
      } finally {
        resetLogConfiguration()
      }

      expect(errors).toHaveLength(2)
    })
  })
})
