import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const createMainWindow = jest.fn()
const setControllerManager = jest.fn()
const setupIpcHandlers = jest.fn()
const setupMenu = jest.fn()
const controllerInit = jest.fn<() => Promise<void>>()

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
    shutdown: jest.fn(async () => {}),
  })),
}))

jest.mock('../ipc/index', () => ({ setupIpcHandlers }))
jest.mock('../menu', () => ({ setupMenu }))

import { Application } from '../application'

describe('Application init', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    controllerInit.mockReset()
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
