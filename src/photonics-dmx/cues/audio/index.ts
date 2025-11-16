import { AudioCueRegistry } from '../registries/AudioCueRegistry';
import { spectrumGroup } from './groups/spectrum';

const registry = AudioCueRegistry.getInstance();
registry.registerGroup(spectrumGroup);