import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class BigRockEndingCue implements ICue {
  name = YargCue.BigRockEnding;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const red = getColor('red', 'max');
    const green = getColor('green', 'max');
    const blue = getColor('blue', 'max');
    const orange = getColor('orange', 'max');
    const lights = lightManager.getLights(['front', 'back'], 'all');
    const numLights = lights.length;

    try {
      const colors = [red, green, blue, orange];
      for (let i = 0; i < numLights; i++) {
        const color = colors[randomBetween(0, colors.length - 1)];
        const flash = getEffectFlashColor({
          color,
          startTrigger: 'delay',
          startWait: randomBetween(0, 100),
          durationIn: 10,
          holdTime: randomBetween(20, 80),
          durationOut: 60,
          lights: [lights[i]],
          layer: i + 10,
        });
        
        sequencer.addEffect(`big-rock-ending${i}`, flash);
      }
    } catch (ex) {
      console.error(ex);
      throw ex;
    }
  }
} 