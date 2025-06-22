import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../effects/effectCrossFadeColors';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { randomBetween } from '../../../helpers/utils';
import { EasingType } from '../../../easing';
import { YargCue } from '../YargCue';

export class DischordCue implements ICue {
  name = YargCue.Dischord;
  description = 'Front lights alternate between green and blue on left/right halves with bright red or yellow flashes on the measure';

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');

    const all = lightManager.getLights(['front'], 'all');
    const even = lightManager.getLights(['front'], 'half-1');
    const odd = lightManager.getLights(['front'], 'half-2');

    const bps = parameters.beatsPerMinute / 60;
    const duration = (1000 / bps);

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 10,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: blue,
      afterStartWait: 70,
      endColor: green,
      afterEndColorWait: 75,
      duration: duration,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: green,
      afterStartWait: 70,
      endColor: blue,
      afterEndColorWait: 75,
      duration: duration,
      lights: odd,
      layer: 2,
    });
    const allLights = lightManager.getLights(['front'], 'all');
    const yellow = getColor('yellow', 'high');
    const red = getColor('red', 'high');
    const rnd = randomBetween(1, 2);
    const flashYellowOnBeat = getEffectFlashColor({
      color: rnd === 1 ? red : yellow,
      startTrigger: 'measure',
      durationIn: 0,
      holdTime: 120,
      durationOut: 150,
      lights: allLights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });

    sequencer.setEffect('dischord-all', baseLayer);
    sequencer.addEffect('dischord1', crossFadeEven);
    sequencer.addEffect('dischord2', crossFadeOdd);
    sequencer.addEffect('dischord-flash', flashYellowOnBeat);
  }
} 