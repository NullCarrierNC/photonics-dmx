import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';

export class CoolAutomaticCue implements ICue {
  id = 'default-cool-auto';
  cueId = CueType.Cool_Automatic;
  description = 'Alternates blue and green between front and back lights, triggered by measure events';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front'], 'all');
    const odd = lightManager.getLights(['back'], 'all');
    const all = lightManager.getLights(['front', 'back'], 'all');

    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 100,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: green,
      afterEndColorWait: 0,
      duration: 200,
      lights: odd,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: green,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 200,
      lights: even,
      layer: 2,
    });

    if (this.isFirstExecution) {
      sequencer.setEffect('cool-auto-base', baseLayer);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('cool-auto-base', baseLayer);
    }
    
    sequencer.addEffect('cool-auto-e', crossFadeEven);
    sequencer.addEffect('cool-auto-o', crossFadeOdd);
  }

  onStop(): void {
    this.isFirstExecution = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 