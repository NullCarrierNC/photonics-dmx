import { AudioCueRegistry } from '../registries/AudioCueRegistry'
import { spectrumGroup } from './groups/spectrum'
import { pulseGroup } from './groups/pulse'
import { bandSculptGroup } from './groups/bandsculpt'
import { hybridGroup } from './groups/hybrid'
import { lightOrganGroup } from './groups/lightOrgan'

const registry = AudioCueRegistry.getInstance()
registry.registerGroup(spectrumGroup)
registry.registerGroup(pulseGroup)
registry.registerGroup(bandSculptGroup)
registry.registerGroup(hybridGroup)
registry.registerGroup(lightOrganGroup)
