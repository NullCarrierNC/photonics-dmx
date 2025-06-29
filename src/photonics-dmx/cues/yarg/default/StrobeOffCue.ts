import { CueData } from '../../cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { ICue, CueStyle } from '../../interfaces/ICue';
import { YargCue } from '../YargCue';

export class StrobeOffCue implements ICue {
  id = 'default-strobe-off';
  cueId = YargCue.Strobe_Off;
  description = 'Here for completeness, but YARG disables strobes by simply not turning them on.';
  style = CueStyle.Secondary;

  async execute(_parameters: CueData, _sequencer: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // Do nothing - YARG disables strobes by simply not turning them on.
    // This currently exists to give us something to map to if necessary.
  }
} 