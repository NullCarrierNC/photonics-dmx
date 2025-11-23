import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType } from '../../../types/audioCueTypes';
import { BeatSpectrumMorphCue } from './BeatSpectrumMorphCue';
import { TriadCascadeCue } from './TriadCascadeCue';
import { AuroraDriftCue } from './AuroraDriftCue';
import { IAudioCue } from '../../../interfaces/IAudioCue';

export const hybridGroup: AudioCueGroup = {
  id: 'audio-hybrid',
  name: 'Hybrid Audio Cues',
  description: 'Blends beat detection with spectrum data.',
  cues: new Map<AudioCueType, IAudioCue>([
    [AudioCueType.BeatSpectrumMorph, new BeatSpectrumMorphCue()],
    [AudioCueType.TriadCascade, new TriadCascadeCue()],
    [AudioCueType.AuroraDrift, new AuroraDriftCue()],
  ])
};


