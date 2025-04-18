import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../effects/effectCrossFadeColors';
import { YargCue } from '../YargCue';

export class WarmAutomaticCue implements ICue {
  name = YargCue.WarmAutomatic;
  description = 'Alternates red and yellow between front and back lights, triggered by measure events';

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front'], 'all');
    const odd = lightManager.getLights(['back'], 'all');
    const all = lightManager.getLights(['front', 'back'], 'all');

    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: red,
      duration: 100,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: red,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: yellow,
      afterEndColorWait: 0,
      duration: 400,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: yellow,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: 400,
      lights: odd,
      layer: 2,
    });
    sequencer.setEffect('warm_automatic-base', baseLayer);
    sequencer.addEffect('warm_automatic-e', crossFadeEven);
    sequencer.addEffect('warm_automatic-o', crossFadeOdd);
  }
} 