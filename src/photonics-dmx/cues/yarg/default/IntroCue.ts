import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';

export class IntroCue implements ICue {
  name = YargCue.Intro;
  description = 'Solid medium-blue color on front lights for song introductions';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const all = lightManager.getLights(['front'], 'all');
    const blue = getColor('blue', 'medium');
    const effect = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 10,
    });
    sequencer.setEffect('intro', effect);
  }
} 