import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../../effects/effectFlashColor';
import { randomBetween } from '../../../../helpers/utils';

export class FlareFastCue implements ICue {
  id = 'default-flare-fast';
  cueId = CueType.Flare_Fast;
  description = 'Quick, intense bursts of bright blue light on individual front lights with randomized timing.';
  style = CueStyle.Secondary;

 
  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white = getColor('blue', 'high');
    const lights = lightManager.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(20, 160),
        durationIn: 10,
        holdTime: randomBetween(50, 100),
        durationOut: 50,
        lights: [lights[i]],
        layer: i + 101,
      });
      sequencer.addEffect(`flare-fast${i}`, flash);
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