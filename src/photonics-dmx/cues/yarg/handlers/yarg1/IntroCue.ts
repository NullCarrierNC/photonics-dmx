import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';

export class IntroCue implements ICue {
  id = 'default-intro';
  cueId = CueType.Intro;
  description = 'Solid low green color on front lights.';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const all = lightManager.getLights(['front', 'back'], 'all');
    const color = getColor('green', 'low');
    const effect = getEffectSingleColor({
      lights: all,
      color: color,
      duration: 10,
    });
    sequencer.setEffect('intro', effect);
  }
} 