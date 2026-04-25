/**
 * Drives Rb3StageKitDirectProcessor via EventEmitter to mirror RB3E listener events.
 * Confirms the RB3-only menu cue runs from network-like game/StageKit flow.
 */
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { Rb3MenuCueHandler } from '../../cueHandlers/Rb3MenuCueHandler'
import { Rb3StageKitDirectProcessor } from '../../processors/Rb3StageKitDirectProcessor'
import { getColor } from '../../helpers/dmxHelpers'
import { Effect, RGBIO } from '../../types'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'

const MENU_BASE = 'rb3-menu-base'
const menuLight = (i: number) => `rb3-menu-light-${i}`

const rb3MenuPalette: RGBIO[] = [
  getColor('yellow', 'high'),
  getColor('yellow', 'medium'),
  getColor('yellow', 'low'),
  getColor('red', 'high'),
  getColor('red', 'medium'),
  getColor('red', 'low'),
]

function colorInPalette(c: RGBIO | undefined, palette: RGBIO[]): boolean {
  if (!c) return false
  return palette.some(
    (p) =>
      p.red === c.red &&
      p.green === c.green &&
      p.blue === c.blue &&
      p.intensity === c.intensity &&
      p.opacity === c.opacity &&
      p.blendMode === c.blendMode,
  )
}

function makeFourLightConfig() {
  return createMockLightingConfig({
    numLights: 4,
    frontLights: [
      createMockDmxLight({ id: 'f0', position: 0, fixtureId: 'f0' }),
      createMockDmxLight({ id: 'f1', position: 1, fixtureId: 'f1' }),
      createMockDmxLight({ id: 'f2', position: 2, fixtureId: 'f2' }),
      createMockDmxLight({ id: 'f3', position: 3, fixtureId: 'f3' }),
    ],
    backLights: [],
    strobeLights: [],
  })
}

function emitGameState(emitter: EventEmitter, state: 'Menus' | 'InGame'): void {
  emitter.emit('rb3e:gameState', {
    gameState: state,
    platform: 'RB3E',
    timestamp: Date.now(),
    cueData: null,
  })
}

function emitStageKit(emitter: EventEmitter): void {
  emitter.emit('stagekit:data', {
    positions: [0, 1],
    color: 'red',
    brightness: 'medium',
    timestamp: Date.now(),
  })
}

describe('Rb3StageKitDirectProcessor (RB3 network data → menu lighting)', () => {
  let networkListener: EventEmitter
  let lightManager: DmxLightManager
  let photonicsSequencer: ILightingController
  let menuHandler: Rb3MenuCueHandler
  let processor: Rb3StageKitDirectProcessor
  let addEffect: jest.Mock
  let setEffect: jest.Mock
  let removeEffect: jest.Mock
  let setState: jest.Mock
  let blackout: jest.Mock

  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    networkListener = new EventEmitter()
    lightManager = new DmxLightManager(makeFourLightConfig())

    addEffect = jest.fn()
    setEffect = jest.fn().mockImplementation(() => Promise.resolve())
    removeEffect = jest.fn()
    setState = jest.fn()
    blackout = jest.fn().mockImplementation(() => Promise.resolve())

    photonicsSequencer = {
      addEffect,
      setEffect,
      addEffectWithCallback: jest.fn(),
      setEffectWithCallback: jest.fn(),
      addEffectUnblockedNameWithCallback: jest.fn(),
      setEffectUnblockedNameWithCallback: jest.fn(),
      removeEffectCallback: jest.fn(),
      removeEffect,
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      setState,
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      onDrumNote: jest.fn(),
      onGuitarNote: jest.fn(),
      onBassNote: jest.fn(),
      onKeysNote: jest.fn(),
      blackout,
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      schedulePanTiltClear: jest.fn(),
      cancelPanTiltClear: jest.fn(),
      addMotionPattern: jest.fn(),
      removeMotionPattern: jest.fn(),
      getMotionPattern: jest.fn(),
      updateMotionPatternConfig: jest.fn(),
      replaceEffect: jest.fn(),
      shutdown: jest.fn(),
    } as unknown as ILightingController

    menuHandler = new Rb3MenuCueHandler(lightManager, photonicsSequencer)
    processor = new Rb3StageKitDirectProcessor(lightManager, photonicsSequencer, {}, menuHandler)
    processor.startListening(networkListener)
  })

  afterEach(() => {
    processor.stopListening(networkListener)
    processor.destroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('after InGame and StageKit data, Menus + 1s timer schedules menu base and per-light red/yellow effects', async () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)
    setEffect.mockClear()
    addEffect.mockClear()
    removeEffect.mockClear()

    emitGameState(networkListener, 'Menus')
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(setEffect).toHaveBeenCalledWith(MENU_BASE, expect.any(Object), true)

    expect(addEffect).toHaveBeenCalled()
    for (const [name, effect] of addEffect.mock.calls as [string, Effect][]) {
      expect(name).toMatch(/^rb3-menu-light-\d+$/)
      expect(effect.transitions).toBeDefined()
      const t0 = effect.transitions[0]
      expect(t0.lights.length).toBe(1)
      const color = t0.transform.color
      expect(t0.transform.duration).toBe(800)
      expect(colorInPalette(color, rb3MenuPalette)).toBe(true)
    }
    expect(addEffect.mock.calls.length).toBe(4)
  })

  it('returning to InGame clears rb3-menu-base and per-light menu effect layers', async () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)
    setEffect.mockClear()
    addEffect.mockClear()
    removeEffect.mockClear()

    emitGameState(networkListener, 'Menus')
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(addEffect).toHaveBeenCalled()
    removeEffect.mockClear()

    emitGameState(networkListener, 'InGame')
    await Promise.resolve()

    expect(removeEffect).toHaveBeenCalledWith(MENU_BASE, 0)
    for (let i = 0; i < 4; i++) {
      expect(removeEffect).toHaveBeenCalledWith(menuLight(i), 1 + i)
    }
  })
})
