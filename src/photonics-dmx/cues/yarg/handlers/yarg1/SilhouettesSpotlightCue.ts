import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectFlashColor } from '../../../../effects';

export class SilhouettesSpotlightCue implements ICue {
  id = 'default-silhouettes-spotlight';
  cueId = CueType.Silhouettes_Spotlight;
  description = 'Flash blue on back lights (or front if no back lights) triggered by drum-red';
  style = CueStyle.Primary;
  private isFirstExecution = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
      // Get back lights first, fall back to front lights if no back lights
      const backLights = lightManager.getLights(['back'], 'all');
      const targetLights = backLights.length > 0 ? backLights : lightManager.getLights(['front'], 'all');
      const blue = getColor('blue', 'medium');
  
      // Create drum-red triggered flash effect
      const flashEffect = getEffectFlashColor({
        lights: targetLights,
        color: blue,
        startTrigger: 'drum-red',
        holdTime: 200,
        durationIn: 0, 
        durationOut: 0,
        layer: 1,
      });
  
      const solidEffect = getEffectSingleColor({
        lights: lightManager.getLights(['front', 'back'], 'all'),
        color: getColor('transparent', 'medium'),
        duration: 10,
        layer: 0,
      });
           // Apply the effects
       if (this.isFirstExecution) {
         // First time: use setEffect to clear any existing effects and start fresh
         await sequencer.setEffect('silhouettes-spotlight-off', solidEffect);
         await sequencer.addEffect('silhouettes-spotlight-blue', flashEffect);
         this.isFirstExecution = false;
       } else {
         // Repeat call: use addEffect to add to existing effects
         await sequencer.addEffect('silhouettes-spotlight-off', solidEffect);
         await sequencer.addEffect('silhouettes-spotlight-blue', flashEffect);
       }
  }


  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
  }


} 