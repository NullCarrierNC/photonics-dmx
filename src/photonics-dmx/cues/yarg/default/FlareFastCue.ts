import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class FlareFastCue implements ICue {
  name = YargCue.FlareFast;
  description = 'Quick, intense bursts of bright white light on individual front lights with randomized timing, resembling camera flashes';

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'max');
    const lights = lightManager.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(5, 160),
        durationIn: 10,
        holdTime: randomBetween(10, 40),
        durationOut: 50,
        lights: [lights[i]],
        layer: i + 101,
      });
      sequencer.addEffect(`flare-fast${i}`, flash);
    }
  }
} 