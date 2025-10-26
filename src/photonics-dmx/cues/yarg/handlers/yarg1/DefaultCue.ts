import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';

export class DefaultCue implements ICue {
  id = 'default-default';
  cueId = CueType.Default;
  description = 'Alternates red and blue between front and back lights, triggered by keyframe events';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const front = lightManager.getLights(['front'], 'all');
    const back = lightManager.getLights(['back'], 'all');
    const all = lightManager.getLights(['front', 'back'], 'all');

    const red = getColor('red', 'medium');
    const blue = getColor('blue', 'medium');

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: red,
      duration: 100,
    });

    const crossFadeFront = getEffectCrossFadeColors({
      startColor: red,
      crossFadeTrigger: 'keyframe',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 200,
      lights: front,
      layer: 1,
    });
    const crossFadeBack = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'keyframe',
      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: 200,
      lights: back,
      layer: 2,
    });

    if (this.isFirstExecution) {
      sequencer.setEffect('default-base', baseLayer);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('default-base', baseLayer);
    }
    
    sequencer.addEffect('default-front', crossFadeFront);
    sequencer.addEffect('default-back', crossFadeBack);
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