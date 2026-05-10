import { DmxLightManager } from '../controllers/DmxLightManager'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { getEffectSingleColor } from '../effects/effectSingleColor'
import { getColor } from '../helpers/dmxHelpers'
import { randomBetween } from '../helpers/utils'
import { Effect, RGBIO } from '../types'
import { createLogger } from '../../shared/logger'
const log = createLogger('Rb3MenuCueHandler')

const BASE_EFFECT_NAME = 'rb3-menu-base'
const PER_LIGHT_EFFECT_PREFIX = 'rb3-menu-light-'

const LAYER_BASE = 0
const LAYER_PER_LIGHT = 1

/**
 * Code-based menu lighting for RB3E only. Drives a simple red/yellow ambient pattern in menus
 * while StageKit data controls gameplay lighting.
 */
export class Rb3MenuCueHandler {
  private perLightCount = 0

  constructor(
    private readonly lightManager: DmxLightManager,
    private readonly sequencer: ILightingController,
  ) {}

  public playMenuFrame(): void {
    const palette: RGBIO[] = [
      getColor('yellow', 'high'),
      getColor('yellow', 'medium'),
      getColor('yellow', 'low'),
      getColor('red', 'high'),
      getColor('red', 'medium'),
      getColor('red', 'low'),
    ]
    const lights = this.lightManager.getLights(['front', 'back'], 'all')
    if (lights.length === 0) {
      this.clear()
      return
    }

    for (let i = lights.length; i < this.perLightCount; i++) {
      this.sequencer.removeEffect(`${PER_LIGHT_EFFECT_PREFIX}${i}`, LAYER_PER_LIGHT + i)
    }
    this.perLightCount = lights.length

    const base: Effect = getEffectSingleColor({
      lights,
      color: getColor('red', 'low'),
      duration: 10,
    })
    this.sequencer.setEffect(BASE_EFFECT_NAME, base, true).catch((error) => {
      log.error('Rb3MenuCueHandler: setEffect base failed:', error)
    })

    for (let i = 0; i < lights.length; i++) {
      const color = palette[randomBetween(0, palette.length - 1)]
      const name = `${PER_LIGHT_EFFECT_PREFIX}${i}`
      const effect = getEffectSingleColor({
        color,
        duration: 800,
        waitUntil: 'delay',
        untilTime: randomBetween(1000, 3000),
        lights: [lights[i]],
        layer: LAYER_PER_LIGHT + i,
      })
      this.sequencer.addEffect(name, effect)
    }
  }

  public clear(): void {
    this.sequencer.removeEffect(BASE_EFFECT_NAME, LAYER_BASE)
    for (let i = 0; i < this.perLightCount; i++) {
      this.sequencer.removeEffect(`${PER_LIGHT_EFFECT_PREFIX}${i}`, LAYER_PER_LIGHT + i)
    }
    this.perLightCount = 0
  }

  public shutdown(): void {
    this.clear()
  }
}
