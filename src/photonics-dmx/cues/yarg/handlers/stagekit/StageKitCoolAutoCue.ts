import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectClockwiseRotation, getEffectCounterClockwiseRotation } from '../../../../effects/effectRotationPatterns';

/**
 * StageKit Cool Auto Cue
 * 2x blue, 1x green. Blue animating clockwise, green animating counter-clockwise.
 */
export class StageKitCoolAutoCue implements ICue {
  id = 'stagekit-coolAuto';
  cueId = CueType.Cool_Automatic;
  description = '2x blue, 1x green. Blue animating clockwise, green animating counter-clockwise, on beat.';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blueColor = getColor('blue', 'medium', 'add');
    const greenColor = getColor('green', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium');

    // Green effect: Counter-clockwise rotation starting at 90° position (1/4 of ring)
    const greenEffect = getEffectCounterClockwiseRotation({
      lights: allLights,
      activeColor: greenColor,
      baseColor: transparentColor,
      layer: 5,
      waitFor: 'beat',
      startOffset: Math.floor(allLights.length / 4)
    });

   
  
   // Create blue effects for each pair with offset timing
    const blueEffect1 = getEffectClockwiseRotation({
      lights: allLights,
      activeColor: blueColor,
      baseColor: transparentColor,
      layer: 0,
      waitFor: 'beat'
    });

    const blueEffect2 = getEffectClockwiseRotation({
      lights: allLights,
      activeColor: blueColor,
      baseColor: transparentColor,
      layer: 2,
      waitFor: 'beat',
      startOffset: allLights.length / 2
    });

 
    // Add both effects to the sequencer
    if (this.isFirstExecution) {
      sequencer.setEffect('cool-auto-blue', blueEffect1);
      sequencer.addEffect('cool-auto-blue', blueEffect2);
      sequencer.addEffect('cool-auto-green', greenEffect);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('cool-auto-blue', blueEffect1);
      sequencer.addEffect('cool-auto-blue', blueEffect2);
      sequencer.addEffect('cool-auto-green', greenEffect);
    }
  }

  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 