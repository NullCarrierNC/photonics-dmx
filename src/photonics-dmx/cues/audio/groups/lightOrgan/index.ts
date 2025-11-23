import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType } from '../../../types/audioCueTypes';
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
    [AudioCueType.LinearLightOrgan, new LinearLightOrganCue()],
    [AudioCueType.SplitLightOrgan, new SplitLightOrganCue()],
    [AudioCueType.StackedLightOrgan, new StackedLightOrganCue()],
    [AudioCueType.DiagonalLightOrgan, new DiagonalLightOrganCue()],
    [AudioCueType.GatedLightOrgan, new GatedLightOrganCue()]
  ])
};


