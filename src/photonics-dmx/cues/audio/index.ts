import { IAudioCue } from "../interfaces/IAudioCue";
import { AudioCueRegistry } from "../registries/AudioCueRegistry";
import { AudioCueType } from "../types/audioCueTypes";
import { BasicLayeredCue } from "./BasicLayeredCue";
import { SpectrumCue } from "./SpectrumCue";

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
      [AudioCueType.SpectrumCue, new SpectrumCue()],
    ]),
  };
  
  const registry = AudioCueRegistry.getInstance();
  registry.registerGroup(defaultGroup);
  
  