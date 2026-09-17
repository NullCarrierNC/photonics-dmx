/**
 * IPC tests for setupMasterOutputHandlers. The behaviour worth pinning is that every accepted
 * change is followed by a publisher refresh, since that is what makes a blackout reach an idle
 * rig, and that a rejected payload changes nothing.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { setupMasterOutputHandlers, toggleMasterBlackout } from '../../ipc/master-output-handlers'
import { MasterOutputState } from '../../../photonics-dmx/controllers/MasterOutputState'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

const sendToAllWindows = jest.fn()
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: (channel: string, payload: unknown) => sendToAllWindows(channel, payload),
}))

function getHandler(channel: string): (e: unknown, d: unknown) => unknown {
  const calls = (mockIpcMain.handle as jest.Mock).mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (e: unknown, d: unknown) => unknown
    }
  }
  throw new Error(`no handler for ${channel}`)
}

function setup(): { master: MasterOutputState; refreshOutput: jest.Mock } {
  const master = new MasterOutputState()
  const refreshOutput = jest.fn()
  const controllerManager = {
    getMasterOutput: () => master,
    getDmxPublisher: () => ({ refreshOutput }),
  }
  setupMasterOutputHandlers(mockIpcMain as never, controllerManager as never)
  return { master, refreshOutput }
}

describe('master output handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports the current state', async () => {
    const { master } = setup()
    master.setDimmerPercent(60)
    master.setBlackout(true)

    expect(await getHandler(LIGHT.GET_MASTER_OUTPUT)({}, undefined)).toEqual({
      dimmerPercent: 60,
      blackout: true,
      strobeOutputEnabled: true,
    })
  })

  it('applies a partial update and refreshes output', async () => {
    const { master, refreshOutput } = setup()
    master.setDimmerPercent(80)

    const result = await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { blackout: true })

    expect(result).toEqual({
      success: true,
      state: { dimmerPercent: 80, blackout: true, strobeOutputEnabled: true },
    })
    // Omitted fields are untouched, so the fader survives a blackout toggle.
    expect(master.getDimmerPercent()).toBe(80)
    expect(refreshOutput).toHaveBeenCalledTimes(1)
  })

  it('applies all three fields together', async () => {
    const { master, refreshOutput } = setup()

    await getHandler(LIGHT.SET_MASTER_OUTPUT)(
      {},
      { dimmerPercent: 25, blackout: true, strobeOutputEnabled: false },
    )

    expect(master.getSnapshot()).toEqual({
      dimmerPercent: 25,
      blackout: true,
      strobeOutputEnabled: false,
    })
    expect(refreshOutput).toHaveBeenCalledTimes(1)
  })

  it('rejects an out-of-range level without touching state or output', async () => {
    const { master, refreshOutput } = setup()
    master.setDimmerPercent(70)

    const result = await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { dimmerPercent: 300 })

    expect(result).toMatchObject({ success: false })
    expect(master.getDimmerPercent()).toBe(70)
    expect(refreshOutput).not.toHaveBeenCalled()
  })

  it('rejects a payload it does not recognise', async () => {
    const { refreshOutput } = setup()

    expect(await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { nonsense: 1 })).toMatchObject({
      success: false,
    })
    expect(await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, 'blackout')).toMatchObject({
      success: false,
    })
    expect(refreshOutput).not.toHaveBeenCalled()
  })

  it('still applies the change when no publisher has been built yet', async () => {
    const master = new MasterOutputState()
    const controllerManager = {
      getMasterOutput: () => master,
      getDmxPublisher: () => null,
    }
    setupMasterOutputHandlers(mockIpcMain as never, controllerManager as never)

    const result = await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { blackout: true })

    expect(result).toMatchObject({ success: true })
    expect(master.isBlackoutActive()).toBe(true)
  })

  describe('announcing blackout to the other windows', () => {
    it('tells every window when blackout changes', async () => {
      setup()

      await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { blackout: true })

      expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.MASTER_OUTPUT_CHANGED, {
        dimmerPercent: 100,
        blackout: true,
        strobeOutputEnabled: true,
      })
    })

    it('says nothing when the write leaves blackout where it was', async () => {
      const { master } = setup()
      master.setBlackout(true)

      await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { blackout: true })

      expect(sendToAllWindows).not.toHaveBeenCalled()
    })

    it('says nothing about a fader move', async () => {
      setup()

      // The fader writes on every change, so announcing these would be a message per frame of a
      // drag to every window, and no window but the sidebar's own shows the level.
      await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { dimmerPercent: 60 })
      await getHandler(LIGHT.SET_MASTER_OUTPUT)({}, { strobeOutputEnabled: false })

      expect(sendToAllWindows).not.toHaveBeenCalled()
    })
  })

  describe('toggleMasterBlackout', () => {
    it('inverts what main holds and announces it', () => {
      const master = new MasterOutputState()
      const refreshOutput = jest.fn()
      const controllerManager = {
        getMasterOutput: () => master,
        getDmxPublisher: () => ({ refreshOutput }),
      }

      expect(toggleMasterBlackout(controllerManager as never).blackout).toBe(true)
      expect(refreshOutput).toHaveBeenCalledTimes(1)
      expect(toggleMasterBlackout(controllerManager as never).blackout).toBe(false)
      expect(sendToAllWindows).toHaveBeenCalledTimes(2)
    })
  })
})
