import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../effects/effectCrossFadeColors';

export class WarmManualCue implements ICue {
  id = 'default-warm-manual';
  cueId = CueType.Warm_Manual;
  description = 'Alternates between red and yellow on even/odd front lights triggered by measure events';
  style = CueStyle.Primary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front'], 'even');
    const odd = lightManager.getLights(['front'], 'odd');
    const all = lightManager.getLights(['front'], 'all');

    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');

    const bps = parameters.beatsPerMinute / 60;
    const duration = (1000 / bps);

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
      duration: duration,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: yellow,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: duration,
      lights: odd,
      layer: 2,
    });
    sequencer.setEffect('warm_manual-base', baseLayer);
    sequencer.addEffect('warm_manual-e', crossFadeEven);
    sequencer.addEffect('warm_manual-o', crossFadeOdd);
  }
} 