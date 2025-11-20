import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { Effect, EffectTransition,  } from '../../../../types';

/**
 * StageKit Menu Cue - Blue lights rotating in sequence
 * 2-second cycle, blue lights rotating around ring layout
 */
export class StageKitMenuCue implements ICue {
  id = 'stagekit-menu';
  cueId = CueType.Menu;
  description = 'StageKit menu pattern - solid blue lights, no motion in this implementation.';
  style = CueStyle.Primary;
  
  async execute(_cueData: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blue = getColor('blue', 'low');
    
    const transitions: EffectTransition[] = [
      {
        lights: allLights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        waitUntilCondition: 'delay',
        waitUntilTime: 100,
        transform: {
          color: blue,
          easing: 'linear',
          duration: 0 
        }
      }
    ];
    
    const introEffect: Effect = {
      id: 'stagekit-intro',
      description: 'All green lights on',
      transitions: transitions
    };
    
    sequencer.setEffectUnblockedName('sk-menu', introEffect, true);

   /*
   
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
    // Use unblocked to avoid breaking the sweep timing and keep the sweep atomic.
    if (this.isFirstExecution) {
      sequencer.setEffectUnblockedName('menu', sweep, true);
      this.isFirstExecution = false;
    } else {
      sequencer.addEffectUnblockedName('menu', sweep, true);
    }
    */
  }

  onStop(): void {
   // this.isFirstExecution = true;
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 