import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';
import { randomBetween } from '../../../../helpers/utils';

export class FrenzyCue implements ICue {
  id = 'default-frenzy';
  cueId = CueType.Frenzy;
  description = 'Color cycling on beat with random colour selection between red, green, blue, and orange on all lights.';
  style = CueStyle.Secondary;
  private _lastStartColorIndex: number = -1;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const red = getColor('red', 'high');
    const green = getColor('green', 'high');
    const blue = getColor('blue', 'high');
    const orange = getColor('orange', 'high');
    const lights = lightManager.getLights(['front', 'back'], 'all');
    const colors = [red, green, blue, orange];

    // Ensure startColor is not the same as the last startColor used
    let startColorIndex: number;
    do {
      startColorIndex = randomBetween(0, colors.length - 1);
    } while (startColorIndex === this._lastStartColorIndex);

    const startColor = colors[startColorIndex];

    // Ensure endColor is different from startColor
    let endColorIndex: number;
    do {
      endColorIndex = randomBetween(0, colors.length - 1);
    } while (endColorIndex === startColorIndex);

    const endColor = colors[endColorIndex];

    const cross = getEffectCrossFadeColors({
      startColor: startColor,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: endColor,
      duration: 200,
      afterEndColorWait: 0,
      lights: lights,
      layer: 10,
    });
    // using layer 10 to force it on top of other common effects to take precedence
    await sequencer.addEffect('frenzy', cross);

    // Track the startColor index for next execution to ensure color always changes
    this._lastStartColorIndex = startColorIndex;
  }

  onStop(): void {
    // Reset the start color index so next time this cue runs it can use any color
    this._lastStartColorIndex = -1;
  }
} 