import { DefaultCue } from '../../../cues/yarg/handlers/default/DefaultCue';
import { CueData } from '../../../cues/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { beforeEach, describe, jest, it, expect } from '@jest/globals';

describe('DefaultCue', () => {
  let cue: DefaultCue;
  let mockController: jest.Mocked<ILightingController>;
  let mockLightManager: jest.Mocked<DmxLightManager>;

  beforeEach(() => {
    cue = new DefaultCue();
    
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
    it('should set default lighting state', async () => {
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
        lightingCue: "Default",
        postProcessing: "Default",
        fogState: false,
        strobeState: "Strobe_Off",
        performer: 0,
        beat: "Strong",
        keyframe: "Unknown",
        bonusEffect: false,
      };

      await cue.execute(data, mockController, mockLightManager);

      // Verify that setEffect was called with the default effect
      expect(mockController.setEffect).toHaveBeenCalledWith('default', expect.any(Object));
    });

    it('should handle missing data', async () => {
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
        lightingCue: "Default",
        postProcessing: "Default",
        fogState: false,
        strobeState: "Strobe_Off",
        performer: 0,
        beat: "Strong",
        keyframe: "Unknown",
        bonusEffect: false,
      };

      await cue.execute(data, mockController, mockLightManager);

      // Verify that setEffect was called with the default effect
      expect(mockController.setEffect).toHaveBeenCalledWith('default', expect.any(Object));
    });
  });
}); 