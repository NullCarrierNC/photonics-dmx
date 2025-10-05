import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectFlashColor } from '../../../../effects/effectFlashColor';
import { EasingType } from '../../../../easing';

export class ScoreCue implements ICue {
  id = 'default-score';
  cueId = CueType.Score;
  description = 'Solid medium-blue colour on front with yellow flash';
  style = CueStyle.Primary;
  private isFirstExecution = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const all = lightManager.getLights(['front'], 'all');
    const blue = getColor('blue', 'medium');
    const yellow = getColor('yellow', 'medium');

    // Set base blue color
    const baseEffect = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 10,
      layer: 0,
    });

    // Add periodic yellow flash
    const flashEffect = getEffectFlashColor({
      color: yellow,
      startTrigger: 'delay',
      startWait: 4000,
      durationIn: 300,
      holdTime: 100,
      durationOut: 600,
      endTrigger: 'delay',
      endWait: 0,
      lights: all,
      layer: 1,
      easing: EasingType.SIN_IN_OUT,
    });

    if (this.isFirstExecution) {
      // First time: use setEffect to clear any existing effects and start fresh
      await sequencer.setEffect('score_base', baseEffect);
      await sequencer.addEffect('score_flash', flashEffect);
      this.isFirstExecution = false;
    } else {
      // Repeat call: use addEffect to add to existing effects
      await sequencer.addEffect('score_base', baseEffect);
      await sequencer.addEffect('score_flash', flashEffect);
    }
  }

  onStop(): void {
    // Reset the first execution flag so next time this cue runs it will use setEffect
    this.isFirstExecution = true;
  }
} 