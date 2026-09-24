import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import { createMockTrackedLight } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'

describe('Rb3MenuCueHandler', () => {
  let addEffect: jest.Mock
  let setEffect: jest.Mock
  let removeEffect: jest.Mock
  let getLights: jest.Mock
  let sequencer: ILightingController
  let lightManager: DmxLightManager

  const buildHandler = (lights: ReturnType<typeof createMockTrackedLight>[]) => {
    getLights = jest.fn().mockReturnValue(lights)
    lightManager = { getLights } as unknown as DmxLightManager
    addEffect = jest.fn()
    setEffect = jest.fn().mockResolvedValue(undefined)
    removeEffect = jest.fn()
    sequencer = fakeLightingController({
      addEffect,
      setEffect,
      removeEffect,
    })
    return new Rb3MenuCueHandler(lightManager, sequencer)
  }

  it('playMenuFrame sets base and one addEffect per light', () => {
    const lights = [
      createMockTrackedLight({ id: 'l0', position: 0 }),
      createMockTrackedLight({ id: 'l1', position: 1 }),
    ]
    const h = buildHandler(lights)
    h.playMenuFrame()
    expect(setEffect).toHaveBeenCalledWith('rb3-menu-base', expect.any(Object), true)
    expect(addEffect).toHaveBeenCalledTimes(2)
    expect(getLights).toHaveBeenCalledWith(['front', 'back'], 'all')
  })

  it('draws the base look once per frame and leaves it standing', () => {
    const setTransition = jest.spyOn(LightTransitionController.prototype, 'setTransition')
    const h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    try {
      new Rb3MenuCueHandler(h.lightManager, h.sequencer).playMenuFrame()
      for (let elapsed = 0; elapsed < 500; elapsed += 10) h.advanceBy(10)

      const baseStarts = setTransition.mock.calls.filter(([, layer]) => layer === 0)
      expect(baseStarts).toHaveLength(h.allLightIds.length)
      expect(h.getLightState(h.frontLightIds[0])?.intensity).toBeGreaterThan(0)
    } finally {
      h.cleanup()
      setTransition.mockRestore()
    }
  })

  it('playMenuFrame with no lights is a no-op and does not throw', () => {
    const h = buildHandler([])
    expect(() => h.playMenuFrame()).not.toThrow()
    expect(addEffect).not.toHaveBeenCalled()
    expect(setEffect).not.toHaveBeenCalled()
  })

  it('clear removes base and per-light effects for registered layers', () => {
    const lights = [createMockTrackedLight({ id: 'l0' }), createMockTrackedLight({ id: 'l1' })]
    const h = buildHandler(lights)
    h.playMenuFrame()
    removeEffect.mockClear()
    h.clear()
    expect(removeEffect).toHaveBeenCalledWith('rb3-menu-base', 0)
    expect(removeEffect).toHaveBeenCalledWith('rb3-menu-light-0', 1)
    expect(removeEffect).toHaveBeenCalledWith('rb3-menu-light-1', 2)
  })

  it('shutdown clears menu effects', () => {
    const lights = [createMockTrackedLight({ id: 'l0' })]
    const h = buildHandler(lights)
    h.playMenuFrame()
    removeEffect.mockClear()
    h.shutdown()
    expect(removeEffect).toHaveBeenCalled()
  })
})
