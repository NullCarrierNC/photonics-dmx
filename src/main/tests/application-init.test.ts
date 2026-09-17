import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const createMainWindow = jest.fn()
const setControllerManager = jest.fn()
const setupIpcHandlers = jest.fn()
const setupMenu = jest.fn()
const controllerInit = jest.fn<() => Promise<void>>()
const controllerShutdown = jest.fn<() => Promise<void>>()

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test'), quit: jest.fn() },
  ipcMain: {},
}))

jest.mock('../WindowManager', () => ({
  WindowManager: jest.fn(() => ({
    setControllerManager,
    createMainWindow,
    hasWindows: () => true,
    closeAllWindows: jest.fn(async () => {}),
  })),
}))

jest.mock('../controllers/ControllerManager', () => ({
  ControllerManager: jest.fn(() => ({
    init: controllerInit,
    shutdown: controllerShutdown,
    getConfig: () => ({ getPreference: jest.fn() }),
  })),
}))

jest.mock('../ipc/index', () => ({ setupIpcHandlers }))
jest.mock('../menu', () => ({ setupMenu }))

const initBlackoutShortcut = jest.fn()
const disposeBlackoutShortcut = jest.fn()
jest.mock('../blackoutShortcut', () => ({
  initBlackoutShortcut,
  disposeBlackoutShortcut,
}))

import { Application } from '../application'
import { resetLogConfiguration, setLogSink } from '../../shared/logger'

describe('Application init', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    controllerInit.mockReset()
    controllerShutdown.mockReset()
    controllerShutdown.mockResolvedValue(undefined)
    createMainWindow.mockReset()
    setControllerManager.mockReset()
    setupIpcHandlers.mockReset()
    setupMenu.mockReset()
  })

  it('brings up the window and IPC before the controllers', async () => {
    const order: string[] = []
    createMainWindow.mockImplementation(() => order.push('window'))
    setupIpcHandlers.mockImplementation(() => order.push('ipc'))
    controllerInit.mockImplementation(async () => {
      order.push('controllers')
    })

    await new Application().init()

    expect(order).toEqual(['window', 'ipc', 'controllers'])
  })

  it('still creates the window and IPC when controller init rejects', async () => {
    controllerInit.mockRejectedValue(new Error('bad config on disk'))

    await expect(new Application().init()).resolves.toBeUndefined()

    expect(createMainWindow).toHaveBeenCalledTimes(1)
    expect(setupIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('rejects when the window itself cannot be created, leaving nothing to report through', async () => {
    createMainWindow.mockImplementation(() => {
      throw new Error('display unavailable')
    })
    controllerInit.mockResolvedValue(undefined)

    await expect(new Application().init()).rejects.toThrow('display unavailable')

    expect(controllerInit).not.toHaveBeenCalled()
  })
})

describe('Application shutdown watchdog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    controllerShutdown.mockReset()
    controllerShutdown.mockResolvedValue(undefined)
  })

  it('gets the log onto disk before it forces the exit', async () => {
    // The line saying why the app went is still buffered in the stream when the watchdog fires.
    const order: string[] = []
    controllerShutdown.mockImplementation(() => new Promise<void>(() => {}))

    const exit = jest.spyOn(process, 'exit').mockImplementation(((): never => {
      order.push('exit')
      return undefined as never
    }) as never)
    setLogSink(() => {})
    jest.useFakeTimers()
    try {
      const application = new Application()
      application.flushLogs = async () => {
        order.push('flush')
      }

      void application.shutdown()
      await jest.advanceTimersByTimeAsync(5000)

      expect(order).toEqual(['flush', 'exit'])
      expect(exit).toHaveBeenCalledWith(0)
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
      exit.mockRestore()
      resetLogConfiguration()
    }
  })
})
