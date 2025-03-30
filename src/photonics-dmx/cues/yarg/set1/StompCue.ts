import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { EasingType } from '../../../easing';

export class StompCue implements ICue {
  name = 'stomp';

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'max');
    const lights = lightManager.getLights(['front'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      durationIn: 10,
      holdTime: 0,
      durationOut: 110,
      lights: lights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });
    sequencer.addEffect('stomp', flash);
  }
} 