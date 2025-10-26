import { ICue } from './ICue';
import { CueType } from '../cueTypes';


/**
 * Interface defining a group of cue implementations.
 * A group represents a complete set of cue implementations that can be
 * used together. Groups can be registered with the CueRegistry and
 * can be randomly selected for variety.
 */
export interface ICueGroup {
  id:string;
  /** The name of the group */
  name: string;
  /** Description of the cue group */
  description?: string;
  /** Map of cue types to their implementations in this group */
  cues: Map<CueType, ICue>;
} 