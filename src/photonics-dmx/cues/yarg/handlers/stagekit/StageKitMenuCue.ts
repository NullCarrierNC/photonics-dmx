import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { RGBIO } from '../../../../types';
import { getSweepEffect } from '../../../../effects';

/**
 * StageKit Menu Cue - Blue lights rotating in sequence
 * 2-second cycle, blue lights rotating around ring layout
 */
export class StageKitMenuCue implements ICue {
  id = 'stagekit-menu';
  cueId = CueType.Menu;
  description = 'StageKit menu pattern - blue lights rotating in sequence';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    // Merge the sorted arrays into allLights
    const allLights = [...frontLights, ...backLights];
   
    const blue: RGBIO = getColor('blue', 'low');
    const brightBlue: RGBIO = getColor('blue', 'high');

    const sweep = getSweepEffect({
      lights: allLights,
      high: brightBlue,
      low: blue,
      sweepTime: 2000,
      fadeInDuration: 0,
      fadeOutDuration: 0,
      lightOverlap: 0,
      betweenSweepDelay: 0,
      layer: 0,
    });
    // Use unblocked to avoid breaking the sweep timing.
    sequencer.addEffectUnblockedName('menu', sweep, 0, true);
  }

  onStop(): void {
    // Cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 