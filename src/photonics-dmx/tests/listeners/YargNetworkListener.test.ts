/**
 * Tests for YargNetworkListener: lifecycle (start/stop), passive strobe shutdown,
 * identical-frame throttling (30 Hz), and immediate forwarding of changed frames.
 * UDP socket is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { YargNetworkListener, YargCueRuntime } from '../../listeners/YARG/YargNetworkListener'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'

const YARG_PACKET_HEADER_LE = 0x59415247 // 'YARG'

/** Total bytes through singalong (before optional camera-cut extension). */
const YARG_MIN_FULL_PACKET_LEN = 47

function deserializePacket(listener: YargNetworkListener, buffer: Buffer): void {
  ;(listener as unknown as { deserializePacket(buf: Buffer): void }).deserializePacket(buffer)
}

function buildYargShutdownPacket(): Buffer {
  const buf = Buffer.alloc(5)
  buf.writeUInt32LE(YARG_PACKET_HEADER_LE, 0)
  buf.writeUInt8(0, 4)
  return buf
}

/** Header + datagram version byte only (padding ignored until length check). */
function buildYargFullSizedPacket(datagramVersion: number): Buffer {
  const buf = Buffer.alloc(YARG_MIN_FULL_PACKET_LEN)
  buf.writeUInt32LE(YARG_PACKET_HEADER_LE, 0)
  buf.writeUInt8(datagramVersion, 4)
  return buf
}

class YargNetworkListenerMinV2 extends YargNetworkListener {
  protected override getMinSupportedDatagramVersion(): number {
    return 2
  }
}

class MockCueHandler implements YargCueRuntime {
  public notifySongStart = jest.fn()
  public notifySongEnd = jest.fn()
  public handleBeat = jest.fn()
  public handleMeasure = jest.fn()
  public handleKeyframeFirst = jest.fn()
  public handleKeyframeNext = jest.fn()
  public handleKeyframePrevious = jest.fn()
  public handleCue = jest.fn(async (_cueType: CueType, _parameters: CueData): Promise<void> => {})
  public handleDrumNote = jest.fn()
  public handleGuitarNote = jest.fn()
  public handleBassNote = jest.fn()
  public handleKeysNote = jest.fn()
  public handleVocalNote = jest.fn()
}

const mockBind = jest.fn((_port: number, callback: () => void) => {
  callback()
})
const defaultMockClose = (callback?: () => void) => {
  if (callback) callback()
}
const mockClose = jest.fn(defaultMockClose)
const mockOn = jest.fn()

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    bind: mockBind,
    close: mockClose,
    on: mockOn,
  })),
}))

