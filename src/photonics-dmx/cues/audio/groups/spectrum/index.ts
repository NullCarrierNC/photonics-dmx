import { IAudioCue } from '../../../interfaces/IAudioCue';
import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType } from '../../../types/audioCueTypes';
import { BasicLayeredCue } from './BasicLayeredCue';
import { SpectrumCue } from './SpectrumCue';

export const spectrumGroup: AudioCueGroup = {
  id: 'audio-spectrum',
  name: 'Spectrum Analyzer Cues',
  description: 'Default audio-reactive cues that respond to spectrum data.',
  cues: new Map<AudioCueType, IAudioCue>([
    [AudioCueType.BasicLayered, new BasicLayeredCue()],
    [AudioCueType.SpectrumCue, new SpectrumCue()],
  ]),
};

