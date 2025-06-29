import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectCrossFadeColors } from '../../../effects/effectCrossFadeColors';
import { randomBetween } from '../../../helpers/utils';
import { YargCue } from '../YargCue';

export class FrenzyCue implements ICue {
  name = YargCue.Frenzy;
  description = 'Rapid color cycling between high-intensity red, green, blue, and orange on all lights for an energetic, chaotic effect';
  style = CueStyle.Secondary;
  private _lastIndex: number = 0;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const red = getColor('red', 'high');
    const green = getColor('green', 'high');
    const blue = getColor('blue', 'high');
    const orange = getColor('orange', 'high');
    const lights = lightManager.getLights(['front', 'back'], 'all');
    const colors = [red, green, blue, orange];

    // Ensure startColor is not the same as _lastIndex
    let startColorIndex: number;
    do {
      startColorIndex = randomBetween(0, colors.length - 1);
    } while (startColorIndex === this._lastIndex);

    const startColor = colors[startColorIndex];

    // Ensure endColor is different from startColor
    let endColorIndex: number;
    do {
      endColorIndex = randomBetween(0, colors.length - 1);
    } while (endColorIndex === startColorIndex);

    const endColor = colors[endColorIndex];

    const cross = getEffectCrossFadeColors({
      startColor: startColor,
      afterStartWait: 0,
      endColor: endColor,
      duration: 100,
      afterEndColorWait: 0,
      lights: lights,
      layer: 10,
    });
    // using layer 10 to force it on top of other common effects to take precedence
    sequencer.addEffect('frenzy', cross);

    this._lastIndex = endColorIndex;
  }
} 