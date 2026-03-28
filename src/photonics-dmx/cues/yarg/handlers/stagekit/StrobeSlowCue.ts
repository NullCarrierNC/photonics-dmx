import { CueData, CueType } from '../../../types/cueTypes'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { INetCue, CueStyle } from '../../../interfaces/INetCue'
import { getColor } from '../../../../helpers/dmxHelpers'
import { getEffectFlashColor } from '../../../../effects/effectFlashColor'
import { RGBIO } from '../../../../types'

export class StrobeSlowCue implements INetCue {
  id = 'default-strobe-slow'
  cueId = CueType.Strobe_Slow
  description = 'Slow white strobe effect with flashing timed to BPM/8 of the song'
  style = CueStyle.Secondary

  async execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    const white: RGBIO = getColor('white', 'max')
    const strobes = lightManager.getLights(['strobe'], 'all')
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 70,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: parameters.beatsPerMinute / 8,
      lights: strobes,
      layer: 255,
    })
    sequencer.addEffectUnblockedName('strobe', flash)
  }
}
