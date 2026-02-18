import type { CueData } from '../../photonics-dmx/cues/types/cueTypes';

export type MockCueDataOptions = {
  venueSize?: 'NoVenue' | 'Small' | 'Large';
  bpm?: number;
  effectId?: string | null;
  beat?: CueData['beat'];
  keyframe?: string;
};

/**
 * Creates mock cue data for simulation handlers (beat, keyframe, measure, instrument)
 */
export function createMockCueData(options: MockCueDataOptions = {}): CueData {
  const {
    venueSize = 'Small',
    bpm = 120,
    effectId,
    beat = 'Unknown',
    keyframe = 'Unknown'
  } = options;

  const base: CueData = {
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize,
    beatsPerMinute: bpm,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: effectId ?? 'None',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 0,
    trackMode: 'simulated',
    beat,
    keyframe,
    bonusEffect: false,
    ledPositions: [],
    ledColor: 'off'
  };
  return { ...base, timestamp: Date.now() } as CueData;
}
