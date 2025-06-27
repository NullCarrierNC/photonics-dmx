import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class SilhouettesCue implements ICue {
  name = YargCue.Silhouettes;
  description = 'Cool colors (green, blue, magenta, teal) cycling on back lights or front lights if no back lights are available';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const back = lightManager.getLights(['back'], 'all');
    const front = lightManager.getLights(['front'], 'all');
    const green = getColor('green', 'medium');
    const blue = getColor('blue', 'medium');
    const magenta = getColor('magenta', 'medium');
    const teal = getColor('teal', 'medium');

    const colors = [green, blue, magenta, teal];

    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: colors[randomBetween(0, colors.length - 1)],
      duration: 500,
      waitUntil: 'none',
      untilTime: 0,
      lights: back.length > 0 ? back : front,
      layer: 0,
    });
    sequencer.setEffect('silhouettes', singleColor);
  }
} 