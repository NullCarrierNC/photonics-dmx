import { describe, expect, it, jest } from '@jest/globals'
import { setupSimulationHandlers } from '../../ipc/simulation-handlers'
import { MotionCueSimulator } from '../../controllers/MotionCueSimulator'

describe('simulation handlers console integration', () => {
  it('registers a console-enter callback that stops simulated motion state', () => {
    const ipcMain = {
      handle: jest.fn(),
      on: jest.fn(),
    } as any
    // The console-enter callback stops the motion simulator, which drives the chain fanout so
    // secondary rigs also get their pan/tilt cleared. Stub `yargSchedulePanTiltClear` to verify it.
    const yargSchedulePanTiltClear = jest.fn()
    const getChainFanout = jest.fn(() => ({ yargSchedulePanTiltClear }))
    const motionCueSimulator = new MotionCueSimulator({
      getChainFanout: getChainFanout as never,
    })
    const controllerManager = {
      setOnConsoleEnter: jest.fn(),
      getChainFanout,
      getMotionCueSimulator: () => motionCueSimulator,
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
