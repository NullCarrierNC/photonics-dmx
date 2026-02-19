import { AudioCueGroup } from '../../../registries/AudioCueRegistry'
import { AudioCueType, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { PulseChaserCue } from './PulseChaserCue'
import { BeatSplitPulseCue } from './BeatSplitPulseCue'
import { BassSnareRippleCue } from './BassSnareRippleCue'
import { MirrorBandBounceCue } from './MirrorBandBounceCue'
import { IAudioCue } from '../../../interfaces/IAudioCue'

export const pulseGroup: AudioCueGroup = {
  id: 'audio-pulse',
  name: 'Pulse Reactive Cues',
  description: 'Beat-driven cues that emphasise rhythm.',
  cues: new Map<AudioCueType, IAudioCue>([
    [BuiltInAudioCues.PulseChaser, new PulseChaserCue()],
    [BuiltInAudioCues.BeatSplitPulse, new BeatSplitPulseCue()],
    [BuiltInAudioCues.BassSnareRipple, new BassSnareRippleCue()],
    [BuiltInAudioCues.MirrorBandBounce, new MirrorBandBounceCue()],
  ]),
}
