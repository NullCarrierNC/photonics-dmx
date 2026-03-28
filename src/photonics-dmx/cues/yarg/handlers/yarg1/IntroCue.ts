import { CueData, CueType } from '../../../types/cueTypes'
import { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { INetCue, CueStyle } from '../../../interfaces/INetCue'
import { getColor } from '../../../../helpers/dmxHelpers'
import { getEffectSingleColor } from '../../../../effects/effectSingleColor'

export class IntroCue implements INetCue {
  id = 'default-intro'
  cueId = CueType.Intro
  description = 'Solid low green color on front lights.'
  style = CueStyle.Primary

  private isFirstExecution: boolean = true

  async execute(
    _parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): Promise<void> {
    const all = lightManager.getLights(['front', 'back'], 'all')
    const color = getColor('green', 'low')
    const effect = getEffectSingleColor({
      lights: all,
      color: color,
      duration: 10,
    })

    if (this.isFirstExecution) {
      sequencer.setEffect('intro', effect)
      this.isFirstExecution = false
    } else {
      sequencer.addEffect('intro', effect)
    }
  }

  onStop(): void {
    this.isFirstExecution = true
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
}
