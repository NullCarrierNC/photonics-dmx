import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';
import { getColor } from '../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../effects/effectFlashColor';
import { RGBIP } from '../../../types';

export class StrobeSlowCue implements ICue {
  name = YargCue.Strobe_Slow;
  description = 'Slow white strobe effect with flashing timed to BPM/8 of the song';
  style = CueStyle.Secondary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white: RGBIP = getColor('white', 'max');
    const strobes = lightManager.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: parameters.beatsPerMinute / 8,
      lights: strobes,
      layer: 255,
    });
    sequencer.addEffectUnblockedName('strobe', flash);
  }
} 