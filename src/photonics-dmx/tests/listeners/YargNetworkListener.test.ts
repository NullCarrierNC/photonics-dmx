/**
 * Tests for YargNetworkListener: lifecycle (start/stop), passive strobe shutdown,
 * identical-frame throttling (30 Hz), and immediate forwarding of changed frames.
 * UDP socket is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
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

  describe('beat-byte decode (Bug #1 regression)', () => {
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

  describe('identical-frame throttling (30 Hz)', () => {
    const throttleMs = 1000 / 30

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(0)
    })

    afterEach(() => {
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
