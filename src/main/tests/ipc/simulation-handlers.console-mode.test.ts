import { describe, expect, it, jest } from '@jest/globals'
import { setupSimulationHandlers } from '../../ipc/simulation-handlers'

describe('simulation handlers console integration', () => {
  it('registers a console-enter callback that stops simulated motion state', () => {
    const ipcMain = {
      handle: jest.fn(),
      on: jest.fn(),
    } as any
    // The console-enter callback now drives the chain fanout so secondary rigs also get
    // their pan/tilt cleared. Stub the fanout's `yargSchedulePanTiltClear` to verify it.
    const yargSchedulePanTiltClear = jest.fn()
    const controllerManager = {
      setOnConsoleEnter: jest.fn(),
      getChainFanout: jest.fn(() => ({ yargSchedulePanTiltClear })),
    } as any

    setupSimulationHandlers(ipcMain, controllerManager)

    expect(controllerManager.setOnConsoleEnter).toHaveBeenCalledTimes(1)
    const onConsoleEnter = controllerManager.setOnConsoleEnter.mock.calls[0]?.[0] as
      | (() => void)
      | undefined
    expect(typeof onConsoleEnter).toBe('function')
    onConsoleEnter?.()

    expect(yargSchedulePanTiltClear).toHaveBeenCalledTimes(1)
  })
})
