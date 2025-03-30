import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';

export class SilhouettesSpotlightCue implements ICue {
  name = 'silhouettes_spotlight';

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const low = getColor('blue', 'low');

    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: low,
      duration: 100,
      waitUntil: 'none',
      untilTime: 0,
      lights: lightManager.getLights(['front', 'back'], 'all'),
      layer: 0,
    });

    sequencer.setEffect('silhouettes_spot', singleColor);
  }
} 