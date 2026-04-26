/**
 * Tests for YargNetworkListener: lifecycle (start/stop), passive strobe shutdown,
 * identical-frame throttling (30 Hz), and immediate forwarding of changed frames.
 * UDP socket is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { YargNetworkListener, YargCueRuntime } from '../../listeners/YARG/YargNetworkListener'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'

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
    listener.start()
    expect(mockBind).toHaveBeenCalledWith(36107, expect.any(Function))
    await listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('stop closes the socket', async () => {
    listener.start()
    await listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('shutdown calls stop', async () => {
    listener.start()
    await listener.shutdown()
    expect(mockClose).toHaveBeenCalled()
  })

  it('stop() Promise resolves only when the dgram close callback runs', async () => {
    const pending: Array<() => void> = []
    mockClose.mockImplementationOnce((cb?: () => void) => {
      if (cb) pending.push(() => cb())
    })
    listener.start()
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
    listener.start()
    await listener.stop()
    mockBind.mockClear()
    listener.start()
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
