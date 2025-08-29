import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers';
import { getEffectFadeInColorFadeOut } from '../../../../effects';


/**
 * StageKit Stomp Cue - Keyframe-based toggle with all lights
 * Starts with all lights on, toggles on/off with each keyframe
 */
export class StageKitStompCue implements ICue {
  id = 'stagekit-stomp';
  cueId = CueType.Stomp;
  description = 'StageKit stomp pattern - keyframe-based toggle';
  style = CueStyle.Primary;

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], ['all']);
    const blackColor = getColor('black', 'medium');
    const yellowColor = getColor('yellow', 'high');

    const effect = getEffectFadeInColorFadeOut({
      lights: allLights,
      layer: 0,
      startColor: yellowColor,
      endColor: blackColor,
      waitBeforeFadeIn: 0,
      fadeInDuration: 50,
      holdDuration: 100,
      fadeOutDuration: 50,
      waitAfterFadeOut: 0,
      waitUntil: 'keyframe',
    });
    sequencer.setEffect('stagekit-stomp', effect, 0, true);
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