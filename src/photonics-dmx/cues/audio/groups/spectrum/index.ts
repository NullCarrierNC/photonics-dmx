import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { BasicLayeredCue } from './BasicLayeredCue';
import { SpectrumCue } from './SpectrumCue';

const cueEntries: Array<[AudioCueType, IAudioCue]> = [
  [BuiltInAudioCues.BasicLayered, new BasicLayeredCue()],
  [BuiltInAudioCues.SpectrumCue, new SpectrumCue()]
];

export const spectrumGroup: AudioCueGroup = {
  id: 'audio-spectrum',
  name: 'Spectrum Analyzer Cues',
  description: 'Default audio-reactive cues that respond to spectrum data.',
  cues: new Map<AudioCueType, IAudioCue>(cueEntries)
};

