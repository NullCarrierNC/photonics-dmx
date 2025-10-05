import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../../effects/effectSingleColor';
import { getEffectCrossFadeColors } from '../../../../effects/effectCrossFadeColors';

export class CoolManualCue implements ICue {
  id = 'default-cool-manual';
  cueId = CueType.Cool_Manual;
  description = 'Alternates between blue and green on even/odd front lights triggered by beat events';
  style = CueStyle.Primary;

  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const even = lightManager.getLights(['front', 'back'], 'even');
    const odd = lightManager.getLights(['front', 'back'], 'odd');
    const all = lightManager.getLights(['front', 'back'], 'all');
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');

    const baseLayer = getEffectSingleColor({
      lights: all,
      color: green,
      duration: 100,
    });

    const crossFadeEven = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: green,
      afterEndColorWait: 0,
      duration: 140,
      lights: odd,
      layer: 1,
    });
    const crossFadeOdd = getEffectCrossFadeColors({
      startColor: green,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 140,
      lights: even,
      layer: 2,
    });

    if (this.isFirstExecution) {
      await sequencer.setEffect('coolManual-base', baseLayer);
      this.isFirstExecution = false;
    } else {
      await sequencer.addEffect('coolManual-base', baseLayer);
    }
    
    await sequencer.addEffect('coolManual-e', crossFadeEven);
    await sequencer.addEffect('coolManual-o', crossFadeOdd);
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