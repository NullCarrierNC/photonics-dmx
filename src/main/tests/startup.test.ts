/**
 * Startup ordering in `main/index.ts`.
 *
 * Everything that builds the window, the IPC surface and the error dialog runs inside the one
 * `whenReady` callback, so anything earlier in that callback that throws takes all of it with it
 * and leaves a process the user cannot see or quit. The file log sink is the first thing in there
 * and it creates its directory up front, which is the throw most likely to happen in the field.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const applicationInit = jest.fn<() => Promise<void>>()
const applicationShutdown = jest.fn<() => Promise<void>>()
const applicationCtor = jest.fn()
let mockIsPackaged = false
const createFileLogSink = jest.fn()
const installCsp = jest.fn()
const showErrorBox = jest.fn()
const appExit = jest.fn()

let readyResolve: (() => void) | undefined
const whenReady = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      readyResolve = resolve
    }),
)

jest.mock('electron', () => ({
  app: {
    whenReady,
    getPath: jest.fn(() => '/tmp/photonics-startup-test'),
    getVersion: jest.fn(() => '0.0.0'),
    on: jest.fn(),
    exit: appExit,
    quit: jest.fn(),
    get isPackaged() {
      return mockIsPackaged
    },
    commandLine: { appendSwitch: jest.fn() },
    name: '',
  },
  BrowserWindow: { getAllWindows: jest.fn(() => []) },
  dialog: { showErrorBox },
}))

jest.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: jest.fn() },
  optimizer: { watchWindowShortcuts: jest.fn() },
}))

jest.mock('../rendererSessionSecurity', () => ({
  installDefaultSessionContentSecurityPolicy: installCsp,
}))

jest.mock('../logging/fileLogSink', () => ({
  createFileLogSink: (...args: unknown[]) => createFileLogSink(...args),
}))

jest.mock('../application', () => ({
  Application: class {
    constructor() {
      applicationCtor()
    }
    init = applicationInit
    shutdown = applicationShutdown
    flushLogs: (() => Promise<void>) | null = null
    handleAllWindowsClosed = jest.fn()
    handleActivate = jest.fn()
    getControllerManager = jest.fn(() => null)
  },
}))

/**
 * The logger the entry point is holding.
 *
 * `resetModules` gives each test its own copy of the module graph, so the file's own static import
 * would be a different instance from the one whose floor the entry point just set.
 */
function loadedLogger(): Promise<typeof import('../../shared/logger')> {
  return import('../../shared/logger')
}

/** Load the entry point and run its ready callback to completion. */
async function startUp(): Promise<void> {
  await import('../index')
  readyResolve?.()
  // Two turns: one for the ready promise, one for the callback body's own continuation.
  await Promise.resolve()
  await Promise.resolve()
}

describe('main startup', () => {
  beforeEach(() => {
    jest.resetModules()
    readyResolve = undefined
    applicationInit.mockReset()
    applicationInit.mockResolvedValue(undefined)
    applicationShutdown.mockReset()
    applicationShutdown.mockResolvedValue(undefined)
    mockIsPackaged = false
    applicationCtor.mockReset()
    createFileLogSink.mockReset()
    createFileLogSink.mockReturnValue({ sink: jest.fn(), close: jest.fn(async () => {}) })
    installCsp.mockReset()
    showErrorBox.mockReset()
    appExit.mockReset()
  })

  it('builds the application once Electron is ready', async () => {
    await startUp()

    expect(installCsp).toHaveBeenCalled()
    expect(applicationCtor).toHaveBeenCalledTimes(1)
    expect(applicationInit).toHaveBeenCalledTimes(1)
  })

  it('carries on to the window when the log directory cannot be created', async () => {
    createFileLogSink.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    await startUp()

    expect(applicationCtor).toHaveBeenCalledTimes(1)
    expect(applicationInit).toHaveBeenCalledTimes(1)
    expect(showErrorBox).not.toHaveBeenCalled()
  })

  it('reports a failure to build the application rather than idling with no window', async () => {
    applicationCtor.mockImplementation(() => {
      throw new Error('appData is unwritable')
    })

    await startUp()

    expect(showErrorBox).toHaveBeenCalled()
    expect(appExit).toHaveBeenCalledWith(1)
  })

  it('flushes the log before a forced exit on a signal', async () => {
    const order: string[] = []
    const closeFileLog = jest.fn(async () => {
      order.push('flush')
    })
    createFileLogSink.mockReturnValue({ sink: jest.fn(), close: closeFileLog })
    applicationShutdown.mockImplementation(() => new Promise<void>(() => {}))

    const before = new Set(process.listeners('SIGINT'))
    await startUp()
    const handler = process.listeners('SIGINT').find((l) => !before.has(l))

    const exit = jest.spyOn(process, 'exit').mockImplementation(((): never => {
      order.push('exit')
      return undefined as never
    }) as never)
    const logger = await loadedLogger()
    logger.setLogSink(() => {})
    jest.useFakeTimers()
    try {
      void handler?.('SIGINT')
      await jest.advanceTimersByTimeAsync(2000)

      expect(order).toEqual(['flush', 'exit'])
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
      exit.mockRestore()
      logger.resetLogConfiguration()
    }
  })
})
