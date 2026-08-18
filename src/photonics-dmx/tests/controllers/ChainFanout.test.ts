/**
 * ChainFanout tests: a single listener event reaches every chain's matching cue handler
 * exactly once, and per-rig effect operations land on per-rig sequencers.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import type { CueHandler } from '../../cueHandlers/CueHandler'
import type { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import type { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import type { Sequencer } from '../../controllers/sequencer/Sequencer'

function makeChainStub(rigId: string, isPrimary: boolean): RigChain {
  const sequencer = {
    onBeat: jest.fn(),
    onMeasure: jest.fn(),
    onKeyframe: jest.fn(),
    schedulePanTiltClear: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    removeEffectByLayer: jest.fn(),
    holdOcclusion: jest.fn(),
  } as unknown as Sequencer
  const yarg = {
    notifySongStart: jest.fn(),
    notifySongEnd: jest.fn(),
    handleBeat: jest.fn(),
    handleMeasure: jest.fn(),
    handleKeyframeFirst: jest.fn(),
    handleKeyframeNext: jest.fn(),
    handleKeyframePrevious: jest.fn(),
    handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleDrumNote: jest.fn(),
    handleGuitarNote: jest.fn(),
    handleBassNote: jest.fn(),
    handleKeysNote: jest.fn(),
    handleVocalNote: jest.fn(),
    resetSessionState: jest.fn(),
    stopActiveStrobe: jest.fn(),
    stopActiveCue: jest.fn(),
  } as unknown as CueHandler
  const audio = {
    setMotionEnabled: jest.fn(),
    setManualMotionRef: jest.fn(),
    resetMotionTracking: jest.fn(),
    isMotionLayerEnabled: jest.fn().mockReturnValue(true),
    syncSlots: jest.fn(),
    handleAudioData: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn(),
    clearCurrentCue: jest.fn(),
    destroy: jest.fn(),
  } as unknown as AudioCueHandler
  const rb3Menu = {
    playMenuFrame: jest.fn(),
    clear: jest.fn(),
  } as unknown as Rb3MenuCueHandler
  return {
    rigId,
    isPrimary,
    sequencer,
    cueHandlers: {
      yarg: yarg,
      rb3: null,
    },
    audioCueHandler: audio,
    rb3MenuCueHandler: rb3Menu,
  } as unknown as RigChain
}

describe('ChainFanout', () => {
  it('dispatches notifySongStart to every chain', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.notifySongStart()
    expect(a.cueHandlers.yarg!.notifySongStart).toHaveBeenCalledTimes(1)
    expect(b.cueHandlers.yarg!.notifySongStart).toHaveBeenCalledTimes(1)
  })

  it('skips chains without a YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    b.cueHandlers.yarg = null
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.handleBeat()
    expect(a.cueHandlers.yarg!.handleBeat).toHaveBeenCalledTimes(1)
  })

  it('stopActiveStrobe reaches every chain YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.stopActiveStrobe()
    expect(a.cueHandlers.yarg!.stopActiveStrobe).toHaveBeenCalledTimes(1)
    expect(b.cueHandlers.yarg!.stopActiveStrobe).toHaveBeenCalledTimes(1)
  })

  it('resetSessionState reaches every chain YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.resetSessionState()
    expect(a.cueHandlers.yarg!.resetSessionState).toHaveBeenCalledTimes(1)
    expect(b.cueHandlers.yarg!.resetSessionState).toHaveBeenCalledTimes(1)
  })

  it('handleCue awaits every chain (Promise.allSettled)', async () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    await fanout.handleCue('test-cue' as never, { foo: 'bar' } as never)
    expect(a.cueHandlers.yarg!.handleCue).toHaveBeenCalledTimes(1)
    expect(b.cueHandlers.yarg!.handleCue).toHaveBeenCalledTimes(1)
  })

  it('audioOnBeat reaches every chain sequencer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.audioOnBeat()
    expect(a.sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onBeat).toHaveBeenCalledTimes(1)
  })

  it('audioRemoveEffectByLayer reaches every chain sequencer with the supplied layer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.audioRemoveEffectByLayer(3, true)
    expect(a.sequencer.removeEffectByLayer).toHaveBeenCalledWith(3, true)
    expect(b.sequencer.removeEffectByLayer).toHaveBeenCalledWith(3, true)
  })

  it('playMenuFrame / clear dispatch to every chain RB3 menu handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.playMenuFrame()
    fanout.clear()
    expect(a.rb3MenuCueHandler!.playMenuFrame).toHaveBeenCalledTimes(1)
    expect(b.rb3MenuCueHandler!.playMenuFrame).toHaveBeenCalledTimes(1)
    expect(a.rb3MenuCueHandler!.clear).toHaveBeenCalledTimes(1)
    expect(b.rb3MenuCueHandler!.clear).toHaveBeenCalledTimes(1)
  })

  it('audioIsMotionLayerEnabled reads the first chain with a handler', () => {
    const a = makeChainStub('a', true)
    a.audioCueHandler = null
    const b = makeChainStub('b', false)
    ;(b.audioCueHandler!.isMotionLayerEnabled as jest.Mock).mockReturnValue(false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    expect(fanout.audioIsMotionLayerEnabled()).toBe(false)
  })

  // ── YARG direct-sequencer fanout ──────────────────────────────────────────────────────
  // These bypass the cue handler and drive each chain's sequencer directly. The simulation
  // IPC path uses them to multi-rig-correct ticks that used to call the primary sequencer.

  it('onBeat / onMeasure / onKeyframe reach every chain sequencer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.onBeat()
    fanout.onMeasure()
    fanout.onKeyframe()

    expect(a.sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(a.sequencer.onMeasure).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onMeasure).toHaveBeenCalledTimes(1)
    expect(a.sequencer.onKeyframe).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onKeyframe).toHaveBeenCalledTimes(1)
  })

  it('schedulePanTiltClear / cancelPanTiltClear reach every chain sequencer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.schedulePanTiltClear()
    fanout.cancelPanTiltClear()

    expect(a.sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(b.sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(a.sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
    expect(b.sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
  })

  it('stopActiveCue stops every chain that has a YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    b.cueHandlers.yarg = null
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.stopActiveCue()

    expect(a.cueHandlers.yarg!.stopActiveCue).toHaveBeenCalledTimes(1)
    // chain b has no handler — silent skip, no throw.
  })

  it('blackout awaits every chain sequencer blackout even if one rejects', async () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    ;(a.sequencer.blackout as jest.Mock).mockImplementation(() => Promise.reject(new Error('boom')))
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    await fanout.blackout(500)

    // Both chains' blackout were invoked despite chain a's rejection — Promise.allSettled
    // isolates errors so a misbehaving rig can't block its siblings.
    expect(a.sequencer.blackout).toHaveBeenCalledWith(500)
    expect(b.sequencer.blackout).toHaveBeenCalledWith(500)
  })

  it('returns the current chain list via getChains', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    expect(fanout.getChains()).toEqual([a, b])
  })

  it('mutes and unmutes through each chain sequencer own occlusion hold', () => {
    // Not an ordinary effect submission: the sequencer owns the overlay so the blackout paths that
    // wipe layers can re-assert it rather than leaving the rig visible again.
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.muteLighting(true)
    expect(a.sequencer.holdOcclusion).toHaveBeenCalledWith(true)
    expect(b.sequencer.holdOcclusion).toHaveBeenCalledWith(true)

    fanout.muteLighting(false)
    expect(a.sequencer.holdOcclusion).toHaveBeenLastCalledWith(false)
    expect(b.sequencer.holdOcclusion).toHaveBeenLastCalledWith(false)
  })
})
