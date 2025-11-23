import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType } from '../../../types/audioCueTypes';
import { PulseChaserCue } from './PulseChaserCue';
import { BeatSplitPulseCue } from './BeatSplitPulseCue';
import { BassSnareRippleCue } from './BassSnareRippleCue';
import { MirrorBandBounceCue } from './MirrorBandBounceCue';
import { IAudioCue } from '../../../interfaces/IAudioCue';

export const pulseGroup: AudioCueGroup = {
  id: 'audio-pulse',
  name: 'Pulse Reactive Cues',
  description: 'Beat-driven cues that emphasise rhythm.',
  cues: new Map<AudioCueType, IAudioCue>([
    [AudioCueType.PulseChaser, new PulseChaserCue()],
    [AudioCueType.BeatSplitPulse, new BeatSplitPulseCue()],
    [AudioCueType.BassSnareRipple, new BassSnareRippleCue()],
    [AudioCueType.MirrorBandBounce, new MirrorBandBounceCue()]
  ])
};


