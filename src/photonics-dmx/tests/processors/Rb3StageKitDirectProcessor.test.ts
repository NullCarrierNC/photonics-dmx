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
import { DEFAULT_STAGEKIT_CONFIG } from '../../listeners/RB3/StageKitTypes'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { getColor } from '../../helpers/dmxHelpers'
import { CueData } from '../../cues/types/cueTypes'
import { Effect, RGBIO } from '../../types'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'
import { performance as perfHooks } from 'perf_hooks'
import { fakeLightingController } from '../helpers/fakeLightingController'

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
    timestamp: Date.now(),
  })
}

function emitScreenName(emitter: EventEmitter, screenName: string): void {
  emitter.emit('rb3e:screenName', {
    screenName,
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
  let setEffect: jest.Mock<ILightingController['setEffect']>
  let removeEffect: jest.Mock
  let setState: jest.Mock
  let blackout: jest.Mock<ILightingController['blackout']>

  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    networkListener = new EventEmitter()
    lightManager = new DmxLightManager(makeFourLightConfig())

    addEffect = jest.fn()
    setEffect = jest.fn<ILightingController['setEffect']>(() => Promise.resolve())
    removeEffect = jest.fn()
    setState = jest.fn()
    blackout = jest.fn<ILightingController['blackout']>(() => Promise.resolve())

    photonicsSequencer = fakeLightingController({
      addEffect,
      setEffect,
      removeEffect,
      setState,
      blackout,
    })

    menuHandler = new Rb3MenuCueHandler(lightManager, photonicsSequencer)
    // Single-rig fanout: the processor builds one Rb3StageKitRigProcessor from the chain.
    const chainFanout = new ChainFanout()
    chainFanout.setChains([
      {
        rigId: 'primary',
        isPrimary: true,
        dmxLightManager: lightManager,
        sequencer: photonicsSequencer,
        cueHandlers: {
          yarg: null,
          rb3: null,
        },
        audioCueHandler: null,
        rb3MenuCueHandler: menuHandler,
      } as unknown as RigChain,
    ])
    processor = new Rb3StageKitDirectProcessor(chainFanout, {}, menuHandler)
    processor.startListening(networkListener)
  })

  afterEach(() => {
    processor.stopListening(networkListener)
    processor.destroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('song_select_screen emits Default menu cue when it is not already running', () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)

    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => {
      handled.push(d)
    })

    emitScreenName(networkListener, 'song_select_screen')

    expect(handled).toHaveLength(1)
    expect(handled[0].lightingCue).toBe('Default')
    expect(handled[0].currentScene).toBe('Menu')
    expect(handled[0].rb3ScreenName).toBe('song_select_screen')
  })

  it('accumulates a full ledBanks snapshot across per-bank StageKit events', () => {
    emitGameState(networkListener, 'InGame')
    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => handled.push(d))
    const stage = (color: string, positions: number[]): void => {
      networkListener.emit('stagekit:data', {
        positions,
        color,
        timestamp: Date.now(),
      })
    }
    const lastBanks = (): CueData['ledBanks'] => handled[handled.length - 1].ledBanks

    stage('red', [0, 2]) // bits 0 and 2
    stage('green', [1]) // bit 1
    expect(lastBanks()).toEqual({ red: 0b0101, green: 0b0010, blue: 0, yellow: 0 })

    stage('green', []) // empty positions clears just green
    expect(lastBanks()).toEqual({ red: 0b0101, green: 0, blue: 0, yellow: 0 })

    stage('off', []) // global off clears everything
    expect(lastBanks()).toEqual({ red: 0, green: 0, blue: 0, yellow: 0 })
  })

  it('song_select_screen does not re-emit Default menu when cue is already running (e.g. after main_hub)', () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)

    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => {
      handled.push(d)
    })

    emitScreenName(networkListener, 'main_hub_screen')
    expect(handled).toHaveLength(1)

    emitScreenName(networkListener, 'song_select_screen')
    expect(handled).toHaveLength(1)
  })

  it('main_hub_screen emits Default menu cue while game state is still InGame', () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)

    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => {
      handled.push(d)
    })

    emitScreenName(networkListener, 'main_hub_screen')

    expect(handled).toHaveLength(1)
    expect(handled[0].lightingCue).toBe('Default')
    expect(handled[0].currentScene).toBe('Menu')
    expect(handled[0].rb3ScreenName).toBe('main_hub_screen')
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

