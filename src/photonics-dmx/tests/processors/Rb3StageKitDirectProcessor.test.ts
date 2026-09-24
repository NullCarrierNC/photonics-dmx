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
    setEffect = jest.fn<ILightingController['setEffect']>()
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

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })
    expect(lastBanks()).toEqual({ red: 0, green: 0, blue: 0, yellow: 0 })
  })

  it('leaves the accumulated banks alone for fog and strobe packets', () => {
    emitGameState(networkListener, 'InGame')
    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => handled.push(d))
    const stage = (fields: Partial<Parameters<typeof networkListener.emit>[1]>): void => {
      networkListener.emit('stagekit:data', {
        positions: [],
        color: 'off',
        timestamp: Date.now(),
        ...fields,
      })
    }
    const lastBanks = (): CueData['ledBanks'] => handled[handled.length - 1].ledBanks

    networkListener.emit('stagekit:data', {
      positions: [0, 2],
      color: 'red',
      timestamp: Date.now(),
    })
    expect(lastBanks()).toEqual({ red: 0b0101, green: 0, blue: 0, yellow: 0 })

    stage({ fog: true, leftChannel: 0, rightChannel: 1 })
    stage({ fog: false, leftChannel: 0, rightChannel: 2 })
    stage({ strobeEffect: 'fast' })
    stage({ strobeEffect: 'off' })

    expect(lastBanks()).toEqual({ red: 0b0101, green: 0, blue: 0, yellow: 0 })
  })

  it.each([
    ['0x00', { fog: false, rightChannel: 0x00 }],
    ['fog on', { fog: true, rightChannel: 0x01 }],
    ['an unrecognised command', { fog: false, rightChannel: 0x10 }],
  ])('leaves lit positions alone on the rig and in the snapshot for %s', async (_label, fields) => {
    emitGameState(networkListener, 'InGame')
    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => handled.push(d))

    networkListener.emit('stagekit:data', {
      positions: [0, 2],
      color: 'red',
      fog: false,
      leftChannel: 0b0101,
      rightChannel: 0x80,
      timestamp: Date.now(),
    })
    await jest.advanceTimersByTimeAsync(50)
    setState.mockClear()

    networkListener.emit('stagekit:data', {
      positions: [0, 2],
      color: 'off',
      leftChannel: 0b0101,
      timestamp: Date.now(),
      ...fields,
    })
    await jest.advanceTimersByTimeAsync(50)

    expect(setState).not.toHaveBeenCalled()
    expect(handled[handled.length - 1].ledBanks).toEqual({
      red: 0b0101,
      green: 0,
      blue: 0,
      yellow: 0,
    })
  })

  it('DisableAll turns off every rig, resets strobe state, and reports processed and handled', () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)
    blackout.mockClear()

    const handled: CueData[] = []
    const processed: unknown[] = []
    processor.on('cueHandled', (d: CueData) => handled.push(d))
    processor.on('stagekit:processed', (e: unknown) => processed.push(e))

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })

    expect(blackout).toHaveBeenCalledWith(0)
    expect(processed).toHaveLength(1)
    expect(handled[handled.length - 1].ledBanks).toEqual({ red: 0, green: 0, blue: 0, yellow: 0 })
  })

  it('DisableAll during the menu look leaves the rig alone', async () => {
    emitGameState(networkListener, 'InGame')
    emitGameState(networkListener, 'Menus')
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()
    blackout.mockClear()

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })

    expect(blackout).not.toHaveBeenCalled()
  })

  it('leaves the menu look once on a gameplay packet, and a late InGame leaves the song lit', async () => {
    emitGameState(networkListener, 'Menus')
    jest.advanceTimersByTime(1000)
    await Promise.resolve()

    networkListener.emit('stagekit:data', {
      positions: [0, 1, 2, 3, 4, 5, 6, 7],
      color: 'red',
      fog: false,
      leftChannel: 0xff,
      rightChannel: 0x80,
      timestamp: Date.now(),
    })
    expect(removeEffect).toHaveBeenCalledWith(MENU_BASE, 0)

    blackout.mockClear()
    setEffect.mockClear()
    emitGameState(networkListener, 'InGame')
    jest.advanceTimersByTime(3000)

    expect(blackout).not.toHaveBeenCalled()
    expect(setEffect).not.toHaveBeenCalledWith(MENU_BASE, expect.any(Object), true)
  })

  it.each([
    ['a bank clear', { color: 'red', leftChannel: 0, rightChannel: 0x80 }],
    ['strobe off', { color: 'off', leftChannel: 0, rightChannel: 0x07, strobeEffect: 'off' }],
    ['fog off', { color: 'off', leftChannel: 0, rightChannel: 0x02 }],
    ['DisableAll', { color: 'off', leftChannel: 0, rightChannel: 0xff }],
  ])('keeps the menu look through %s', async (_label, fields) => {
    emitGameState(networkListener, 'Menus')
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    setEffect.mockClear()

    networkListener.emit('stagekit:data', {
      positions: [],
      fog: false,
      timestamp: Date.now(),
      ...fields,
    })
    jest.advanceTimersByTime(1000)

    expect(setEffect).toHaveBeenCalledWith(MENU_BASE, expect.any(Object), true)
  })

  it('lights normally from a colour packet right after DisableAll', () => {
    emitGameState(networkListener, 'InGame')
    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => handled.push(d))

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })
    networkListener.emit('stagekit:data', { positions: [3], color: 'blue', timestamp: Date.now() })

    expect(handled[handled.length - 1].ledBanks).toEqual({
      red: 0,
      green: 0,
      blue: 0b1000,
      yellow: 0,
    })
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

  it('a repeated main_hub_screen leaves the running Default menu alone', () => {
    emitGameState(networkListener, 'InGame')
    emitStageKit(networkListener)

    const handled: CueData[] = []
    processor.on('cueHandled', (d: CueData) => {
      handled.push(d)
    })

    emitScreenName(networkListener, 'main_hub_screen')
    emitScreenName(networkListener, 'main_hub_screen')

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

describe('Rb3StageKitDirectProcessor DisableAll across multiple rigs', () => {
  it('turns off every active rig', () => {
    const networkListener = new EventEmitter()
    const blackoutA = jest.fn<ILightingController['blackout']>(() => Promise.resolve())
    const blackoutB = jest.fn<ILightingController['blackout']>(() => Promise.resolve())
    const rigA = {
      rigId: 'rig-a',
      isPrimary: true,
      dmxLightManager: new DmxLightManager(makeFourLightConfig()),
      sequencer: fakeLightingController({ blackout: blackoutA }),
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain
    const rigB = {
      rigId: 'rig-b',
      isPrimary: false,
      dmxLightManager: new DmxLightManager(makeFourLightConfig()),
      sequencer: fakeLightingController({ blackout: blackoutB }),
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain
    const chainFanout = new ChainFanout()
    chainFanout.setChains([rigA, rigB])
    const processor = new Rb3StageKitDirectProcessor(chainFanout)
    processor.startListening(networkListener)

    emitGameState(networkListener, 'InGame')
    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })

    expect(blackoutA).toHaveBeenCalledWith(0)
    expect(blackoutB).toHaveBeenCalledWith(0)

    processor.stopListening(networkListener)
    processor.destroy()
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
  let chainFanout: ChainFanout
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
    chainFanout = new ChainFanout()
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

  it('drives the hardware strobe slot while a strobe runs', () => {
    emitStrobe('fast')
    expect(chainFanout.strobeState.getActive()).toBe('fast')

    emitStrobe('slow')
    expect(chainFanout.strobeState.getActive()).toBe('slow')

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      strobeEffect: 'off',
      timestamp: Date.now(),
    })
    expect(chainFanout.strobeState.getActive()).toBeNull()
  })

  it('frees the hardware strobe slot when the strobe is cut', () => {
    emitStrobe('fastest')

    jest.advanceTimersByTime(WINDOW_MS + 500)

    expect(chainFanout.strobeState.getActive()).toBeNull()
  })

  it('frees the hardware strobe slot on DisableAll', () => {
    emitStrobe('medium')

    networkListener.emit('stagekit:data', {
      positions: [],
      color: 'off',
      fog: false,
      leftChannel: 0,
      rightChannel: 0xff,
      timestamp: Date.now(),
    })

    expect(chainFanout.strobeState.getActive()).toBeNull()
  })

  it('starts a fresh strobe after one is cut and the console asks again', () => {
    emitStrobe('fast')
    jest.advanceTimersByTime(WINDOW_MS + 500)
    expect(processor.getStatus().hasActiveStrobeEffects).toBe(false)

    emitStrobe('fast')

    expect(processor.getStatus().activeStrobeEffects).toHaveLength(1)
  })
})
