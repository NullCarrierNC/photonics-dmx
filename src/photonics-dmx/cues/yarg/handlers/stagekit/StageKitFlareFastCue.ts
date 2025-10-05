import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';
import { getEffectSingleColor } from '../../../../effects';

/**
 * StageKit Flare Fast Cue - Blue lights (with green if previous was cool)
 */
export class StageKitFlareFastCue implements ICue {
  id = 'stagekit-flare-fast';
  cueId = CueType.Flare_Fast;
  description = 'Solid blue on all. Does not yet support green if previous was cool.';
  style = CueStyle.Primary;
  
  private isFirstExecution: boolean = true;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blueColor = getColor('blue', 'medium', 'add');

    const effect = getEffectSingleColor({
      lights: allLights,
      layer: 0,
      waitFor: 'none',
      forTime: 0,
      color: blueColor,
      duration: 100,
      waitUntil: 'none',
      untilTime: 0,
    });
  
    if (this.isFirstExecution) {
      await sequencer.setEffect('stagekit-flare-fast', effect);
      this.isFirstExecution = false;
    } else {
      await  sequencer.addEffect('stagekit-flare-fast', effect);
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