describe('StageKit direct mode configuration', () => {
  it('carries only the settings something reads', () => {
    expect(Object.keys(DEFAULT_STAGEKIT_CONFIG).sort()).toEqual([
      'debug',
      'enabled',
      'strobeWatchdogMs',
    ])
  })
})

describe('StageKit strobe watchdog', () => {
  let networkListener: EventEmitter
  let processor: Rb3StageKitDirectProcessor
  const WINDOW_MS = 2000

  /** A rig with a strobe fixture, so a strobe command produces a real effect to observe. */
  function makeStrobeRigConfig() {
    return createMockLightingConfig({
      numLights: 4,
      frontLights: [
        createMockDmxLight({ id: 's-f0', position: 0, fixtureId: 's-f0', isStrobeEnabled: true }),
        createMockDmxLight({ id: 's-f1', position: 1, fixtureId: 's-f1' }),
        createMockDmxLight({ id: 's-f2', position: 2, fixtureId: 's-f2' }),
        createMockDmxLight({ id: 's-f3', position: 3, fixtureId: 's-f3' }),
      ],
      backLights: [],
      strobeLights: [
        createMockDmxLight({ id: 's-f0', position: 0, fixtureId: 's-f0', isStrobeEnabled: true }),
      ],
    })
  }

  function emitStrobe(speed: 'slow' | 'medium' | 'fast' | 'fastest'): void {
    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      strobeEffect: speed,
      timestamp: Date.now(),
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    // monotonicNowMs reads perf_hooks performance, which is a different object from the global
    // one fake timers install, so the spy has to go on the module the clock actually calls.
    jest.spyOn(perfHooks, 'now').mockImplementation(() => Date.now())
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    networkListener = new EventEmitter()
    const lightManager = new DmxLightManager(makeStrobeRigConfig())
    const sequencer = fakeLightingController()
    const chainFanout = new ChainFanout()
    chainFanout.setChains([
      {
        rigId: 'strobe-rig',
        isPrimary: true,
        dmxLightManager: lightManager,
        sequencer,
        cueHandlers: { yarg: null, rb3: null },
        audioCueHandler: null,
        rb3MenuCueHandler: null,
      } as unknown as RigChain,
    ])
    processor = new Rb3StageKitDirectProcessor(chainFanout, { strobeWatchdogMs: WINDOW_MS })
    processor.startListening(networkListener)
  })

  afterEach(() => {
    processor.stopListening(networkListener)
    processor.destroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('cuts a strobe the console stopped talking about', () => {
    emitStrobe('fastest')
    expect(processor.getStatus().hasActiveStrobeEffects).toBe(true)

    jest.advanceTimersByTime(WINDOW_MS + 500)

    expect(processor.getStatus().hasActiveStrobeEffects).toBe(false)
  })

  it('leaves a strobe running while packets keep arriving', () => {
    emitStrobe('fast')

    for (let elapsed = 0; elapsed < WINDOW_MS * 3; elapsed += WINDOW_MS / 2) {
      jest.advanceTimersByTime(WINDOW_MS / 2)
      emitStrobe('fast')
    }

    expect(processor.getStatus().hasActiveStrobeEffects).toBe(true)
  })

  it('stays quiet when no strobe is running', () => {
    networkListener.emit('stagekit:data', { positions: [0], color: 'red', timestamp: Date.now() })

    jest.advanceTimersByTime(WINDOW_MS * 2)

    expect(processor.getStatus().hasActiveStrobeEffects).toBe(false)
  })

  it('runs one strobe however many times the console repeats the packet', () => {
    for (let i = 0; i < 10; i++) {
      emitStrobe('fast')
    }

    expect(processor.getStatus().activeStrobeEffects).toHaveLength(1)
  })

  it('swaps to the new rate when the console changes strobe speed', () => {
    emitStrobe('slow')
    emitStrobe('fastest')

    const running = processor.getStatus().activeStrobeEffects
    expect(running).toHaveLength(1)
    expect(running[0]).toContain('fastest')
  })

  it('starts a fresh strobe after one is cut and the console asks again', () => {
    emitStrobe('fast')
    jest.advanceTimersByTime(WINDOW_MS + 500)
    expect(processor.getStatus().hasActiveStrobeEffects).toBe(false)

    emitStrobe('fast')

    expect(processor.getStatus().activeStrobeEffects).toHaveLength(1)
  })
})
