import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectSingleColor } from '../../../effects/effectSingleColor';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';

export class ScoreCue implements ICue {
  name = YargCue.Score;
  description = 'Medium blue base color on front lights with periodic yellow flashes every 4 seconds for a celebratory score screen effect';

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
    sequencer.setEffect('score_base', baseEffect);

    // Add periodic yellow flash
    const flashEffect = getEffectFlashColor({
      color: yellow,
      startTrigger: 'delay',
      startWait: 4000,
      durationIn: 300,
      holdTime: 0,
      durationOut: 600,
      endTrigger: 'delay',
      endWait: 0,
      lights: all,
      layer: 1,
    });
    sequencer.addEffect('score_flash', flashEffect);
  }
} 