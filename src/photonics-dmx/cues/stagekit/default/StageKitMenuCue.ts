import { ICue, CueStyle } from '../../interfaces/ICue';
import { CueData, CueType } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectCycleLights } from '../../../effects/effectCycleLights';

/**
 * StageKit Menu Cue - Blue lights rotating in sequence
 * 2-second cycle, blue lights rotating around ring layout
 */
export class StageKitMenuCue implements ICue {
  id = 'stagekit-menu';
  cueId = CueType.Menu;
  description = 'StageKit menu pattern - blue lights rotating in sequence';
  style = CueStyle.Primary;

  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    // Get lights in ring order: front [1,2,3,4] + back reversed [8,7,6,5]
    const frontLights = lightManager.getLights(['front'], ['all']);
    const backLights = lightManager.getLights(['back'], ['all']).reverse();
    const ringLights = [...frontLights, ...backLights];
    
    const blueColor = getColor('blue', 'medium');
    const blackColor = getColor('black', 'medium');
    
    const menuEffect = getEffectCycleLights({
      lights: ringLights,
      baseColor: blackColor,
      activeColor: blueColor,
      transitionDuration: 250, // 2 seconds / 8 lights = 250ms per light
      waitFor: 'delay',
      layer: 0
    });
    
    await controller.setEffect('stagekit-menu', menuEffect, 0, true); // Persistent effect
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