describe('YargNetworkListener', () => {
  let cueHandler: MockCueHandler
  let listener: YargNetworkListener

  beforeEach(() => {
    jest.clearAllMocks()
    cueHandler = new MockCueHandler()
    listener = new YargNetworkListener(cueHandler)
  })

  afterEach(async () => {
    if (listener) {
      await listener.shutdown()
    }
  })

  it('constructs with a cue handler', () => {
    expect(listener).toBeDefined()
  })

  it('start binds the UDP socket and sets listening state', async () => {
    await listener.start()
    expect(mockBind).toHaveBeenCalledWith(36107, expect.any(Function))
    await listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('stop closes the socket', async () => {
    await listener.start()
    await listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('shutdown calls stop', async () => {
    await listener.start()
    await listener.shutdown()
    expect(mockClose).toHaveBeenCalled()
  })

  it('stop() Promise resolves only when the dgram close callback runs', async () => {
    const pending: Array<() => void> = []
    mockClose.mockImplementationOnce((cb?: () => void) => {
      if (cb) pending.push(() => cb())
    })
    await listener.start()
    const stopP = listener.stop()
    let resolved = false
    void stopP.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(pending).toHaveLength(1)
    pending[0]!()
    await stopP
    expect(resolved).toBe(true)
    mockClose.mockImplementation(defaultMockClose)
  })

  it('second start after await stop re-binds the UDP port', async () => {
    await listener.start()
    await listener.stop()
    mockBind.mockClear()
    await listener.start()
    expect(mockBind).toHaveBeenCalledWith(36107, expect.any(Function))
  })

  describe('passive strobe shutdown', () => {
    it('when previous frame had active strobe and current frame has no active strobe, emits Strobe_Off', () => {
      const frameWithStrobe: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Default,
        strobeState: 'Strobe_Slow',
        beat: 'Off',
        keyframe: 'Off',
      }
      const frameWithoutStrobe: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Default,
        strobeState: 'Strobe_Off',
        beat: 'Off',
        keyframe: 'Off',
      }

      listener.processCueData(frameWithStrobe)
      expect(cueHandler.handleCue).toHaveBeenCalledWith(CueType.Default, frameWithStrobe)
      expect(cueHandler.handleCue).toHaveBeenCalledWith(CueType.Strobe_Slow, frameWithStrobe)

      listener.processCueData(frameWithoutStrobe)
      expect(cueHandler.handleCue).toHaveBeenCalledWith(CueType.Strobe_Off, frameWithoutStrobe)
    })

    it('when previous frame had active strobe and current frame has only primary cue, emits Strobe_Off and primary cue', () => {
      const frameWithStrobe: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Default,
        strobeState: 'Strobe_Slow',
        beat: 'Off',
        keyframe: 'Off',
      }
      const framePrimaryOnly: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Sweep,
        strobeState: 'Strobe_Off',
        beat: 'Off',
        keyframe: 'Off',
      }

      listener.processCueData(frameWithStrobe)
      listener.processCueData(framePrimaryOnly)

      const handleCueCalls = (cueHandler.handleCue as jest.Mock).mock.calls
      expect(handleCueCalls[handleCueCalls.length - 2][0]).toBe(CueType.Sweep)
      expect(handleCueCalls[handleCueCalls.length - 1][0]).toBe(CueType.Strobe_Off)
    })
  })

  describe('lighting cue dispatch guard', () => {
    it('dispatches a known lighting cue', () => {
      listener.processCueData({ ...defaultCueData, lightingCue: CueType.Frenzy })
      expect(cueHandler.handleCue).toHaveBeenCalledWith(
        CueType.Frenzy,
        expect.objectContaining({ lightingCue: CueType.Frenzy }),
      )
    })

    it('drops an unrecognised lighting cue value instead of dispatching it', () => {
      listener.processCueData({ ...defaultCueData, lightingCue: 'Unknown (99)' })
      const dispatched = (cueHandler.handleCue as jest.Mock).mock.calls.map((c) => c[0])
      expect(dispatched).not.toContain('Unknown (99)')
    })
  })

  describe('scene transitions (song start / song end)', () => {
    it('calls notifySongStart when transitioning Menu -> Gameplay', () => {
      const notifySongStartSpy = jest.spyOn(cueHandler, 'notifySongStart')
      const notifySongEndSpy = jest.spyOn(cueHandler, 'notifySongEnd')

      listener.processCueData({ ...defaultCueData, currentScene: 'Menu' })
      expect(notifySongStartSpy).not.toHaveBeenCalled()

      listener.processCueData({ ...defaultCueData, currentScene: 'Gameplay' })
      expect(notifySongStartSpy).toHaveBeenCalledTimes(1)
      expect(notifySongEndSpy).not.toHaveBeenCalled()

      notifySongStartSpy.mockRestore()
      notifySongEndSpy.mockRestore()
    })

    it('calls notifySongEnd when transitioning Gameplay -> Score', () => {
      const notifySongStartSpy = jest.spyOn(cueHandler, 'notifySongStart')
      const notifySongEndSpy = jest.spyOn(cueHandler, 'notifySongEnd')

      listener.processCueData({ ...defaultCueData, currentScene: 'Gameplay' })
      expect(notifySongEndSpy).not.toHaveBeenCalled()

      listener.processCueData({ ...defaultCueData, currentScene: 'Score' })
      expect(notifySongEndSpy).toHaveBeenCalledTimes(1)

      notifySongStartSpy.mockRestore()
      notifySongEndSpy.mockRestore()
    })

    it('calls notifySongEnd when transitioning Gameplay -> Menu', () => {
      const notifySongEndSpy = jest.spyOn(cueHandler, 'notifySongEnd')

      listener.processCueData({ ...defaultCueData, currentScene: 'Gameplay' })
      listener.processCueData({ ...defaultCueData, currentScene: 'Menu' })
      expect(notifySongEndSpy).toHaveBeenCalledTimes(1)

      notifySongEndSpy.mockRestore()
    })
  })

  describe('datagram version handling', () => {
    it('emits yarg-error with shutdown message when datagramVersion is 0', () => {
      const onError = jest.fn()
      listener.on('yarg-error', onError)

      deserializePacket(listener, buildYargShutdownPacket())

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith({
        type: 'yarg-shutdown',
        message: 'YARG Has Shutdown',
        datagramVersion: 0,
      })
      expect(cueHandler.handleCue).not.toHaveBeenCalled()
    })

    it('emits datagram-version-mismatch for non-zero versions below minimum supported', () => {
      const strictListener = new YargNetworkListenerMinV2(cueHandler)
      const onError = jest.fn()
      strictListener.on('yarg-error', onError)

      deserializePacket(strictListener, buildYargFullSizedPacket(1))

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'datagram-version-mismatch',
          datagramVersion: 1,
          message: expect.stringContaining('YARG Datagram Version too old'),
        }),
      )
      expect(cueHandler.handleCue).not.toHaveBeenCalled()

      void strictListener.shutdown()
    })
  })

  describe('beat-byte decode', () => {
    /** Byte offset of the beat field in the YARG datagram. */
    const BEAT_BYTE_OFFSET = 38

    function buildPacketWithBeat(beatByte: number): Buffer {
      const buf = buildYargFullSizedPacket(1)
      buf.writeUInt8(beatByte, BEAT_BYTE_OFFSET)
      return buf
    }

    // Wire protocol per YARG.Core BeatlineType (verified against live YARG output):
    // Measure=0, Strong=1, Weak=2, with 3 used as the no-beat sentinel ("Off").
    // NOTE: YALCY's published BeatByte enum (Off=0, Measure=1, ...) disagrees with the
    // wire and is incorrect; mapping that way fires measures on every strong beat.
    it('byte 0 (Measure / downbeat) fires handleMeasure only', () => {
      deserializePacket(listener, buildPacketWithBeat(0))
      expect(cueHandler.handleMeasure).toHaveBeenCalledTimes(1)
      expect(cueHandler.handleBeat).not.toHaveBeenCalled()
    })

    it('byte 1 (Strong beat) fires handleBeat only', () => {
      deserializePacket(listener, buildPacketWithBeat(1))
      expect(cueHandler.handleBeat).toHaveBeenCalledTimes(1)
      expect(cueHandler.handleMeasure).not.toHaveBeenCalled()
    })

    it('byte 2 (Weak subdivision) fires neither handleMeasure nor handleBeat', () => {
      deserializePacket(listener, buildPacketWithBeat(2))
      expect(cueHandler.handleMeasure).not.toHaveBeenCalled()
      expect(cueHandler.handleBeat).not.toHaveBeenCalled()
    })

    it('byte 3 (Off / no beat this frame) fires neither handleMeasure nor handleBeat', () => {
      deserializePacket(listener, buildPacketWithBeat(3))
      expect(cueHandler.handleMeasure).not.toHaveBeenCalled()
      expect(cueHandler.handleBeat).not.toHaveBeenCalled()
    })

    it('decodes each beat byte to its canonical string in the dispatched cue data', () => {
      const cases: Array<[number, CueData['beat']]> = [
        [0, 'Measure'],
        [1, 'Strong'],
        [2, 'Weak'],
        [3, 'Off'],
      ]
      for (const [beatByte, expected] of cases) {
        cueHandler.handleCue.mockClear()
        deserializePacket(listener, buildPacketWithBeat(beatByte))
        const lastCall = cueHandler.handleCue.mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        expect((lastCall![1] as CueData).beat).toBe(expected)
      }
    })
  })

  describe('fallback cue', () => {
    const FALLBACK_MS = 2000
    let perfNowSpy: ReturnType<typeof jest.spyOn>
    let fbListener: YargNetworkListener
    let fallbackTime: number

    beforeEach(async () => {
      jest.useFakeTimers()
      jest.setSystemTime(0)
      // monotonicNowMs() reads performance.now(); delegate it to the faked Date clock so
      // advanceTimersByTime drives both the poll interval and the elapsed-time math.
      perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => Date.now())
      fallbackTime = FALLBACK_MS
      fbListener = new YargNetworkListener(cueHandler, {
        getFallbackCueTimeMs: () => fallbackTime,
      })
      await fbListener.start()
      cueHandler.handleCue.mockClear()
    })

    afterEach(async () => {
      await fbListener.shutdown()
      perfNowSpy.mockRestore()
      jest.useRealTimers()
    })

    const gameplayFrame = (cue: CueType, overrides: Partial<CueData> = {}): CueData => ({
      ...defaultCueData,
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      lightingCue: cue,
      beat: 'Off',
      keyframe: 'Off',
      ...overrides,
    })

    const dispatchedCues = (): unknown[] => cueHandler.handleCue.mock.calls.map((c) => c[0])

    it('fires the Fallback cue after the window when YARG goes silent while playing', () => {
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      cueHandler.handleCue.mockClear()

      jest.advanceTimersByTime(FALLBACK_MS + 500)

      const fallbackCalls = cueHandler.handleCue.mock.calls.filter((c) => c[0] === CueType.Fallback)
      expect(fallbackCalls.length).toBeGreaterThanOrEqual(1)
      // The fallback frame carries the Fallback cue value and is dispatched as a tracked cue.
      const payload = fallbackCalls[0]![1] as CueData
      expect(payload.lightingCue).toBe(CueType.Fallback)
      expect(payload.trackMode).toBe('tracked')
    })

    it('does not fire at the menu', () => {
      fbListener.processCueData({
        ...defaultCueData,
        currentScene: 'Menu',
        lightingCue: CueType.Menu,
        beat: 'Off',
        keyframe: 'Off',
      })
      cueHandler.handleCue.mockClear()

      jest.advanceTimersByTime(FALLBACK_MS * 3)

      expect(dispatchedCues()).not.toContain(CueType.Fallback)
    })

    it('does not fire while the song is paused', () => {
      fbListener.processCueData(gameplayFrame(CueType.Verse, { pauseState: 'Paused' }))
      cueHandler.handleCue.mockClear()

      jest.advanceTimersByTime(FALLBACK_MS * 3)

      expect(dispatchedCues()).not.toContain(CueType.Fallback)
    })

    it('is disabled when the fallback time is 0', () => {
      fallbackTime = 0
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      cueHandler.handleCue.mockClear()

      jest.advanceTimersByTime(60000)

      expect(dispatchedCues()).not.toContain(CueType.Fallback)
    })

    it('re-fires the Fallback cue after each subsequent window', () => {
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      cueHandler.handleCue.mockClear()

      jest.advanceTimersByTime(FALLBACK_MS + 500)
      jest.advanceTimersByTime(FALLBACK_MS + 500)

      const fallbackCount = cueHandler.handleCue.mock.calls.filter(
        (c) => c[0] === CueType.Fallback,
      ).length
      expect(fallbackCount).toBeGreaterThanOrEqual(2)
    })

    it('switches to a new YARG cue immediately, cancelling the fallback', () => {
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      jest.advanceTimersByTime(FALLBACK_MS + 500) // fallback now active
      cueHandler.handleCue.mockClear()

      fbListener.processCueData(gameplayFrame(CueType.Chorus))

      expect(dispatchedCues()).toContain(CueType.Chorus)
    })

    it('resumes the real cue and cancels the fallback when YARG sends again', () => {
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      jest.advanceTimersByTime(FALLBACK_MS + 500) // fallback now active
      cueHandler.handleCue.mockClear()

      // YARG comes back, re-sending the same cue (beat differs so the 30 Hz throttle doesn't swallow it):
      // the real cue takes over immediately rather than being held off by the active fallback.
      fbListener.processCueData(gameplayFrame(CueType.Verse, { beat: 'Strong' }))

      expect(dispatchedCues()).toContain(CueType.Verse)
    })

    it('does not fire while YARG keeps streaming the same cue', () => {
      // YARG holds one cue across a whole section, streaming it continuously. The window must reset
      // on each received cue so the fallback never fires on top of the live cue.
      for (let elapsed = 0; elapsed < FALLBACK_MS * 2 + 500; elapsed += 200) {
        fbListener.processCueData(
          gameplayFrame(CueType.Verse, { beat: elapsed % 400 === 0 ? 'Strong' : 'Off' }),
        )
        jest.advanceTimersByTime(200)
      }

      expect(dispatchedCues()).not.toContain(CueType.Fallback)
    })

    it.each([CueType.Blackout_Fast, CueType.NoCue])(
      'triggers the fallback while YARG streams %s continuously',
      (cue) => {
        // A song with no real lighting streams a blackout / no-cue every frame. Unlike a real cue,
        // these must not keep resetting the window, so the fallback still takes over.
        for (let elapsed = 0; elapsed < FALLBACK_MS * 2; elapsed += 200) {
          fbListener.processCueData(
            gameplayFrame(cue, { beat: elapsed % 400 === 0 ? 'Strong' : 'Off' }),
          )
          jest.advanceTimersByTime(200)
        }

        expect(dispatchedCues()).toContain(CueType.Fallback)
      },
    )

    it('suppresses blackout re-sends while the fallback is active', () => {
      fbListener.processCueData(gameplayFrame(CueType.Blackout_Fast))
      jest.advanceTimersByTime(FALLBACK_MS + 500) // fallback now active
      cueHandler.handleCue.mockClear()

      // YARG keeps streaming the blackout (beat differs so the 30 Hz throttle doesn't swallow it).
      fbListener.processCueData(gameplayFrame(CueType.Blackout_Fast, { beat: 'Strong' }))

      expect(dispatchedCues()).not.toContain(CueType.Blackout_Fast)
    })

    it('resumes a real cue immediately after a blackout fallback', () => {
      fbListener.processCueData(gameplayFrame(CueType.Blackout_Fast))
      jest.advanceTimersByTime(FALLBACK_MS + 500) // fallback now active
      cueHandler.handleCue.mockClear()

      fbListener.processCueData(gameplayFrame(CueType.Chorus))

      expect(dispatchedCues()).toContain(CueType.Chorus)
    })

    it('treats the first blackout after a real cue as a window reset', () => {
      // A real cue, then a single legitimate blackout: the blackout restarts the window, so the
      // fallback must not fire just because the *real* cue is now older than the window.
      fbListener.processCueData(gameplayFrame(CueType.Verse))
      jest.advanceTimersByTime(FALLBACK_MS - 500)
      fbListener.processCueData(gameplayFrame(CueType.Blackout_Fast)) // first blackout resets window
      jest.advanceTimersByTime(FALLBACK_MS - 500) // older than the window since Verse, but not since the blackout

      expect(dispatchedCues()).not.toContain(CueType.Fallback)
    })
  })

  describe('identical-frame throttling (30 Hz)', () => {
    const throttleMs = 1000 / 30
    let perfNowSpy: ReturnType<typeof jest.spyOn>

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(0)
      // The throttle uses monotonicNowMs() (perf_hooks performance.now), which Jest's fake
      // timers don't patch; delegate it to the faked Date clock so advanceTimersByTime drives it.
      perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => Date.now())
    })

    afterEach(() => {
      perfNowSpy.mockRestore()
      jest.useRealTimers()
    })

    it('limits identical frames to 30 updates per second', () => {
      const frame: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Frenzy,
        strobeState: 'Strobe_Off',
        beat: 'Strong',
        keyframe: 'Off',
      }
      listener.processCueData(frame)
      expect(cueHandler.handleCue).toHaveBeenCalledTimes(1)

      for (let i = 0; i < 10; i++) {
        listener.processCueData(frame)
      }
      expect(cueHandler.handleCue).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(throttleMs + 1)
      listener.processCueData(frame)
      expect(cueHandler.handleCue).toHaveBeenCalledTimes(2)
      expect(cueHandler.handleCue).toHaveBeenNthCalledWith(1, CueType.Frenzy, frame)
      expect(cueHandler.handleCue).toHaveBeenNthCalledWith(2, CueType.Frenzy, frame)
    })

    it('forwards changed frame immediately even within throttle window', () => {
      const frameA: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Frenzy,
        strobeState: 'Strobe_Off',
        beat: 'Off',
        keyframe: 'Off',
      }
      const frameB: CueData = {
        ...defaultCueData,
        lightingCue: CueType.Sweep,
        strobeState: 'Strobe_Off',
        beat: 'Off',
        keyframe: 'Off',
      }

      listener.processCueData(frameA)
      listener.processCueData(frameA)
      expect(cueHandler.handleCue).toHaveBeenCalledTimes(1)

      listener.processCueData(frameB)
      expect(cueHandler.handleCue).toHaveBeenCalledTimes(2)
      expect(cueHandler.handleCue).toHaveBeenNthCalledWith(1, CueType.Frenzy, frameA)
      expect(cueHandler.handleCue).toHaveBeenNthCalledWith(2, CueType.Sweep, frameB)
    })
  })
})
