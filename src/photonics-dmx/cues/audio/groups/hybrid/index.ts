import { AudioCueGroup } from '../../../registries/AudioCueRegistry'
import { AudioCueType, BuiltInAudioCues } from '../../../types/audioCueTypes'
import { BeatSpectrumMorphCue } from './BeatSpectrumMorphCue'
import { TriadCascadeCue } from './TriadCascadeCue'
import { AuroraDriftCue } from './AuroraDriftCue'
import { IAudioCue } from '../../../interfaces/IAudioCue'

export const hybridGroup: AudioCueGroup = {
  id: 'audio-hybrid',
  name: 'Hybrid Audio Cues',
  description: 'Blends beat detection with spectrum data.',
  cues: new Map<AudioCueType, IAudioCue>([
    [BuiltInAudioCues.BeatSpectrumMorph, new BeatSpectrumMorphCue()],
    [BuiltInAudioCues.TriadCascade, new TriadCascadeCue()],
    [BuiltInAudioCues.AuroraDrift, new AuroraDriftCue()],
  ]),
}
