import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import { createMockTrackedLight } from '../helpers/testFixtures'

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
    sequencer = { addEffect, setEffect, removeEffect } as unknown as ILightingController
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
