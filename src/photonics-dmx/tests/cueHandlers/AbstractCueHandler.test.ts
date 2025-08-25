/*
 * AbstractCueHandler Test Suite
 * 
 * This suite tests the functionality of the AbstractCueHandler.
 * It creates a concrete subclass (TestCueHandler) to implement the abstract methods for testing purposes.
 * 
 * The tests verify that:
 *  - Rapid cue calls are debounced, meaning that multiple quick calls only invoke the handler once.
 */

import { AbstractCueHandler } from '../../cueHandlers/AbstractCueHandler';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { ILightingController } from '../../controllers/sequencer/interfaces';

import { createMockLightingConfig } from '../helpers/testFixtures';
import { afterEach, beforeEach, describe, jest ,it, expect } from '@jest/globals';
import { CueData, CueType } from '../../cues/cueTypes';

class TestCueHandler extends AbstractCueHandler {
  // Implement abstract methods for testing
  protected handleCueDefault = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueDischord = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueChorus = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueCool_Manual = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStomp = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueVerse = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueWarm_Manual = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBigRockEnding = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Spotlight = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueCool_Automatic = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFlare_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFlare_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFrenzy = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueIntro = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueHarmony = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSilhouettes = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSilhouettes_Spotlight = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSearchlights = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Fastest = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Medium = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Off = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSweep = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueWarm_Automatic = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_First = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_Next = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_Previous = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueMenu = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueScore = jest.fn(async (_: CueData): Promise<void> => {});
}

describe('AbstractCueHandler', () => {
  let lightManager: DmxLightManager;
  let sequencer: ILightingController;
  let cueHandler: TestCueHandler;

  beforeEach(() => {
    const config = createMockLightingConfig();
    lightManager = new DmxLightManager(config);
    
    // Create a mock that implements ILightingController (Sequencer facade)
    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn().mockImplementation(async () => {}),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      setState: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      blackout: jest.fn().mockImplementation(async () => {}),
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      removeEffectByLayer: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      shutdown: jest.fn()
    } as ILightingController;
    
    cueHandler = new TestCueHandler(lightManager, sequencer, 100);
  });

  afterEach(() => {
    cueHandler.shutdown();
    jest.clearAllMocks();
  });

  describe('handleCue', () => {
    it('should debounce rapid cue calls', () => {
      const cueData: CueData = {
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
        lightingCue: CueType.Default,
        postProcessing: 'Default',
        fogState: false,
        strobeState: 'Strobe_Off',
        performer: 0,
        autoGenTrack: false,
        beat: 'Off',
        keyframe: 'Off',
        bonusEffect: false
      };

      // Call cue multiple times rapidly
      cueHandler.handleCue(CueType.Default, cueData);
      cueHandler.handleCue(CueType.Default, cueData);
      cueHandler.handleCue(CueType.Default, cueData);

      expect(cueHandler['handleCueDefault']).toHaveBeenCalledTimes(1);
    });
  });

}); 