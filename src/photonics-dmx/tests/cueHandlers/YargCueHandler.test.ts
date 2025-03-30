import { YargCueHandler } from '../../cueHandlers/YargCueHandler';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { CueData, CueType } from '../../cues/cueTypes';
import { beforeEach, describe, jest, it, expect } from '@jest/globals';
import { CueRegistry } from '../../cues/CueRegistry';
import '../../cues/yarg'; // This will register the default cue group

describe('YargCueHandler', () => {
  let cueHandler: YargCueHandler;
  let mockLightManager: jest.Mocked<DmxLightManager>;
  let mockSequencer: jest.Mocked<ILightingController>;

  beforeEach(() => {
    // Reset the CueRegistry
    CueRegistry.getInstance().reset();

    // Create mock light manager
    mockLightManager = {
      getLights: jest.fn(),
      getLightsInGroup: jest.fn(),
      getLightsByTarget: jest.fn(),
      getDmxLight: jest.fn(),
      setConfiguration: jest.fn(),
      shutdown: jest.fn(),
    } as any;

    // Create mock sequencer
    mockSequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      setState: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      blackout: jest.fn(),
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      shutdown: jest.fn(),
    } as any;

    // Use a shorter debounce period for testing
    cueHandler = new YargCueHandler(mockLightManager, mockSequencer, 10);
  });

  describe('handleBeat', () => {
    it('should call onBeat on the sequencer', () => {
      cueHandler.handleBeat();
      expect(mockSequencer.onBeat).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMeasure', () => {
    it('should call onBeat and onMeasure on the sequencer', () => {
      cueHandler.handleMeasure();
      expect(mockSequencer.onBeat).toHaveBeenCalledTimes(1);
      expect(mockSequencer.onMeasure).toHaveBeenCalledTimes(1);
    });
  });

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
      beat: 'Strong',
      keyframe: 'Off',
      bonusEffect: false,
    };

    it('should emit cueHandled event for special cases', async () => {
      jest.useFakeTimers();
      const cueHandledListener = jest.fn();
      cueHandler.on('cueHandled', cueHandledListener);

      // Test Blackout_Fast
      await cueHandler.handleCue(CueType.Blackout_Fast, mockCueData);
      expect(cueHandledListener).toHaveBeenCalledWith(mockCueData);
      expect(mockSequencer.blackout).toHaveBeenCalledWith(0);

      // Reset mock calls and advance timers
      mockSequencer.blackout.mockClear();
      cueHandledListener.mockClear();
      jest.advanceTimersByTime(20);

      // Test Blackout_Slow
      await cueHandler.handleCue(CueType.Blackout_Slow, mockCueData);
      expect(cueHandledListener).toHaveBeenCalledWith(mockCueData);
      expect(mockSequencer.blackout).toHaveBeenCalledWith(1000);

      // Reset mock calls and advance timers
      mockSequencer.blackout.mockClear();
      cueHandledListener.mockClear();
      jest.advanceTimersByTime(20);

      // Test Strobe_Off
      await cueHandler.handleCue(CueType.Strobe_Off, mockCueData);
      expect(cueHandledListener).toHaveBeenCalledWith(mockCueData);
      expect(mockSequencer.blackout).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should emit cueHandled event for regular cues', async () => {
      const cueHandledListener = jest.fn();
      cueHandler.on('cueHandled', cueHandledListener);

      // Test with a regular cue
      await cueHandler.handleCue(CueType.Default, mockCueData);
      expect(cueHandledListener).toHaveBeenCalledWith(mockCueData);
    });

    it('should emit cueHandled event even when no implementation is found', async () => {
      const cueHandledListener = jest.fn();
      cueHandler.on('cueHandled', cueHandledListener);

      // Test with an unknown cue type
      await cueHandler.handleCue(CueType.Unknown, mockCueData);
      expect(cueHandledListener).toHaveBeenCalledWith(mockCueData);
    });

    it('should respect debounce period', async () => {
      jest.useFakeTimers();
      const cueHandledListener = jest.fn();
      cueHandler.on('cueHandled', cueHandledListener);

      // Call handleCue twice within debounce period
      await cueHandler.handleCue(CueType.Default, mockCueData);
      await cueHandler.handleCue(CueType.Default, mockCueData);

      // Should only emit once due to debounce
      expect(cueHandledListener).toHaveBeenCalledTimes(1);

      // Advance timers past debounce period
      jest.advanceTimersByTime(20);

      // Call handleCue again after debounce period
      await cueHandler.handleCue(CueType.Default, mockCueData);

      // Should emit again after debounce period
      expect(cueHandledListener).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
}); 