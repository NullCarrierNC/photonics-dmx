import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';

export class DefaultCue implements ICue {
  id = 'default-default';
  cueId = CueType.Default;
  description = 'Solid medium-yellow color on front lights for a warm, neutral stage ambience';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const all = lightManager.getLights(['front'], 'all');
    const yellow = getColor('yellow', 'medium');
    const effect = getEffectSingleColor({
      lights: all,
      color: yellow,
      duration: 10,
    });
    sequencer.setEffect('default', effect);
  }
} 