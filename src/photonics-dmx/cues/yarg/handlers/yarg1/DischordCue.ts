import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { 
  getEffectFlashColor, 
  getEffectClockwiseRotation, 
  getEffectDualModeRotation, 
  getEffectAlternatingPatterns 
} from '../../../../effects';

/**
 * Dischord Cue - Stage Kit Implementation
 * Yellow LEDs: Sequential clockwise rotation (0→1→2→3→4→5→6→7) responding to beats
 * Green LEDs: Dual behavior - spinning counter-clockwise OR solid on, toggles on measure (large venues only)
 * Blue LEDs: Two alternating patterns on keyframe events - Pattern A: side positions, Pattern B: even positions
 * Red LEDs: Flash all lights on red drum hits
 */
export class DischordCue implements ICue {
  id = 'default-dischord';
  cueId = CueType.Dischord;
  description = 'Yellow clockwise rotation on beat, green dual-mode (spinning/solid) on measure, blue alternating patterns on keyframe, red flash on red drum';
  style = CueStyle.Primary;
  private isFirstExecution = true;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const yellowColor = getColor('yellow', 'medium', 'add');
    const greenColor = getColor('green', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'replace');
    const transparentColor = getColor('transparent', 'medium');
    const redColor = getColor('red', 'medium', 'replace');

    // Yellow: Clockwise rotation on beat (0→1→2→3→4→5→6→7)
    const yellowEffect = getEffectClockwiseRotation({
      lights: allLights,
      activeColor: yellowColor,
      baseColor: transparentColor,
      layer: 2,
      waitFor: 'beat',
      beatsPerCycle: 1,
    });

    // Green: Dual behavior - spinning counter-clockwise OR solid on, toggles on measure (large venues only)
    const greenEffect = getEffectDualModeRotation({
      lights: allLights,
      activeColor: greenColor,
      baseColor: transparentColor,
      solidColor: greenColor,
      isLargeVenue: parameters.venueSize === 'Large',
      layer: 1,
      waitFor: 'beat',
      beatsPerCycle: 2, // 0.5 cycles per beat = 2 beats per cycle
      modeSwitchTrigger: 'measure',
    });

    // Blue: Two alternating patterns on keyframe events
    const bluePatternA = lightManager.getLights(['front', 'back'], 'third-2');
    const bluePatternB = lightManager.getLights(['front', 'back'], 'even');
    const blueEffect = getEffectAlternatingPatterns({
      patternALights: bluePatternA,
      patternBLights: bluePatternB,
      activeColor: blueColor,
      baseColor: transparentColor,
      layer: 0,
      switchTrigger: 'keyframe',
      completeTrigger: 'beat',
    });

    // Red: Flash all lights on red drum hits
    const redFlash = getEffectFlashColor({
      lights: allLights,
      color: redColor,
      startTrigger: 'drum-red',
      durationIn: 0,
      holdTime: 120,
      durationOut: 150,
      layer: 101,
    });

    // Apply the effects
    if (this.isFirstExecution) {
      // First time: use setEffect to clear any existing effects and start fresh
      sequencer.setEffect('dischord-yellow', yellowEffect);
      sequencer.addEffect('dischord-green', greenEffect);
      sequencer.addEffect('dischord-blue', blueEffect);
      sequencer.addEffect('dischord-red', redFlash);
      this.isFirstExecution = false;
    } else {
      // Repeat call: use addEffect to add to existing effects
      sequencer.addEffect('dischord-yellow', yellowEffect);
      sequencer.addEffect('dischord-green', greenEffect);
      sequencer.addEffect('dischord-blue', blueEffect);
      sequencer.addEffect('dischord-red', redFlash);
    }
  }


  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
  }
} 