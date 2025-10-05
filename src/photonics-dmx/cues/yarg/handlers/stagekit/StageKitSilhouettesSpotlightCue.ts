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
  description = 'Context-aware cue: Intro=blue flash on drum-red, Dischord=green backdrop+blue odd+vocal toggle, Stomp=darkness';
  style = CueStyle.Primary;
  private isFirstExecution = true;

  async execute(cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Context-aware behavior based on previous cue
    const previousCue = cueData.previousCue;
    
    if (previousCue === CueType.Intro) {
      // Previous cue was Intro: Blue flash on drum-red
      const allLights = lightManager.getLights(['front', 'back'], 'all');
      const blue = getColor('blue', 'medium');

      const flashEffect = getEffectFlashColor({
        lights: allLights,
        color: blue,
        startTrigger: 'drum-red',
        holdTime: 200,
        durationIn: 0, 
        durationOut: 0,
        layer: 100,
      });

      const baseEffect = getEffectSingleColor({
        lights: allLights,
        color: getColor('transparent', 'medium'),
        duration: 10,
        layer: 0,
      });

      if (this.isFirstExecution) {
        await sequencer.setEffect('silhouettes-spotlight-base', baseEffect);
        await sequencer.addEffect('silhouettes-spotlight-flash', flashEffect);
        this.isFirstExecution = false;
      } else {
        await sequencer.addEffect('silhouettes-spotlight-base', baseEffect);
        await  sequencer.addEffect('silhouettes-spotlight-flash', flashEffect);
      }
      
    } else if (previousCue === CueType.Dischord) {
      // Previous cue was Dischord: Green backdrop + blue odd positions + vocal response
      const allLights = lightManager.getLights(['front', 'back'], 'all');
  //    const oddLights = lightManager.getLights(['front', 'back'], 'odd');
      const green = getColor('green', 'medium');
  //    const blue = getColor('blue', 'medium');

      // Green backdrop (always on)
      const greenBackdrop = getEffectSingleColor({
        lights: allLights,
        color: green,
        duration: 10,
        layer: 0,
      });

      // Blue odd positions (initially on)
      /* Disabled Blue handling until vocal harmony toggle is implemented
      const blueOdd = getEffectSingleColor({
        lights: oddLights,
        color: blue,
        duration: 10,
        layer: 1,
      });
*/
      // TODO: Add vocal harmony toggle logic 

      if (this.isFirstExecution) {
        await sequencer.setEffect('silhouettes-spotlight-green', greenBackdrop);
  //      await sequencer.addEffect('silhouettes-spotlight-blue-odd', blueOdd);
        this.isFirstExecution = false;
      } else {
        sequencer.addEffect('silhouettes-spotlight-green', greenBackdrop);
  //      sequencer.addEffect('silhouettes-spotlight-blue-odd', blueOdd);
      }
      
    } else {
      // Default case (including previousCue === CueType.Stomp): Complete darkness
      const allLights = lightManager.getLights(['front', 'back'], 'all');
      const darkEffect = getEffectSingleColor({
        lights: allLights,
        color: getColor('transparent', 'medium'),
        duration: 10,
        layer: 0,
      });

      if (this.isFirstExecution) {
        await sequencer.setEffect('silhouettes-spotlight-dark', darkEffect);
        this.isFirstExecution = false;
      } else {
        sequencer.addEffect('silhouettes-spotlight-dark', darkEffect);
      }
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