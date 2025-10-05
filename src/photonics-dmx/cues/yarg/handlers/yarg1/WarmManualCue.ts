import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';
import { TimingPresets } from '../../../../helpers/bpmUtils';

export class WarmManualCue implements ICue {
  id = 'default-warm-manual';
  cueId = CueType.Warm_Manual;
  description = 'Alternates between red and yellow on even/odd front lights triggered by measure events';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front'], 'even');
    const odd = lightManager.getLights(['front'], 'odd');
    const all = lightManager.getLights(['front'], 'all');

    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');

    const duration = TimingPresets.beat(parameters.beatsPerMinute);

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: red,
      duration: 100,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: red,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: yellow,
      afterEndColorWait: 0,
      duration: duration,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: yellow,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: duration,
      lights: odd,
      layer: 2,
    });
    if (this.isFirstExecution) {
      await sequencer.setEffect('warm_manual-base', baseLayer);
      this.isFirstExecution = false;
    } else {
      await sequencer.addEffect('warm_manual-base', baseLayer);
    }
    
    await sequencer.addEffect('warm_manual-e', crossFadeEven);
    await sequencer.addEffect('warm_manual-o', crossFadeOdd);
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