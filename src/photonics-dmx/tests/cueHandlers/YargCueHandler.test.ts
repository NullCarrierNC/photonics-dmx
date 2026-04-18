jest.mock('../../../main/utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { sendToAllWindows } from '../../../main/utils/windowUtils'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { beforeEach, describe, jest, it, expect } from '@jest/globals'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
// Mock implementation for the test
class MockCueImplementation implements INetCue {
  private _id: string
  constructor(private _name: string) {
    this._id = `mock-${this._name}-${Math.random().toString(36).substring(2, 11)}`
  }
  get cueId(): string {
    return this._name
  }
  get id(): string {
    return this._id
  }
  description = 'Mock cue for testing'
  style = CueStyle.Primary
  async execute(): Promise<void> {
    /* no-op */
  }

  onStop(): void {
    // Mock lifecycle method
  }

  onPause(): void {
    // Mock lifecycle method
  }

  onDestroy(): void {
    // Mock lifecycle method
  }
}

// Strobe cue mock for lifecycle tests
class MockStrobeCue implements INetCue {
  private _id: string
  executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  onStopMock = jest.fn()
  constructor(public cueId: CueType) {
    this._id = `mock-strobe-${cueId}-${Math.random().toString(36).substring(2, 11)}`
  }
  get id(): string {
    return this._id
  }
  description = 'Mock strobe for testing'
  style = CueStyle.Secondary
  async execute(): Promise<void> {
    return this.executeMock()
  }
  onStop(): void {
    this.onStopMock()
  }
  onPause(): void {
    /* no-op */
  }
  onDestroy(): void {
    /* no-op */
  }
}

// Primary cue mock for rapid transition tests (Sweep -> Stomp -> Sweep)
class MockPrimaryCue implements INetCue {
  private _id: string
  executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  onStopMock = jest.fn()
  constructor(public cueId: CueType) {
    this._id = `mock-primary-${cueId}-${Math.random().toString(36).substring(2, 11)}`
  }
  get id(): string {
    return this._id
  }
  description = 'Mock primary for testing'
  style = CueStyle.Primary
  async execute(): Promise<void> {
    return this.executeMock()
  }
  onStop(): void {
    this.onStopMock()
  }
  onPause(): void {
    /* no-op */
  }
  onDestroy(): void {
    /* no-op */
  }
}

// Non-strobe overlay cue (tests handler uses cue.style for the secondary slot)
class MockSecondaryNonStrobeCue implements INetCue {
  private _id: string
  executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  onStopMock = jest.fn()
  constructor(public cueId: CueType) {
    this._id = `mock-secondary-${cueId}-${Math.random().toString(36).substring(2, 11)}`
  }
  get id(): string {
    return this._id
  }
  description = 'Mock secondary (non-strobe) for testing'
  style = CueStyle.Secondary
  async execute(): Promise<void> {
    return this.executeMock()
  }
  onStop(): void {
    this.onStopMock()
  }
  onPause(): void {
    /* no-op */
  }
  onDestroy(): void {
    /* no-op */
  }
}

describe('YargCueHandler', () => {
  let cueHandler: YargCueHandler
  let mockLightManager: jest.Mocked<DmxLightManager>
  let mockSequencer: jest.Mocked<ILightingController>
  let registry: YargCueRegistry
  let mockStrobeCue: MockStrobeCue

  beforeEach(() => {
    // Get and reset the YargCueRegistry
    registry = YargCueRegistry.getInstance()
    registry.reset()

    mockStrobeCue = new MockStrobeCue(CueType.Strobe_Fast)
    // Define and register a minimal mock default group for this test suite
    const mockDefaultGroup: ICueGroup = {
      id: 'mock-default',
      name: 'mock-default',
      description: 'Mock default group for testing',
      cues: new Map<CueType, INetCue>([
        // Include at least the cues needed for fallback tests
        [CueType.Default, new MockCueImplementation('Default')],
        [CueType.Unknown, new MockCueImplementation('Unknown')], // Handle the unknown cue test
        [CueType.Strobe_Fast, mockStrobeCue],
      ]),
    }
    registry.registerGroup(mockDefaultGroup)
    registry.setDefaultGroup(mockDefaultGroup.id)
    registry.activateGroup(mockDefaultGroup.id)

    // Create mock light manager
    mockLightManager = {
      getLights: jest.fn(),
      getLightsInGroup: jest.fn(),
      getLightsByTarget: jest.fn(),
      getDmxLight: jest.fn(),
      setConfiguration: jest.fn(),
      shutdown: jest.fn(),
    } as any

    // Create mock sequencer
    mockSequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      addEffectWithCallback: jest.fn(),
      setEffectWithCallback: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      addEffectUnblockedNameWithCallback: jest.fn(),
      setEffectUnblockedNameWithCallback: jest.fn(),
      removeEffect: jest.fn(),
      removeEffectCallback: jest.fn(),
      removeAllEffects: jest.fn(),
      setState: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      blackout: jest.fn(),
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      removeEffectByLayer: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      addMotionPattern: jest.fn(),
      getMotionPattern: jest.fn().mockReturnValue(undefined),
      removeMotionPattern: jest.fn(),
      updateMotionPatternConfig: jest.fn(),
      shutdown: jest.fn(),
    } as any

    cueHandler = new YargCueHandler(mockLightManager, mockSequencer)
    ;(sendToAllWindows as jest.Mock).mockClear()
  })

  describe('handleBeat', () => {
    it('should call onBeat on the sequencer', () => {
      cueHandler.handleBeat()
      expect(mockSequencer.onBeat).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleMeasure', () => {
    it('should call onBeat and onMeasure on the sequencer', () => {
      cueHandler.handleMeasure()
      expect(mockSequencer.onBeat).toHaveBeenCalledTimes(1)
      expect(mockSequencer.onMeasure).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleCue', () => {
    const mockCueData: CueData = {
      datagramVersion: 1,
      platform: 'Windows',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: 'Large',
      beatsPerMinute: 120,
      songSection: 'Verse',
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: 'Default',
      postProcessing: 'Default',
      fogState: false,
      strobeState: 'Strobe_Off',
      performer: 0,
      trackMode: 'tracked',
      beat: 'Strong',
      keyframe: 'Off',
      bonusEffect: false,
      cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
    }

    it('should emit cueHandled event for special cases', async () => {
      jest.useFakeTimers()
      const cueHandledListener = jest.fn()
      cueHandler.on('cueHandled', cueHandledListener)

      // Test Blackout_Fast
      await cueHandler.handleCue(CueType.Blackout_Fast, mockCueData)
      // Exclude runtime-generated properties from comparison
      const {
        cueStartTime: _cueStartTime,
        timeSinceLastCue: _timeSinceLastCue,
        ...expectedCoreData
      } = mockCueData
      expect(cueHandledListener).toHaveBeenCalledWith(expect.objectContaining(expectedCoreData))
      expect(mockSequencer.blackout).toHaveBeenCalledWith(0)

      // Reset mock calls and advance timers
      mockSequencer.blackout.mockClear()
      cueHandledListener.mockClear()
      cueHandler.resetCueHistory() // Reset history to prevent accumulation
      jest.advanceTimersByTime(20)

      // Test Blackout_Slow
      await cueHandler.handleCue(CueType.Blackout_Slow, mockCueData)
      // Exclude runtime-generated properties from comparison
      const { cueStartTime: _cst2, timeSinceLastCue: _tslc2, ...expectedCoreData2 } = mockCueData
      expect(cueHandledListener).toHaveBeenCalledWith(expect.objectContaining(expectedCoreData2))
      expect(mockSequencer.blackout).toHaveBeenCalledWith(500)

      // Reset mock calls and advance timers
      mockSequencer.blackout.mockClear()
      cueHandledListener.mockClear()
      jest.advanceTimersByTime(20)

      jest.useRealTimers()
    })

    it('should emit cueHandled event for regular cues', async () => {
      const cueHandledListener = jest.fn()
      cueHandler.on('cueHandled', cueHandledListener)

      // Test with a regular cue
      await cueHandler.handleCue(CueType.Default, mockCueData)
      // Exclude runtime-generated properties from comparison
      const {
        cueStartTime: _cueStartTime2,
        timeSinceLastCue: _timeSinceLastCue2,
        ...expectedCoreData
      } = mockCueData
      expect(cueHandledListener).toHaveBeenCalledWith(expect.objectContaining(expectedCoreData))
    })

    it('should emit cueHandled event even when no implementation is found', async () => {
      const cueHandledListener = jest.fn()
      cueHandler.on('cueHandled', cueHandledListener)

      // Test with an unknown cue type
      await cueHandler.handleCue(CueType.Unknown, mockCueData)
      // Exclude runtime-generated properties from comparison
      const {
        cueStartTime: _cueStartTime3,
        timeSinceLastCue: _timeSinceLastCue3,
        ...expectedCoreData
      } = mockCueData
      expect(cueHandledListener).toHaveBeenCalledWith(expect.objectContaining(expectedCoreData))
    })

    it('invokes handler for every cue (no debounce)', async () => {
      const cueHandledListener = jest.fn()
      cueHandler.on('cueHandled', cueHandledListener)

      await cueHandler.handleCue(CueType.Default, mockCueData)
      await cueHandler.handleCue(CueType.Default, mockCueData)

      expect(cueHandledListener).toHaveBeenCalledTimes(2)
    })

    it('Strobe_Off clears strobe so same strobe can re-activate (rapid Strobe_X -> Strobe_Off -> Strobe_X)', async () => {
      jest.useFakeTimers()
      await cueHandler.handleCue(CueType.Strobe_Fast, mockCueData)
      expect(mockStrobeCue.executeMock).toHaveBeenCalledTimes(1)
      expect(mockStrobeCue.onStopMock).not.toHaveBeenCalled()

      jest.advanceTimersByTime(20)
      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData)
      expect(mockStrobeCue.onStopMock).toHaveBeenCalledTimes(1)
      expect(mockStrobeCue.executeMock).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(20)
      await cueHandler.handleCue(CueType.Strobe_Fast, mockCueData)
      expect(mockStrobeCue.executeMock).toHaveBeenCalledTimes(2)
      expect(mockStrobeCue.onStopMock).toHaveBeenCalledTimes(1)
      jest.useRealTimers()
    })

    it('non-strobe cue with style Secondary uses the secondary slot and is not cleared by Strobe_Off', async () => {
      jest.useFakeTimers()
      const secondaryCue = new MockSecondaryNonStrobeCue(CueType.Chorus)
      const styleGroup: ICueGroup = {
        id: 'style-group',
        name: 'Style test',
        description: 'Secondary by style',
        cues: new Map<CueType, INetCue>([[CueType.Chorus, secondaryCue]]),
      }
      registry.registerGroup(styleGroup)
      registry.setDefaultGroup(styleGroup.id)
      registry.deactivateGroup('mock-default')
      registry.activateGroup(styleGroup.id)
      const mockCueData: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

      await cueHandler.handleCue(CueType.Chorus, mockCueData)
      expect(secondaryCue.executeMock).toHaveBeenCalledTimes(1)
      expect(secondaryCue.onStopMock).not.toHaveBeenCalled()

      jest.advanceTimersByTime(15)
      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData)
      expect(secondaryCue.onStopMock).not.toHaveBeenCalled()
      jest.useRealTimers()
    })

    it('primary, secondary, and strobe can all run concurrently', async () => {
      const primaryCue = new MockPrimaryCue(CueType.Sweep)
      const secondaryCue = new MockSecondaryNonStrobeCue(CueType.Chorus)
      const strobeCue = new MockStrobeCue(CueType.Strobe_Slow)
      const layeredGroup: ICueGroup = {
        id: 'layered-group',
        name: 'Layered',
        description: 'Primary, secondary, and strobe layering',
        cues: new Map<CueType, INetCue>([
          [CueType.Sweep, primaryCue],
          [CueType.Chorus, secondaryCue],
          [CueType.Strobe_Slow, strobeCue],
        ]),
      }
      registry.registerGroup(layeredGroup)
      registry.setDefaultGroup(layeredGroup.id)
      registry.deactivateGroup('mock-default')
      registry.activateGroup(layeredGroup.id)
      const layeredCueData: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

      await cueHandler.handleCue(CueType.Sweep, layeredCueData)
      await cueHandler.handleCue(CueType.Chorus, layeredCueData)
      await cueHandler.handleCue(CueType.Strobe_Slow, layeredCueData)

      expect(primaryCue.executeMock).toHaveBeenCalledTimes(1)
      expect(secondaryCue.executeMock).toHaveBeenCalledTimes(1)
      expect(strobeCue.executeMock).toHaveBeenCalledTimes(1)
      expect(primaryCue.onStopMock).not.toHaveBeenCalled()
      expect(secondaryCue.onStopMock).not.toHaveBeenCalled()
      expect(strobeCue.onStopMock).not.toHaveBeenCalled()
    })

    it('Strobe_Off only clears strobe, not secondary overlay', async () => {
      jest.useFakeTimers()
      const secondaryCue = new MockSecondaryNonStrobeCue(CueType.Chorus)
      const strobeCue = new MockStrobeCue(CueType.Strobe_Slow)
      const layeredGroup: ICueGroup = {
        id: 'strobe-off-group',
        name: 'Strobe Off',
        description: 'Strobe off behavior',
        cues: new Map<CueType, INetCue>([
          [CueType.Chorus, secondaryCue],
          [CueType.Strobe_Slow, strobeCue],
        ]),
      }
      registry.registerGroup(layeredGroup)
      registry.setDefaultGroup(layeredGroup.id)
      registry.deactivateGroup('mock-default')
      registry.activateGroup(layeredGroup.id)
      const layeredCueData: CueData = { beat: 'Strong', strobeState: 'Strobe_Slow' } as CueData

      await cueHandler.handleCue(CueType.Chorus, layeredCueData)
      await cueHandler.handleCue(CueType.Strobe_Slow, layeredCueData)
      jest.advanceTimersByTime(15)
      await cueHandler.handleCue(CueType.Strobe_Off, layeredCueData)

      expect(strobeCue.onStopMock).toHaveBeenCalledTimes(1)
      expect(secondaryCue.onStopMock).not.toHaveBeenCalled()
      jest.useRealTimers()
    })

    it('new secondary replaces old secondary but not primary or strobe', async () => {
      const primaryCue = new MockPrimaryCue(CueType.Sweep)
      const firstSecondary = new MockSecondaryNonStrobeCue(CueType.Chorus)
      const secondSecondary = new MockSecondaryNonStrobeCue(CueType.Verse)
      const strobeCue = new MockStrobeCue(CueType.Strobe_Slow)
      const layeredGroup: ICueGroup = {
        id: 'secondary-replace-group',
        name: 'Secondary Replace',
        description: 'Secondary replacement behavior',
        cues: new Map<CueType, INetCue>([
          [CueType.Sweep, primaryCue],
          [CueType.Chorus, firstSecondary],
          [CueType.Verse, secondSecondary],
          [CueType.Strobe_Slow, strobeCue],
        ]),
      }
      registry.registerGroup(layeredGroup)
      registry.setDefaultGroup(layeredGroup.id)
      registry.deactivateGroup('mock-default')
      registry.activateGroup(layeredGroup.id)
      const layeredCueData: CueData = { beat: 'Strong', strobeState: 'Strobe_Off' } as CueData

      await cueHandler.handleCue(CueType.Sweep, layeredCueData)
      await cueHandler.handleCue(CueType.Chorus, layeredCueData)
      await cueHandler.handleCue(CueType.Strobe_Slow, layeredCueData)
      await cueHandler.handleCue(CueType.Verse, layeredCueData)

      expect(primaryCue.executeMock).toHaveBeenCalledTimes(1)
      expect(firstSecondary.executeMock).toHaveBeenCalledTimes(1)
      expect(secondSecondary.executeMock).toHaveBeenCalledTimes(1)
      expect(strobeCue.executeMock).toHaveBeenCalledTimes(1)
      expect(firstSecondary.onStopMock).toHaveBeenCalledTimes(1)
      expect(primaryCue.onStopMock).not.toHaveBeenCalled()
      expect(strobeCue.onStopMock).not.toHaveBeenCalled()
    })

    it('Strobe_Off is always processed and clears strobe (no debounce)', async () => {
      await cueHandler.handleCue(CueType.Strobe_Fast, mockCueData)
      expect(mockStrobeCue.executeMock).toHaveBeenCalledTimes(1)

      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData)
      expect(mockStrobeCue.onStopMock).toHaveBeenCalledTimes(1)
    })

    describe('motion cue pairing', () => {
      let getRandomMotionSpy: jest.SpiedFunction<() => INetCue | null>

      function makeMotionCue(cueId: string, executeMock: jest.Mock<() => Promise<void>>): INetCue {
        return {
          cueId,
          id: `instance-${cueId}`,
          style: CueStyle.Primary,
          execute: executeMock,
        }
      }

      afterEach(() => {
        getRandomMotionSpy?.mockRestore()
        mockSequencer.cancelPanTiltClear.mockClear()
        mockSequencer.schedulePanTiltClear.mockClear()
        ;(sendToAllWindows as jest.Mock).mockClear()
      })

      it('trackMode simulated does not call getRandomMotionCue or motion pan/tilt hooks', async () => {
        const registryInstance = YargCueRegistry.getInstance()
        getRandomMotionSpy = jest.spyOn(registryInstance, 'getRandomMotionCue')

        const simulatedData: CueData = {
          ...mockCueData,
          trackMode: 'simulated',
          simulationCueGroup: 'mock-default',
        }
        await cueHandler.handleCue(CueType.Default, simulatedData)

        expect(getRandomMotionSpy).not.toHaveBeenCalled()
        expect(mockSequencer.cancelPanTiltClear).not.toHaveBeenCalled()
      })

      it('trackMode tracked runs random motion on first execution of a visual cue', async () => {
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('motion-1', executeMock)
        getRandomMotionSpy = jest
          .spyOn(YargCueRegistry.getInstance(), 'getRandomMotionCue')
          .mockReturnValue(motionCue)

        await cueHandler.handleCue(CueType.Default, mockCueData)

        expect(getRandomMotionSpy).toHaveBeenCalledTimes(1)
        expect(executeMock).toHaveBeenCalledTimes(1)
        expect(mockSequencer.cancelPanTiltClear).toHaveBeenCalledTimes(1)
      })

      it('re-queue of same visual cue does not re-roll motion; executes existing motion again', async () => {
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('motion-stable', executeMock)
        getRandomMotionSpy = jest
          .spyOn(YargCueRegistry.getInstance(), 'getRandomMotionCue')
          .mockReturnValue(motionCue)

        await cueHandler.handleCue(CueType.Default, mockCueData)
        await cueHandler.handleCue(CueType.Default, mockCueData)

        expect(getRandomMotionSpy).toHaveBeenCalledTimes(1)
        expect(executeMock).toHaveBeenCalledTimes(2)
      })

      it('changing visual cue type picks a new random motion cue', async () => {
        const executeA = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const executeB = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionA = makeMotionCue('motion-a', executeA)
        const motionB = makeMotionCue('motion-b', executeB)
        let pick = 0
        getRandomMotionSpy = jest
          .spyOn(YargCueRegistry.getInstance(), 'getRandomMotionCue')
          .mockImplementation(() => {
            pick += 1
            return pick === 1 ? motionA : motionB
          })

        const verseCue = new MockPrimaryCue(CueType.Verse)
        registry.getGroup('mock-default')!.cues.set(CueType.Verse, verseCue)

        await cueHandler.handleCue(CueType.Default, mockCueData)
        await cueHandler.handleCue(CueType.Verse, mockCueData)

        expect(getRandomMotionSpy).toHaveBeenCalledTimes(2)
        expect(executeA).toHaveBeenCalledTimes(1)
        expect(executeB).toHaveBeenCalledTimes(1)
      })

      it('emits YARG_MOTION_CUE_CHANGE when random motion is selected', async () => {
        const reg = YargCueRegistry.getInstance()
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('motion-1', executeMock)
        const randSpy = jest.spyOn(reg, 'getRandomMotionCue').mockReturnValue(motionCue)
        const findSpy = jest
          .spyOn(reg, 'findYargMotionCueRef')
          .mockReturnValue({ groupId: 'mg', cueId: 'mc' })
        try {
          await cueHandler.handleCue(CueType.Default, mockCueData)

          expect(sendToAllWindows).toHaveBeenCalledWith(
            RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
            expect.objectContaining({
              ref: { groupId: 'mg', cueId: 'mc' },
              source: 'auto',
              manualFallback: false,
            }),
          )
        } finally {
          randSpy.mockRestore()
          findSpy.mockRestore()
        }
      })

      it('uses manual motion ref when set and emits manual source', async () => {
        const reg = YargCueRegistry.getInstance()
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('manual-m', executeMock)
        const implSpy = jest.spyOn(reg, 'getMotionCueImplementation').mockReturnValue(motionCue)
        const findSpy = jest
          .spyOn(reg, 'findYargMotionCueRef')
          .mockReturnValue({ groupId: 'g1', cueId: 'm1' })
        const randSpy = jest.spyOn(reg, 'getRandomMotionCue')

        cueHandler.setManualMotionRef({ groupId: 'g1', cueId: 'm1' })
        try {
          await cueHandler.handleCue(CueType.Default, mockCueData)

          expect(randSpy).not.toHaveBeenCalled()
          expect(sendToAllWindows).toHaveBeenCalledWith(
            RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
            expect.objectContaining({
              ref: { groupId: 'g1', cueId: 'm1' },
              source: 'manual',
              manualFallback: false,
            }),
          )
        } finally {
          implSpy.mockRestore()
          findSpy.mockRestore()
          randSpy.mockRestore()
        }
      })

      it('falls back to random when manual ref does not resolve and emits manualFallback', async () => {
        const reg = YargCueRegistry.getInstance()
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('fallback', executeMock)
        const implSpy = jest.spyOn(reg, 'getMotionCueImplementation').mockReturnValue(null)
        const randSpy = jest.spyOn(reg, 'getRandomMotionCue').mockReturnValue(motionCue)
        const findSpy = jest
          .spyOn(reg, 'findYargMotionCueRef')
          .mockReturnValue({ groupId: 'mg', cueId: 'fb' })

        cueHandler.setManualMotionRef({ groupId: 'bad', cueId: 'bad' })
        try {
          await cueHandler.handleCue(CueType.Default, mockCueData)

          expect(sendToAllWindows).toHaveBeenCalledWith(
            RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
            expect.objectContaining({ source: 'auto', manualFallback: true }),
          )
        } finally {
          implSpy.mockRestore()
          randSpy.mockRestore()
          findSpy.mockRestore()
        }
      })

      it('emits YARG_MOTION_CUE_CHANGE only once when the same motion ref is picked on re-queue', async () => {
        const reg = YargCueRegistry.getInstance()
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('motion-dedupe', executeMock)
        const randSpy = jest.spyOn(reg, 'getRandomMotionCue').mockReturnValue(motionCue)
        const findSpy = jest
          .spyOn(reg, 'findYargMotionCueRef')
          .mockReturnValue({ groupId: 'mg', cueId: 'same' })
        try {
          await cueHandler.handleCue(CueType.Default, mockCueData)
          await cueHandler.handleCue(CueType.Default, mockCueData)

          const motionChangeCalls = (sendToAllWindows as jest.Mock).mock.calls.filter(
            (call) => call[0] === RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
          )
          expect(motionChangeCalls.length).toBe(1)
        } finally {
          randSpy.mockRestore()
          findSpy.mockRestore()
        }
      })

      it('re-picks motion and re-emits YARG_MOTION_CUE_CHANGE after motion disable then enable', async () => {
        const reg = YargCueRegistry.getInstance()
        const executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const motionCue = makeMotionCue('motion-reenable', executeMock)
        const randSpy = jest.spyOn(reg, 'getRandomMotionCue').mockReturnValue(motionCue)
        const findSpy = jest
          .spyOn(reg, 'findYargMotionCueRef')
          .mockReturnValue({ groupId: 'mg', cueId: 're' })
        try {
          await cueHandler.handleCue(CueType.Default, mockCueData)
          expect(randSpy).toHaveBeenCalledTimes(1)

          cueHandler.setMotionEnabled(false)
          cueHandler.setMotionEnabled(true)
          ;(sendToAllWindows as jest.Mock).mockClear()

          await cueHandler.handleCue(CueType.Default, mockCueData)

          expect(randSpy).toHaveBeenCalledTimes(2)
          expect(sendToAllWindows).toHaveBeenCalledWith(
            RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
            expect.objectContaining({
              ref: { groupId: 'mg', cueId: 're' },
              source: 'auto',
            }),
          )
        } finally {
          randSpy.mockRestore()
          findSpy.mockRestore()
        }
      })
    })
  })

  /**
   * Handler-level rapid-fire regression: no debounce, so every cue that reaches the handler is executed.
   * Asserts rapid A -> B -> A and same-cue repeat behaviour using mock cues (not V2 runtime queue).
   */
  describe('rapid-fire (no debounce)', () => {
    it('Strobe_Slow -> Strobe_Off -> Strobe_Slow allows re-activation', async () => {
      const strobeSlow = new MockStrobeCue(CueType.Strobe_Slow)
      const v2Group: ICueGroup = {
        id: 'v2-strobe-group',
        name: 'v2-strobe',
        description: 'V2 rapid-fire strobe test',
        cues: new Map<CueType, INetCue>([[CueType.Strobe_Slow, strobeSlow]]),
      }
      registry.registerGroup(v2Group)
      registry.setDefaultGroup(v2Group.id)
      registry.activateGroup(v2Group.id)

      const mockCueData: CueData = {
        beat: 'Strong',
        strobeState: 'Strobe_Slow',
      } as CueData

      await cueHandler.handleCue(CueType.Strobe_Slow, mockCueData)
      expect(strobeSlow.executeMock).toHaveBeenCalledTimes(1)
      expect(strobeSlow.onStopMock).not.toHaveBeenCalled()

      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData)
      expect(strobeSlow.onStopMock).toHaveBeenCalledTimes(1)
      expect(strobeSlow.executeMock).toHaveBeenCalledTimes(1)

      await cueHandler.handleCue(CueType.Strobe_Slow, mockCueData)
      expect(strobeSlow.executeMock).toHaveBeenCalledTimes(2)
      expect(strobeSlow.onStopMock).toHaveBeenCalledTimes(1)
    })

    it('Sweep -> Stomp -> Sweep allows rapid primary transition', async () => {
      const sweepCue = new MockPrimaryCue(CueType.Sweep)
      const stompCue = new MockPrimaryCue(CueType.Stomp)
      const v2Group: ICueGroup = {
        id: 'v2-primary-group',
        name: 'v2-primary',
        description: 'V2 rapid-fire primary test',
        cues: new Map<CueType, INetCue>([
          [CueType.Sweep, sweepCue],
          [CueType.Stomp, stompCue],
        ]),
      }
      registry.registerGroup(v2Group)
      registry.setDefaultGroup(v2Group.id)
      registry.activateGroup(v2Group.id)

      const mockCueData: CueData = {
        beat: 'Strong',
        strobeState: 'Strobe_Off',
      } as CueData

      await cueHandler.handleCue(CueType.Sweep, mockCueData)
      expect(sweepCue.executeMock).toHaveBeenCalledTimes(1)
      expect(stompCue.executeMock).not.toHaveBeenCalled()

      await cueHandler.handleCue(CueType.Stomp, mockCueData)
      expect(sweepCue.onStopMock).toHaveBeenCalledTimes(1)
      expect(stompCue.executeMock).toHaveBeenCalledTimes(1)

      await cueHandler.handleCue(CueType.Sweep, mockCueData)
      expect(stompCue.onStopMock).toHaveBeenCalledTimes(1)
      expect(sweepCue.executeMock).toHaveBeenCalledTimes(2)
    })

    it('repeated same-cue calls all reach execute (no debounce)', async () => {
      const strobeSlow = new MockStrobeCue(CueType.Strobe_Slow)
      const v2Group: ICueGroup = {
        id: 'v2-same-cue-group',
        name: 'v2-same-cue',
        description: 'V2 same-cue repeat test',
        cues: new Map<CueType, INetCue>([[CueType.Strobe_Slow, strobeSlow]]),
      }
      registry.registerGroup(v2Group)
      registry.setDefaultGroup(v2Group.id)
      registry.activateGroup(v2Group.id)
      const mockCueData: CueData = { beat: 'Strong', strobeState: 'Strobe_Slow' } as CueData

      await cueHandler.handleCue(CueType.Strobe_Slow, mockCueData)
      await cueHandler.handleCue(CueType.Strobe_Slow, mockCueData)
      await cueHandler.handleCue(CueType.Strobe_Slow, mockCueData)
      expect(strobeSlow.executeMock).toHaveBeenCalledTimes(3)
    })
  })
})
