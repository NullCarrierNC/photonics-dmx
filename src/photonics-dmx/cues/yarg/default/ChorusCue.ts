import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';


export class ChorusCue implements ICue {
  name = YargCue.Chorus;
  description = 'Alternating randomly between Amber/Purple or Yellow/Red colors on all lights with timing based on song BPM';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const amberLow = getColor('amber', 'low');
    const amberMedium = getColor('amber', 'medium');
    const amberHigh = getColor('amber', 'high');

    const purpleLow = getColor('purple', 'low');
    const purpleMedium = getColor('purple', 'medium');
    const purpleHigh = getColor('purple', 'high');

    const set1 = [amberLow, amberMedium, amberHigh, purpleLow, purpleMedium, purpleHigh];

    const yellowLow = getColor('yellow', 'low');
    const yellowMed = getColor('yellow', 'medium');
    const yellowHigh = getColor('yellow', 'high');

    const redLow = getColor('red', 'low');
    const redMed = getColor('red', 'medium');
    const redHigh = getColor('red', 'high');

    const set2 = [yellowLow, yellowMed, yellowHigh, redLow, redMed, redHigh];

    const lights = lightManager.getLights(['front', 'back'], 'all');
    const num = lights.length;

    const flip = randomBetween(0, 1);

    const bps = parameters.beatsPerMinute / 60;
    const duration = (1000 / bps) + (200 - parameters.beatsPerMinute);

    for (let i = 0; i < num; i++) {
      const color = flip === 1 ? set1[randomBetween(0, set1.length - 1)] : set2[randomBetween(0, set2.length - 1)];

      const effect = getEffectSingleColor({
        color: color,
        duration: duration,
        lights: [lights[i]],
        layer: i
      });
      sequencer.addEffect(`chorus-${i}`, effect);
    }
  }
} 