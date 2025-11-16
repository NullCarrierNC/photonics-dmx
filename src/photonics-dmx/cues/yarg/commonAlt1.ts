import { YargCueRegistry } from '../registries/YargCueRegistry';
import { CueType } from '../types/cueTypes';
import { ICueGroup } from '../interfaces/INetCueGroup';
import { SearchlightsAlt1Cue } from './handlers/commonAlt1/SearchlightsAlt1Cue';

const group: ICueGroup = {
  id: 'commonAlt1',
  name: 'Common Cues Alt 1',
  description: 'Alt versions of common cues.',
  cues: new Map([
    [CueType.Searchlights, new SearchlightsAlt1Cue()],
    [CueType.Dischord, new SearchlightsAlt1Cue()],
  ]),
};


const registry = YargCueRegistry.getInstance();
registry.registerGroup(group);
registry.activateGroup(group.id);