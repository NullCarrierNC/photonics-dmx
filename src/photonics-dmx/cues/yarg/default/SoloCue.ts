import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';

export class SoloCue implements ICue {
  name = YargCue.Solo;
  description = 'Solid medium-purple color on front lights';

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