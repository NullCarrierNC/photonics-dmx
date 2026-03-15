/**
 * Tests for YargNetworkListener: lifecycle (start/stop), passive strobe shutdown,
 * identical-frame throttling (30 Hz), and immediate forwarding of changed frames.
 * UDP socket is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import { BaseCueHandler } from '../../cueHandlers/BaseCueHandler'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { createMockLightingConfig } from '../helpers/testFixtures'

class MockCueHandler extends BaseCueHandler {
  public handleCue = jest.fn(async (_cueType: CueType, _parameters: CueData): Promise<void> => {})
  public handleCueNoCue = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueDischord = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueChorus = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueDefault = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStomp = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueVerse = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueMenu = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueScore = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueBigRockEnding = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueBlackout_Fast = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueBlackout_Slow = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueBlackout_Spotlight = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueCool_Manual = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueCool_Automatic = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueWarm_Manual = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueWarm_Automatic = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueFlare_Fast = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueFlare_Slow = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueFrenzy = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueIntro = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueHarmony = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueSilhouettes = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueSilhouettes_Spotlight = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueSearchlights = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStrobe_Fastest = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStrobe_Fast = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStrobe_Medium = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStrobe_Slow = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueStrobe_Off = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueSweep = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueKeyframe_First = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueKeyframe_Next = jest.fn(async (_: CueData): Promise<void> => {})
  protected handleCueKeyframe_Previous = jest.fn(async (_: CueData): Promise<void> => {})
}

const mockBind = jest.fn((_port: number, callback: () => void) => {
  callback()
})
const mockClose = jest.fn((callback?: () => void) => {
  if (callback) callback()
})
const mockOn = jest.fn()

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    bind: mockBind,
    close: mockClose,
    on: mockOn,
  })),
}))

describe('YargNetworkListener', () => {
  let lightManager: DmxLightManager
  let mockSequencer: ILightingController
  let cueHandler: MockCueHandler
  let listener: YargNetworkListener

  beforeEach(() => {
    jest.clearAllMocks()
    const config = createMockLightingConfig()
    lightManager = new DmxLightManager(config)
    mockSequencer = {
      addEffect: jest.fn(),
      removeEffect: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
    } as unknown as ILightingController
    cueHandler = new MockCueHandler(lightManager, mockSequencer)
    listener = new YargNetworkListener(cueHandler)
  })

  afterEach(() => {
    if (listener) {
      listener.shutdown()
    }
  })

  it('constructs with a cue handler', () => {
    expect(listener).toBeDefined()
  })

  it('start binds the UDP socket and sets listening state', () => {
    listener.start()
    expect(mockBind).toHaveBeenCalledWith(36107, expect.any(Function))
    listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('stop closes the socket', () => {
    listener.start()
    listener.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('shutdown calls stop', () => {
    listener.start()
    listener.shutdown()
    expect(mockClose).toHaveBeenCalled()
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
