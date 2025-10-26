import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../../effects/effectFlashColor';
import { randomBetween } from '../../../../helpers/utils';

export class FlareSlowCue implements ICue {
  id = 'default-flare-slow';
  cueId = CueType.Flare_Slow;
  description = 'Slow, sustained bursts of bright white light on individual front lights with extended timing.';
  style = CueStyle.Secondary;


  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('white', 'high', 'add');
    const lights = lightManager.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(20, 200),
        durationIn: 100,
        holdTime: randomBetween(20, 80),
        durationOut: 200,
        lights: [lights[i]],
        layer: i + 101,
      });
      sequencer.addEffect(`flare-slow${i}`, flash);
    }
  }

  onStop(): void {
  
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 