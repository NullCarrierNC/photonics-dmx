import { CueRegistry } from '../CueRegistry';
import { CueType } from '../cueTypes';
import { ICueGroup } from '../interfaces/ICueGroup';
import { CoolAutomaticCue } from './handlers/coolWarmAlt1/CoolAutomaticCue';
import { CoolManualCue } from './handlers/coolWarmAlt1/CoolManualCue';
import { WarmAutomaticCue } from './handlers/coolWarmAlt1/WarmAutomaticCue';
import { WarmManualCue } from './handlers/coolWarmAlt1/WarmManualCue';


/**
 * Create and register the cool/warm alternative 1 cue group.
 */
const group: ICueGroup = {
  id: 'coolWarmAlt1',
  name: 'Cool/Warm Alternative 1',
  description: 'Alt versions of the cool and warm cues, less frenetic than the defaults.',
  cues: new Map([
    [CueType.Cool_Automatic, new CoolAutomaticCue()],
    [CueType.Cool_Manual, new CoolManualCue()],
    [CueType.Warm_Automatic, new WarmAutomaticCue()],
    [CueType.Warm_Manual, new WarmManualCue()],
  ]),
};

// Get the registry instance and register the default group
const registry = CueRegistry.getInstance();
registry.registerGroup(group);

registry.activateGroup(group.id);