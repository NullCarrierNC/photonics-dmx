import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../effects/effectCrossFadeColors';
import { YargCue } from '../YargCue';

export class CoolManualCue implements ICue {
  name = YargCue.CoolManual;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front'], 'even');
    const odd = lightManager.getLights(['front'], 'odd');
    const all = lightManager.getLights(['front'], 'all');
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: green,
      duration: 100,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: green,
      afterEndColorWait: 0,
      duration: 140,
      lights: odd,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: green,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 140,
      lights: even,
      layer: 2,
    });

    sequencer.setEffect('coolManual-base', baseLayer);
    sequencer.addEffect('coolManual-e', crossFadeEven);
    sequencer.addEffect('coolManual-o', crossFadeOdd);
  }
} 