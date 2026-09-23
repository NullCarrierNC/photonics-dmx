/**
 * Startup ordering in `main/index.ts`.
 *
 * Everything that builds the window, the IPC surface and the error dialog runs inside the one
 * `whenReady` callback, so anything earlier in that callback that throws takes all of it with it
 * and leaves a process the user cannot see or quit. The file log sink is the first thing in there
 * and it creates its directory up front, which is the throw most likely to happen in the field.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { LogEntry } from '../../shared/logger'

const applicationInit = jest.fn<() => Promise<void>>()
const applicationShutdown = jest.fn<() => Promise<void>>()
const closeWindowsForQuit = jest.fn<() => Promise<boolean>>()
const handleSecondInstance = jest.fn()
const handleActivate = jest.fn()
const applicationCtor = jest.fn()
let mockIsPackaged = false
let mockHasInstanceLock = true
const createFileLogSink = jest.fn()
const installCsp = jest.fn()
const installPermissionHandlers = jest.fn()
const showErrorBox = jest.fn()
const appExit = jest.fn()
const appOn = jest.fn()

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
    on: appOn,
    exit: appExit,
    requestSingleInstanceLock: () => mockHasInstanceLock,
    quit: jest.fn(),
    get isPackaged() {
      return mockIsPackaged
    },
    commandLine: { appendSwitch: jest.fn() },
    name: '',
  },
  BrowserWindow: { getAllWindows: jest.fn(() => [{}]) },
  dialog: { showErrorBox },
}))

jest.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: jest.fn() },
  optimizer: { watchWindowShortcuts: jest.fn() },
}))

jest.mock('../rendererSessionSecurity', () => ({
  installDefaultSessionContentSecurityPolicy: installCsp,
  installDefaultSessionPermissionHandlers: installPermissionHandlers,
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
    closeWindowsForQuit = closeWindowsForQuit
    flushLogs: (() => Promise<void>) | null = null
    handleSecondInstance = handleSecondInstance
    handleAllWindowsClosed = jest.fn()
    handleActivate = handleActivate
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
    closeWindowsForQuit.mockReset()
    closeWindowsForQuit.mockResolvedValue(true)
    handleSecondInstance.mockReset()
    handleActivate.mockReset()
    mockIsPackaged = false
    applicationCtor.mockReset()
    createFileLogSink.mockReset()
    createFileLogSink.mockReturnValue({ sink: jest.fn(), close: jest.fn(async () => {}) })
    installCsp.mockReset()
    installPermissionHandlers.mockReset()
    showErrorBox.mockReset()
    appExit.mockReset()
    appOn.mockReset()
    mockHasInstanceLock = true
  })

  it('builds the application once Electron is ready', async () => {
    await startUp()

    expect(installCsp).toHaveBeenCalled()
    expect(installPermissionHandlers).toHaveBeenCalled()
    expect(applicationCtor).toHaveBeenCalledTimes(1)
    expect(applicationInit).toHaveBeenCalledTimes(1)
  })

  it('watches window shortcuts before the application builds its first window', async () => {
    const order: string[] = []
    appOn.mockImplementation((event: unknown) => {
      if (event === 'browser-window-created') order.push('watch')
    })
    applicationInit.mockImplementation(async () => {
      order.push('init')
    })

    await startUp()

    expect(order).toEqual(['watch', 'init'])
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

  it('quits a second launch rather than running two copies', async () => {
    mockHasInstanceLock = false

    await startUp()

    expect(appExit).toHaveBeenCalledWith(0)
    expect(applicationCtor).not.toHaveBeenCalled()
  })

  it('hands a second launch back to the window this one already has', async () => {
    await startUp()

    const secondInstance = appOn.mock.calls.find((c) => c[0] === 'second-instance')?.[1]
    ;(secondInstance as () => void)()

    expect(handleSecondInstance).toHaveBeenCalledTimes(1)
  })

  it('hands every Dock activation to the application, with windows open or not', async () => {
    await startUp()

    const activate = appOn.mock.calls.find((c) => c[0] === 'activate')?.[1]
    ;(activate as () => void)()

    expect(handleActivate).toHaveBeenCalledTimes(1)
  })

  /** Sends the app the Quit a menu, Cmd+Q or the Dock sends, and lets it run to its end. */
  async function quit(): Promise<void> {
    const beforeQuit = appOn.mock.calls.find((c) => c[0] === 'before-quit')?.[1]
    ;(beforeQuit as (event: { preventDefault: () => void }) => void)({ preventDefault: jest.fn() })
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  it('shuts down on a Quit once every window has closed', async () => {
    await startUp()

    await quit()

    expect(closeWindowsForQuit).toHaveBeenCalledTimes(1)
    expect(applicationShutdown).toHaveBeenCalledTimes(1)
    expect(appExit).toHaveBeenCalledWith(0)
  })

  it('keeps the app and its controllers running when a window stays open on Quit', async () => {
    closeWindowsForQuit.mockResolvedValue(false)
    await startUp()

    await quit()

    expect(applicationShutdown).not.toHaveBeenCalled()
    expect(appExit).not.toHaveBeenCalled()
  })

  it('keeps the configuration account recording when a packaged build raises the floor', async () => {
    // The floor answers to the engine, which logs per frame. These scopes log a handful of lines a
    // launch and are the only record of what a migration or a recovery did to the user's own files.
    mockIsPackaged = true

    const entries: LogEntry[] = []
    await startUp()
    const logger = await loadedLogger()
    logger.setLogSink((entry) => entries.push(entry))
    try {
      logger.createLogger('ConfigFile').info('recovered from a parse failure')
      logger.createLogger('LightTransitionController').info('frame chatter')
      logger.createLogger('Main').error('a real failure')
    } finally {
      logger.resetLogConfiguration()
    }

    expect(entries.map((e) => e.scope)).toEqual(['ConfigFile', 'Main'])
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'flushes the log before a forced exit on %s',
    async (signal) => {
      const order: string[] = []
      const closeFileLog = jest.fn(async () => {
        order.push('flush')
      })
      createFileLogSink.mockReturnValue({ sink: jest.fn(), close: closeFileLog })
      applicationShutdown.mockImplementation(() => new Promise<void>(() => {}))

      const before = new Set(process.listeners(signal))
      await startUp()
      const handler = process.listeners(signal).find((l) => !before.has(l))

      const exit = jest.spyOn(process, 'exit').mockImplementation(((): never => {
        order.push('exit')
        return undefined as never
      }) as never)
      const logger = await loadedLogger()
      logger.setLogSink(() => {})
      jest.useFakeTimers()
      try {
        void handler?.(signal)
        await jest.advanceTimersByTimeAsync(2000)

        expect(order).toEqual(['flush', 'exit'])
        expect(exit).toHaveBeenCalledWith(1)
      } finally {
        jest.clearAllTimers()
        jest.useRealTimers()
        exit.mockRestore()
        logger.resetLogConfiguration()
      }
    },
  )
})
