import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';
import { SearchlightsAlt1Cue } from '../commonAlt1/SearchlightsAlt1Cue';

const group: ICueGroup = {
  id: 'commonAlt1',
  name: 'Common Cues Alt 1',
  description: 'Alt versions of common cues.',
  cues: new Map([
    [CueType.Searchlights, new SearchlightsAlt1Cue()],
    [CueType.Dischord, new SearchlightsAlt1Cue()],
  ]),
};


const registry = CueRegistry.getInstance();
registry.registerGroup(group);
registry.activateGroup(group.id);