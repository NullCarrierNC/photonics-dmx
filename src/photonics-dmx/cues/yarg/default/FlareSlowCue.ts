import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class FlareSlowCue implements ICue {
  name = YargCue.FlareSlow;
  description = 'Slower, spaced-out bursts of bright white light on front lights with longer fade times and randomized timing';

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'max');
    const lights = lightManager.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(20, 200),
        durationIn: 100,
        holdTime: randomBetween(20, 80),
        durationOut: 200,
        lights: [lights[i]],
        layer: i + 101,
      });
      sequencer.addEffect(`flare-slow${i}`, flash);
    }
  }
} 