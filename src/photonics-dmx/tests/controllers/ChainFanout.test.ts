/**
 * ChainFanout tests: a single listener event reaches every chain's matching cue handler
 * exactly once, and per-rig effect operations land on per-rig sequencers.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import type { YargCueHandler } from '../../cueHandlers/YargCueHandler'
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
    stopActiveCue: jest.fn(),
  } as unknown as YargCueHandler
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
    yargCueHandler: yarg,
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
    expect(a.yargCueHandler!.notifySongStart).toHaveBeenCalledTimes(1)
    expect(b.yargCueHandler!.notifySongStart).toHaveBeenCalledTimes(1)
  })

  it('skips chains without a YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    b.yargCueHandler = null
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    fanout.handleBeat()
    expect(a.yargCueHandler!.handleBeat).toHaveBeenCalledTimes(1)
  })

  it('handleCue awaits every chain (Promise.allSettled)', async () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])
    await fanout.handleCue('test-cue' as never, { foo: 'bar' } as never)
    expect(a.yargCueHandler!.handleCue).toHaveBeenCalledTimes(1)
    expect(b.yargCueHandler!.handleCue).toHaveBeenCalledTimes(1)
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

  it('yargOnBeat / yargOnMeasure / yargOnKeyframe reach every chain sequencer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.yargOnBeat()
    fanout.yargOnMeasure()
    fanout.yargOnKeyframe()

    expect(a.sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onBeat).toHaveBeenCalledTimes(1)
    expect(a.sequencer.onMeasure).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onMeasure).toHaveBeenCalledTimes(1)
    expect(a.sequencer.onKeyframe).toHaveBeenCalledTimes(1)
    expect(b.sequencer.onKeyframe).toHaveBeenCalledTimes(1)
  })

  it('yargSchedulePanTiltClear / yargCancelPanTiltClear reach every chain sequencer', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.yargSchedulePanTiltClear()
    fanout.yargCancelPanTiltClear()

    expect(a.sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(b.sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    expect(a.sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
    expect(b.sequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
  })

  it('yargStopActiveCue stops every chain that has a YARG handler', () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    b.yargCueHandler = null
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    fanout.yargStopActiveCue()

    expect(a.yargCueHandler!.stopActiveCue).toHaveBeenCalledTimes(1)
    // chain b has no handler — silent skip, no throw.
  })

  it('yargBlackout awaits every chain sequencer blackout even if one rejects', async () => {
    const a = makeChainStub('a', true)
    const b = makeChainStub('b', false)
    ;(a.sequencer.blackout as jest.Mock).mockImplementation(() => Promise.reject(new Error('boom')))
    const fanout = new ChainFanout()
    fanout.setChains([a, b])

    await fanout.yargBlackout(500)

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
})
