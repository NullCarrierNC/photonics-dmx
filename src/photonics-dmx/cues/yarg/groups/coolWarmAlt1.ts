import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';
import { CoolAutomaticCue } from '../coolWarmAlt1/CoolAutomaticCue';
import { CoolManualCue } from '../coolWarmAlt1/CoolManualCue';
import { WarmAutomaticCue } from '../coolWarmAlt1/WarmAutomaticCue';
import { WarmManualCue } from '../coolWarmAlt1/WarmManualCue';


/**
 * Create and register the cool/warm alternative 1 cue group.
 */
const group: ICueGroup = {
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

// TODO: Temporarly activate the group. We need to add config controls later.
registry.activateGroup(group.name);