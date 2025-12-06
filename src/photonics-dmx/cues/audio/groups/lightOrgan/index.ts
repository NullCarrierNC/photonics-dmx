import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType, BuiltInAudioCues } from '../../../types/audioCueTypes';
import { LinearLightOrganCue } from './LinearLightOrganCue';
import { SplitLightOrganCue } from './SplitLightOrganCue';
import { StackedLightOrganCue } from './StackedLightOrganCue';
import { DiagonalLightOrganCue } from './DiagonalLightOrganCue';
import { GatedLightOrganCue } from './GatedLightOrganCue';
import { IAudioCue } from '../../../interfaces/IAudioCue';

export const lightOrganGroup: AudioCueGroup = {
  id: 'audio-light-organ',
  name: '70s Light Organ Variants',
  description: "Cues inspired by the classic light organs of the 1970's.",
  cues: new Map<AudioCueType, IAudioCue>([
    [BuiltInAudioCues.LinearLightOrgan, new LinearLightOrganCue()],
    [BuiltInAudioCues.SplitLightOrgan, new SplitLightOrganCue()],
    [BuiltInAudioCues.StackedLightOrgan, new StackedLightOrganCue()],
    [BuiltInAudioCues.DiagonalLightOrgan, new DiagonalLightOrganCue()],
    [BuiltInAudioCues.GatedLightOrgan, new GatedLightOrganCue()]
  ])
};


