import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';

export class SoloCue implements ICue {
  id = 'default-solo';
  cueId = CueType.Solo;
  description = 'Rapid alternating white and purple colors on all lights with short transitions';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const all = lightManager.getLights(['front'], 'all');
    const purple = getColor('purple', 'medium');
    const effect = getEffectSingleColor({
      lights: all,
      color: purple,
      duration: 10,
    });
    sequencer.setEffect('solo', effect);
  }
} 