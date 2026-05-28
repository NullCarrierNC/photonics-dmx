/**
 * End-to-end fanout: a listener-style event fires through `ChainFanout` and lands on every
 * chain's cue handler, which in turn drives that chain's sequencer. This pins the wiring
 * between a network listener / processor and the per-rig pipeline without standing up
 * actual UDP sockets or the cue loader.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../controllers/RigChain'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { makeTwoRigs } from '../helpers/multiRigFixtures'
import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import { DrumNoteType, InstrumentNoteType } from '../../cues/types/cueTypes'
import type { Clock } from '../../controllers/sequencer/Clock'

describe('ChainFanout end-to-end (listener → fanout → per-chain handlers → per-chain sequencers)', () => {
  let chains: RigChain[] = []

  afterEach(async () => {
    for (const c of chains) {
      await c.dispose()
    }
    chains = []
  })

  function buildChains(): RigChain[] {
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 4 })
    const clock = new ManualTestClock() as unknown as Clock
    const chainA = new RigChain({ rigId: rigA.id, config: rigA.config, clock, isPrimary: true })
    const chainB = new RigChain({ rigId: rigB.id, config: rigB.config, clock, isPrimary: false })
    chainA.yargCueHandler = new YargCueHandler(chainA.dmxLightManager, chainA.sequencer)
    chainB.yargCueHandler = new YargCueHandler(chainB.dmxLightManager, chainB.sequencer)
    chains = [chainA, chainB]
    return chains
  }

  it('handleBeat reaches every chain handler, which forwards to its own sequencer', () => {
    const [a, b] = buildChains()
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aOnBeat = jest.spyOn(a.sequencer, 'onBeat')
    const bOnBeat = jest.spyOn(b.sequencer, 'onBeat')

    fanout.handleBeat()

    expect(aOnBeat).toHaveBeenCalledTimes(1)
    expect(bOnBeat).toHaveBeenCalledTimes(1)
  })

  it('notifySongStart reaches every chain handler', () => {
    const [a, b] = buildChains()
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aSongStart = jest.spyOn(a.yargCueHandler!, 'notifySongStart')
    const bSongStart = jest.spyOn(b.yargCueHandler!, 'notifySongStart')

    fanout.notifySongStart()

    expect(aSongStart).toHaveBeenCalledTimes(1)
    expect(bSongStart).toHaveBeenCalledTimes(1)
  })

  it('drum/guitar/bass/keys note events fan out to every chain handler', () => {
    const [a, b] = buildChains()
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const cueData = {} as Parameters<typeof fanout.handleDrumNote>[1]
    const aDrum = jest.spyOn(a.yargCueHandler!, 'handleDrumNote')
    const bDrum = jest.spyOn(b.yargCueHandler!, 'handleDrumNote')
    const aGuitar = jest.spyOn(a.yargCueHandler!, 'handleGuitarNote')
    const bGuitar = jest.spyOn(b.yargCueHandler!, 'handleGuitarNote')

    fanout.handleDrumNote(DrumNoteType.Kick, cueData)
    fanout.handleGuitarNote(InstrumentNoteType.Green, cueData)

    expect(aDrum).toHaveBeenCalledWith(DrumNoteType.Kick, cueData)
    expect(bDrum).toHaveBeenCalledWith(DrumNoteType.Kick, cueData)
    expect(aGuitar).toHaveBeenCalledWith(InstrumentNoteType.Green, cueData)
    expect(bGuitar).toHaveBeenCalledWith(InstrumentNoteType.Green, cueData)
  })

  it('audioOnBeat reaches every chain sequencer even if no audio handler is attached', () => {
    const [a, b] = buildChains()
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aOnBeat = jest.spyOn(a.sequencer, 'onBeat')
    const bOnBeat = jest.spyOn(b.sequencer, 'onBeat')

    fanout.audioOnBeat()

    expect(aOnBeat).toHaveBeenCalledTimes(1)
    expect(bOnBeat).toHaveBeenCalledTimes(1)
  })

  it('audio cue lifecycle (sync + handle data) reaches every chain audio handler', async () => {
    const [a, b] = buildChains()
    a.audioCueHandler = new AudioCueHandler(a.dmxLightManager, a.sequencer)
    b.audioCueHandler = new AudioCueHandler(b.dmxLightManager, b.sequencer)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aSync = jest.spyOn(a.audioCueHandler, 'syncSlots')
    const bSync = jest.spyOn(b.audioCueHandler, 'syncSlots')

    fanout.audioSyncSlots('test-cue' as never, null, null, false)

    expect(aSync).toHaveBeenCalledTimes(1)
    expect(bSync).toHaveBeenCalledTimes(1)
  })

  it('RB3 menu frame reaches every chain RB3 handler', () => {
    const [a, b] = buildChains()
    a.rb3MenuCueHandler = new Rb3MenuCueHandler(a.dmxLightManager, a.sequencer)
    b.rb3MenuCueHandler = new Rb3MenuCueHandler(b.dmxLightManager, b.sequencer)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aPlay = jest.spyOn(a.rb3MenuCueHandler, 'playMenuFrame')
    const bPlay = jest.spyOn(b.rb3MenuCueHandler, 'playMenuFrame')

    fanout.playMenuFrame()

    expect(aPlay).toHaveBeenCalledTimes(1)
    expect(bPlay).toHaveBeenCalledTimes(1)
  })

  it('updating the chain list via setChains redirects future events', () => {
    const [a, b] = buildChains()
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    const aOnBeat = jest.spyOn(a.sequencer, 'onBeat')
    const bOnBeat = jest.spyOn(b.sequencer, 'onBeat')

    // Remove chain B from the fanout. Subsequent events only reach chain A's sequencer.
    fanout.setChains([a])
    fanout.handleBeat()

    expect(aOnBeat).toHaveBeenCalledTimes(1)
    expect(bOnBeat).not.toHaveBeenCalled()
  })
})
