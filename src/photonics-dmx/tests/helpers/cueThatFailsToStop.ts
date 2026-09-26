import { CueHandler } from '../../cueHandlers/CueHandler'
import type { RigChain } from '../../controllers/RigChain'
import { CueStyle, type INetCue } from '../../cues/interfaces/INetCue'
import { CueRegistry } from '../../cues/registries/CueRegistry'
import { CueType, defaultCueData } from '../../cues/types/cueTypes'

/** Gives `chain` a YARG cue handler playing a primary cue whose stop throws `failure`. */
export async function playCueThatFailsToStop(chain: RigChain, failure: Error): Promise<void> {
  const cue: INetCue = {
    cueId: 'verse',
    id: 'verse',
    style: CueStyle.Primary,
    execute: () => {},
    onStop: () => {
      throw failure
    },
  }
  const registry = CueRegistry.create()
  registry.registerGroup({ id: 'failing', name: 'failing', cues: new Map([[CueType.Verse, cue]]) })
  registry.setEnabledGroups(['failing'])
  registry.setActiveGroups(['failing'])
  const handler = new CueHandler(chain.dmxLightManager, chain.sequencer, { registry })
  chain.cueHandlers.yarg = handler
  await handler.handleCue(CueType.Verse, {
    ...defaultCueData,
    currentScene: 'Gameplay',
    trackMode: 'tracked',
    lightingCue: CueType.Verse,
  })
}
