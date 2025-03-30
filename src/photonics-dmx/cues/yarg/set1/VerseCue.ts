import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class VerseCue implements ICue {
  name = YargCue.Verse;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const blueLow = getColor('blue', 'low');
    const blueMed = getColor('blue', 'medium');
    const blueHigh = getColor('blue', 'high');

    const yellowLow = getColor('yellow', 'low');
    const yellowMed = getColor('yellow', 'medium');
    const yellowHigh = getColor('yellow', 'high');

    const set1 = [blueLow, blueMed, blueHigh];
    const set2 = [yellowLow, yellowMed, yellowHigh];

    const lights = lightManager.getLights(['front', 'back'], 'all');
    const num = lights.length;

    const flip = randomBetween(0, 1);

    const bps = parameters.beatsPerMinute / 60;
    const duration = (1000 / bps) + (100 - parameters.beatsPerMinute);

    for (let i = 0; i < num; i++) {
      const color = flip === 1 ? set1[randomBetween(0, set1.length - 1)] : set2[randomBetween(0, set2.length - 1)];

      const effect = getEffectSingleColor({
        color: color,
        duration: duration,
        lights: [lights[i]],
        layer: i
      });
      sequencer.addEffect(`verse-${i}`, effect);
    }
  }
} 