import { AudioCueRegistry } from '../AudioCueRegistry';
import { AudioCueType } from '../AudioCueTypes';
import { IAudioCue } from '../interfaces/IAudioCue';
import { BasicLayeredCue } from './BasicLayeredCue';

/**
 * Register default audio cue group
 * This file is imported automatically when the audio cue system is initialized
 */
const defaultGroup = {
  id: 'default',
  name: 'Default Audio Cues',
  description: 'Default set of audio-reactive lighting cues',
  cues: new Map<AudioCueType, IAudioCue>([
    [AudioCueType.BasicLayered, new BasicLayeredCue()],
  ]),
};

const registry = AudioCueRegistry.getInstance();
registry.registerGroup(defaultGroup);

