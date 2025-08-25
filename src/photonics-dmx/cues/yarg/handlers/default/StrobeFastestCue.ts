import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../../interfaces/ICue';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getEffectFlashColor } from '../../../../effects/effectFlashColor';
import { RGBIO } from '../../../../types';

export class StrobeFastestCue implements ICue {
  id = 'default-strobe-fastest';
  cueId = CueType.Strobe_Fastest;
  description = 'Extremely rapid white strobe effect with flashing timed to BPM/64 of the song';
  style = CueStyle.Secondary;

  async execute(parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const white: RGBIO = getColor('white', 'max');
    const strobes = lightManager.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: parameters.beatsPerMinute / 64,
      lights: strobes,
      layer: 255,
    });
    sequencer.addEffectUnblockedName('strobe', flash);
  }
} 