import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';
import { CoolAutomaticCue } from '../coolWarmAlt2/CoolAutomaticCue';
import { WarmAutomaticCue } from '../default/WarmAutomaticCue';

/**
 * Create and register the cool/warm alternative 1 cue group.
 */
const group: ICueGroup = {
  name: 'Cool/Warm Alternative 2',
  description: 'Alt versions of the cool and warm cues, less frenetic than the defaults.',
  cues: new Map([
    [CueType.Cool_Automatic, new CoolAutomaticCue()],
  //  [CueType.Cool_Manual, new CoolManualCue()],
    [CueType.Warm_Automatic, new WarmAutomaticCue()],
   // [CueType.Warm_Manual, new WarmManualCue()],
  ]),
};

// Get the registry instance and register the default group
const registry = CueRegistry.getInstance();
registry.registerGroup(group);

registry.activateGroup(group.name);