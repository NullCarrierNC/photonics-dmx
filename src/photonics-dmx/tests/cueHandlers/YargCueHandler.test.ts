import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { afterEach, beforeEach, describe, jest, it, expect } from '@jest/globals'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import { setNodeV2Enabled } from '../../cues/node/v2/nodeV2FeatureFlag'

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
      shutdown: jest.fn(),
    } as any

    cueHandler = new YargCueHandler(mockLightManager, mockSequencer)
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
      setNodeV2Enabled(true)
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
      setNodeV2Enabled(null)
    })

    it('Strobe_Off only clears strobe, not secondary overlay', async () => {
      setNodeV2Enabled(true)
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
      setNodeV2Enabled(null)
    })

    it('new secondary replaces old secondary but not primary or strobe', async () => {
      setNodeV2Enabled(true)
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
      setNodeV2Enabled(null)
    })

    it('Strobe_Off is always processed and clears strobe (no debounce)', async () => {
      setNodeV2Enabled(false)
      await cueHandler.handleCue(CueType.Strobe_Fast, mockCueData)
      expect(mockStrobeCue.executeMock).toHaveBeenCalledTimes(1)

      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData)
      expect(mockStrobeCue.onStopMock).toHaveBeenCalledTimes(1)
      setNodeV2Enabled(null)
    })
  })

  /**
   * Handler-level rapid-fire regression: no debounce, so every cue that reaches the handler is executed.
   * Asserts rapid A -> B -> A and same-cue repeat behaviour using mock cues (not V2 runtime queue).
   */
  describe('rapid-fire (no debounce)', () => {
    beforeEach(() => {
      setNodeV2Enabled(true)
    })
    afterEach(() => {
      setNodeV2Enabled(null)
    })

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
