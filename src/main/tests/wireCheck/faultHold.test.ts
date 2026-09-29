/**
 * Rig check 6, through a real ControllerManager from `init()` on the virtual clock: an uncaught
 * fault takes the whole universe dark and holds it dark, and Retry brings the controllers back
 * with nothing lit until a cue starts again.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockAppData = ''

jest.mock('electron', () => ({
  app: {
    getPath: () => mockAppData,
    getAppPath: () => path.resolve(__dirname, '../../../..'),
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

/* eslint-disable @typescript-eslint/no-require-imports -- imported after the electron mock */
const { ConfigurationManager } =
  require('../../../services/configuration/ConfigurationManager') as typeof import('../../../services/configuration/ConfigurationManager')
const { ControllerManager } =
  require('../../controllers/ControllerManager') as typeof import('../../controllers/ControllerManager')
const { SenderManager } =
  require('../../../photonics-dmx/controllers/SenderManager') as typeof import('../../../photonics-dmx/controllers/SenderManager')
const { VirtualTime } =
  require('../../../photonics-dmx/sim/VirtualTime') as typeof import('../../../photonics-dmx/sim/VirtualTime')
const { rigFiles } =
  require('../../wireCheck/wireScenario') as typeof import('../../wireCheck/wireScenario')
/* eslint-enable @typescript-eslint/no-require-imports */

jest.setTimeout(60000)

type Manager = InstanceType<typeof ControllerManager>

/** Two RGB PARs at 1 and 5 on the front row. */
const TWO_PARS = rigFiles({
  templates: [
    { id: 'par', fixture: 'rgb', channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } },
  ],
  lights: [
    { id: 'A', template: 'par', group: 'front', address: 1 },
    { id: 'B', template: 'par', group: 'front', address: 5 },
  ],
})

describe('rig check 6: a fault holds the universe dark', () => {
  let time: InstanceType<typeof VirtualTime>
  let manager: Manager | null
  let universe: number[]

  /** Every channel the wire holds above 0, by channel. */
  const lit = (): Record<number, number> =>
    Object.fromEntries(universe.flatMap((value, ch) => (ch > 0 && value > 0 ? [[ch, value]] : [])))

  /** Settles `promise` while the virtual clock runs, a frame at a time. */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    let done = false
    const settled = promise.finally(() => {
      done = true
    })
    while (!done) {
      await time.advance(10)
    }
    return settled
  }

  /** Brings the controllers back up as the Retry banner does. */
  const retry = (m: Manager): Promise<void> =>
    settle(m.getIsInitialized() ? m.restartControllers() : m.init())

  /** The rows of `rows` with anything lit. */
  const litRows = (rows: Array<Record<number, number>>) =>
    rows.filter((row) => Object.keys(row).length > 0)

  /** The lit channels at each frame over `ms`. */
  async function watch(ms: number): Promise<Array<Record<number, number>>> {
    const rows: Array<Record<number, number>> = []
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      await time.advance(20)
      rows.push(lit())
    }
    return rows
  }

  beforeEach(async () => {
    mockAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-hold-'))
    const configDir = path.join(mockAppData, 'Photonics.rocks')
    fs.mkdirSync(configDir, { recursive: true })
    for (const [name, body] of Object.entries(TWO_PARS)) {
      fs.writeFileSync(path.join(configDir, name), JSON.stringify(body, null, 2))
    }
    universe = new Array<number>(513).fill(0)
    jest.spyOn(SenderManager.prototype, 'getEnabledWireSenders').mockReturnValue(['sacn'])
    jest.spyOn(SenderManager.prototype, 'isIpcEnabled').mockReturnValue(false)
    jest.spyOn(SenderManager.prototype, 'send').mockImplementation((_slot, buffer) => {
      for (const [ch, value] of Object.entries(buffer)) universe[Number(ch)] = value
      return Promise.resolve(true)
    })
    time = new VirtualTime({ frameStepMs: 10 })
    time.install()
    await time.advance(10_000)
    manager = new ControllerManager({ config: new ConfigurationManager() })
    await settle(manager.init())
  })

  afterEach(async () => {
    if (manager) {
      await settle(manager.getTestEffectRunner('yarg').stopTestEffect())
      await settle(manager.shutdown())
    }
    manager = null
    time.dispose()
    jest.restoreAllMocks()
    fs.rmSync(mockAppData, { recursive: true, force: true })
  })

  it('goes dark on a fault while Cue Simulation plays, and stays dark after Retry', async () => {
    const m = manager as Manager
    m.getTestEffectRunner('yarg').startTestEffect('Flare_Slow', 'Large', 120, 'yarg-stagekit')
    await watch(600)
    expect(lit()).toEqual({ 1: 255, 2: 255, 3: 255, 4: 255, 5: 255, 6: 255, 7: 255, 8: 255 })

    m.handleUncaughtException(new Error('rig check fault'))
    const during = await watch(1500)

    expect(litRows(during.slice(1))).toEqual([])
    expect(m.getLifecyclePhase()).toBe('failed')

    await retry(m)
    await watch(800)

    expect(m.getLifecyclePhase()).toBe('running')
    expect(lit()).toEqual({})
  })

  it('stays dark on a fault while a sender change holds the lifecycle queue', async () => {
    const m = manager as Manager
    m.getTestEffectRunner('yarg').startTestEffect('Cool_Automatic', 'Large', 120, 'yarg-stagekit')
    await watch(1100)
    expect(litRows([lit()])).not.toEqual([])

    const holding = m.runSenderOp(() => new Promise<void>((resolve) => setTimeout(resolve, 900)))
    m.handleUncaughtException(new Error('rig check fault'))
    const during = await watch(1600)
    await settle(holding)

    expect(litRows(during.slice(1))).toEqual([])
    expect(m.getLifecyclePhase()).toBe('failed')
  })

  it('closes an open DMX console on a fault and refuses it until Retry', async () => {
    const m = manager as Manager
    const consoleMode = m.getConsoleModeController()
    expect(await settle(m.enableConsoleMode('rig-1'))).toEqual({ success: true })
    consoleMode.sendConsoleDmx({ 1: 200, 2: 255, 5: 128, 7: 64, 100: 255 })
    await watch(200)
    expect(lit()).toEqual({ 1: 200, 2: 255, 5: 128, 7: 64, 100: 255 })

    m.handleUncaughtException(new Error('rig check fault'))
    const during = await watch(1500)
    consoleMode.sendConsoleDmx({ 1: 255, 2: 255, 100: 255 })
    await watch(200)

    expect(litRows(during.slice(1))).toEqual([])
    expect(lit()).toEqual({})
    expect(m.getLifecyclePhase()).toBe('failed')
    expect(await settle(m.enableConsoleMode('rig-1'))).toMatchObject({ success: false })

    await retry(m)
    await watch(800)

    expect(m.getLifecyclePhase()).toBe('running')
    expect(lit()).toEqual({})
  })
})
