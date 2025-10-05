import { ChorusCue } from '../../../cues/yarg/handlers/yarg1/ChorusCue';
import { CueData } from '../../../cues/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { beforeEach, describe, jest, it, expect } from '@jest/globals';

describe('ChorusCue', () => {
  let cue: ChorusCue;
  let mockController: jest.Mocked<ILightingController>;
  let mockLightManager: jest.Mocked<DmxLightManager>;

  beforeEach(() => {
    cue = new ChorusCue();
    
    // Create mock controller
    mockController = {
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

    // Create mock light manager
    mockLightManager = {
      getLights: jest.fn().mockReturnValue([
        { id: 'light1', position: 0, config: {} },
        { id: 'light2', position: 1, config: {} },
      ]),
      getLightsInGroup: jest.fn(),
      getLightsByTarget: jest.fn(),
      getDmxLight: jest.fn(),
      setConfiguration: jest.fn(),
      shutdown: jest.fn(),
    } as any;
  });

  describe('execute', () => {
    it('should set chorus lighting state', async () => {
      // Reset the cue to ensure fresh state
      cue.onStop();
      
      const data: CueData = {
        datagramVersion: 1,
        platform: "RB3E",
        currentScene: "Gameplay",
        pauseState: "Unpaused",
        venueSize: "Large",
        beatsPerMinute: 120,
        songSection: "Verse",
        guitarNotes: [],
        bassNotes: [],
        drumNotes: [],
        keysNotes: [],
        vocalNote: 0,
        harmony0Note: 0,
        harmony1Note: 0,
        harmony2Note: 0,
        lightingCue: "Chorus",
        postProcessing: "Default",
        fogState: false,
        strobeState: "Strobe_Off",
        performer: 0,
        trackMode: 'tracked',
        beat: "Strong",
        keyframe: "Unknown",
        bonusEffect: false,
        cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
      };

      await cue.execute(data, mockController, mockLightManager);

      // Verify that setEffect was called for the first light and addEffect for the second
      expect(mockController.setEffect).toHaveBeenCalledTimes(1);
      expect(mockController.setEffect).toHaveBeenCalledWith('chorus-0', expect.any(Object));
      expect(mockController.addEffect).toHaveBeenCalledTimes(1);
      expect(mockController.addEffect).toHaveBeenCalledWith('chorus-1', expect.any(Object));
    });

    it('should handle missing data', async () => {
      // Reset the cue to simulate a fresh execution
      cue.onStop();
      
      const data: CueData = {
        datagramVersion: 1,
        platform: "RB3E",
        currentScene: "Gameplay",
        pauseState: "Unpaused",
        venueSize: "Large",
        beatsPerMinute: 120,
        songSection: "Verse",
        guitarNotes: [],
        bassNotes: [],
        drumNotes: [],
        keysNotes: [],
        vocalNote: 0,
        harmony0Note: 0,
        harmony1Note: 0,
        harmony2Note: 0,
        lightingCue: "Chorus",
        postProcessing: "Default",
        fogState: false,
        strobeState: "Strobe_Off",
        performer: 0,
        trackMode: 'tracked',
        beat: "Strong",
        keyframe: "Unknown",
        bonusEffect: false,
        cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
      };

      await cue.execute(data, mockController, mockLightManager);

      // Verify that setEffect was called for the first light and addEffect for the second
      expect(mockController.setEffect).toHaveBeenCalledTimes(1);
      expect(mockController.setEffect).toHaveBeenCalledWith('chorus-0', expect.any(Object));
      expect(mockController.addEffect).toHaveBeenCalledTimes(1);
      expect(mockController.addEffect).toHaveBeenCalledWith('chorus-1', expect.any(Object));
    });
  });
}); 