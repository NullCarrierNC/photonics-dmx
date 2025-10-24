import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';
import { randomBetween } from '../../../../helpers/utils';
import { TimingPresets } from '../../../../helpers/bpmUtils';
import { EasingType } from '../../../../easing';

export class HarmonyCue implements ICue {
  id = 'default-harmony';
  cueId = CueType.Harmony;
  description = 'Interactive color cross-fade effect where colors are determined by drum hits (starting color) and guitar notes (ending color)';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const red = getColor('red', 'high');
    const green = getColor('green', 'high');
    const blue = getColor('blue', 'high');
    const yellow = getColor('yellow', 'high');
    const orange = getColor('orange', 'high');
    const white = getColor('purple', 'high');

    const colors = [red, green, blue, yellow, orange, white];

    const lights = lightManager.getLights(['front'], 'all');

    let startColor = red;
    let endColor = blue;

    if (parameters.drumNotes.length > 0) {
      switch (parameters.drumNotes[0]) {
        case "None":
          startColor = colors[randomBetween(0, colors.length - 1)];
          break;
        case "Kick":
          startColor = white;
          break;
        case "RedDrum":
          startColor = red;
          break;
        case "YellowDrum":
          startColor = yellow;
          break;
        case "BlueDrum":
          startColor = blue;
          break;
        case "GreenDrum":
          startColor = green;
          break;
        case "YellowCymbal":
          startColor = yellow;
          break;
        case "BlueCymbal":
          startColor = blue;
          break;
        case "GreenCymbal":
          startColor = green;
          break;
      }
    } else {
      startColor = colors[randomBetween(0, colors.length - 1)];
    }

    if (parameters.guitarNotes.length > 0) {
      switch (parameters.guitarNotes[0]) {
        case "None":
          endColor = colors[randomBetween(0, colors.length - 1)];
          break;
        case "Open":
          break;
        case "Green":
          endColor = green;
          break;
        case "Red":
          endColor = red;
          break;
        case "Yellow":
          endColor = yellow;
          break;
        case "Blue":
          endColor = blue;
          break;
        case "Orange":
          endColor = orange;
          break;
      }
    } else {
      endColor = colors[randomBetween(0, colors.length - 1)];
    }

    const duration = TimingPresets.quarterBeat(parameters.beatsPerMinute);

    const cross = getEffectCrossFadeColors({
      startColor: startColor,
      afterStartWait: 0,
      crossFadeTrigger: 'measure',
      endColor: endColor,
      duration: duration,
      afterEndColorWait: 0,
      lights: lights,
      layer: 0,
      easing: EasingType.SIN_OUT,
    });

    if (this.isFirstExecution) {
      sequencer.setEffect('harmony', cross);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffect('harmony', cross);
    }
  }

  onStop(): void {
    this.isFirstExecution = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 