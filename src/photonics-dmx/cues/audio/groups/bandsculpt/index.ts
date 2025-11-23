import { AudioCueGroup } from '../../../registries/AudioCueRegistry';
import { AudioCueType } from '../../../types/audioCueTypes';
import { IAudioCue } from '../../../interfaces/IAudioCue';
import { BandShellCue } from './BandShellCue';
import { PrismSweepCue } from './PrismSweepCue';
import { SubHarmonicWaveCue } from './SubHarmonicWaveCue';
import { SpectrumStepperCue } from './SpectrumStepperCue';


export const bandSculptGroup: AudioCueGroup = {
  id: 'audio-band-sculpt',
  name: 'Band Division Cues',
  description: 'Divides the rig into layers and gradients based on per-band energy.',
  cues: new Map<AudioCueType, IAudioCue>([
    [AudioCueType.BandShell, new BandShellCue()],
    [AudioCueType.PrismSweep, new PrismSweepCue()],
    [AudioCueType.SubHarmonicWave, new SubHarmonicWaveCue()],
    [AudioCueType.SpectrumStepper, new SpectrumStepperCue()]
  ])
};


