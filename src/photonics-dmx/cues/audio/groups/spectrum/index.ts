import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { IAudioCue } from '../../../interfaces/IAudioCue';
import { BuiltInAudioCues } from '../../../types/audioCueTypes';
import { BasicLayeredCue } from './BasicLayeredCue';
import { SpectrumCue } from './SpectrumCue';

const cueEntries: Array<[string, IAudioCue]> = [
  [BuiltInAudioCues.BasicLayered, new BasicLayeredCue()],
  [BuiltInAudioCues.SpectrumCue, new SpectrumCue()]
];

export const spectrumGroup: AudioCueGroup = {
  id: 'audio-spectrum',
  name: 'Spectrum Analyzer Cues',
  description: 'Default audio-reactive cues that respond to spectrum data.',
  cues: new Map(cueEntries)
};

