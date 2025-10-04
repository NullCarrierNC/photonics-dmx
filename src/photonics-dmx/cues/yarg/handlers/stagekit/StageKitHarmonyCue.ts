import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { 
  getEffectClockwiseRotation,  
} from '../../../../effects';

/**
 * StageKit Harmony Cue - Venue-dependent clockwise chase patterns
 */
export class StageKitHarmonyCue implements ICue {
  id = 'stagekit-harmony';
  cueId = CueType.Harmony;
  description = 'Small venue: Green/blue clockwise chase on beat (= high cyan). Large venue: Yellow/red dual rotation patterns with 3-step and 4-step offsets (= additive blending).';
  style = CueStyle.Primary;

  // Track whether this is the first execution or a repeat
  private isFirstExecution: boolean = true;

  async execute(cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const isLargeVenue = cueData.venueSize === 'Large';
    const transparentColor = getColor('transparent', 'medium');
    
    if (isLargeVenue) {
      // Large venue: Yellow and Red dual rotation with offsets
      const yellowColor = getColor('yellow', 'medium', 'add');
      const redColor = getColor('red', 'medium', 'add');
      
      // Yellow: Clockwise rotation with 3-step offset
      const yellowEffect = getEffectClockwiseRotation({
        lights: allLights,
        activeColor: yellowColor,
        baseColor: transparentColor,
        layer: 0,
        waitFor: 'beat',
        beatsPerCycle: 1,
        startOffset: 3,
      });
      
      // Red: Clockwise rotation with 4-step offset
      const redEffect = getEffectClockwiseRotation({
        lights: allLights,
        activeColor: redColor,
        baseColor: transparentColor,
        layer: 1,
        waitFor: 'beat',
        beatsPerCycle: 1,
        startOffset: 4,
      });
      
      // Apply both effects
      if (this.isFirstExecution) {
        await controller.setEffect('stagekit-harmony-yellow', yellowEffect);
        await controller.addEffect('stagekit-harmony-red', redEffect);
        this.isFirstExecution = false;
      } else {
        await controller.addEffect('stagekit-harmony-yellow', yellowEffect);
        await controller.addEffect('stagekit-harmony-red', redEffect);
      }
    } else {
      // Small venue: Green/Blue clockwise chase (cyan color)
      const cyanColor = getColor('cyan', 'high', 'add');
      
      const cyanEffect = getEffectClockwiseRotation({
        lights: allLights,
        activeColor: cyanColor,
        baseColor: transparentColor,
        layer: 0,
        waitFor: 'beat',
        beatsPerCycle: 1,
      });
      
      // Apply the effect
      if (this.isFirstExecution) {
        await controller.setEffect('stagekit-harmony-cyan', cyanEffect);
        this.isFirstExecution = false;
      } else {
        await controller.addEffect('stagekit-harmony-cyan', cyanEffect);
      }
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