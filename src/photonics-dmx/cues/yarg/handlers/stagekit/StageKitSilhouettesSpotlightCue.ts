import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getEffectFlashColor } from '../../../../effects/effectFlashColor';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects';

/**
 * StageKit Silhouettes Spotlight Cue - Beat-synchronized flash on front and back lights
 */
export class StageKitSilhouettesSpotlightCue implements ICue {
  id = 'stagekit-silhouettesspotlight';
  cueId = CueType.Silhouettes_Spotlight;
  description = 'Flash blue on front and back lights (third-2) on drum-red';
  style = CueStyle.Primary;
  private isFirstExecution = true;

  async execute(_cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Get front and back lights
    const frontLights = lightManager.getLights(['front'], 'third-2');
    const backLights = lightManager.getLights(['back'], 'third-2');
    const allLights = [...frontLights, ...backLights];
    const blue = getColor('blue', 'medium');

    // Create beat-synchronized flash effect
    const flashEffect = getEffectFlashColor({
      lights: allLights,
      color: blue,
      startTrigger: 'drum-red',
      holdTime: 200,
      durationIn: 0, 
      durationOut: 0,
      layer: 1,
    });

    const solidEffect = getEffectSingleColor({
      lights:  lightManager.getLights(['front', 'back'], 'all'),
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
       sequencer.addEffect('silhouettes-spotlight-off', solidEffect);
       sequencer.addEffect('silhouettes-spotlight-blue', flashEffect);
     }
  }

  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
  }

  onPause(): void {
   
  }

  onDestroy(): void {
   
  }
} 