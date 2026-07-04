import { describe, expect, it, jest } from '@jest/globals'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'
import type { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import type { INetCue } from '../../../photonics-dmx/cues/interfaces/INetCue'

function fanoutStub(chains: unknown[] = []) {
  return {
    getChains: () => chains,
    yargSchedulePanTiltClear: jest.fn(),
  } as unknown as ChainFanout
}

function cueStub() {
  return { onStop: jest.fn(), execute: jest.fn() } as unknown as INetCue & {
    onStop: jest.Mock
    execute: jest.Mock
  }
}

describe('MotionCueSimulator', () => {
  it('runs the active YARG cue once per chain', async () => {
    const chains = [
      { sequencer: 's1', dmxLightManager: 'l1' },
      { sequencer: 's2', dmxLightManager: 'l2' },
    ]
    const sim = new MotionCueSimulator({ getChainFanout: () => fanoutStub(chains) })
    const cue = cueStub()
    sim.setYargCue(cue)
    await sim.runYarg({} as never)
    expect(cue.execute).toHaveBeenCalledTimes(2)
  })

  it('reset() stops the active cue so it no longer runs (the restart fix)', async () => {
    const sim = new MotionCueSimulator({ getChainFanout: () => fanoutStub([{ sequencer: 's' }]) })
    const cue = cueStub()
    sim.setYargCue(cue)
    expect(sim.hasYargActive()).toBe(true)

    sim.reset()

    expect(cue.onStop).toHaveBeenCalledTimes(1)
    expect(sim.hasYargActive()).toBe(false)
    await sim.runYarg({} as never)
    expect(cue.execute).not.toHaveBeenCalled() // nothing runs against the torn-down chains
  })

  it('stop() clears state AND schedules a pan/tilt clear (unlike reset)', () => {
    const fanout = fanoutStub()
    const sim = new MotionCueSimulator({ getChainFanout: () => fanout })
    sim.setYargCue(cueStub())
    sim.stop()
    expect(sim.hasYargActive()).toBe(false)
    expect(fanout.yargSchedulePanTiltClear as jest.Mock).toHaveBeenCalledTimes(1)
  })
})
