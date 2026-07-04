import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type Listener = (...args: unknown[]) => void

const mockIpcMain = {
  handle: jest.fn(),
  on: jest.fn(),
}
jest.mock('electron', () => ({ ipcMain: mockIpcMain }))

import { setupCueHandlers } from '../../ipc/cue-handlers'
import { CUE } from '../../../shared/ipcChannels'

describe('CUE_STYLE payload validation (C-27)', () => {
  const setPreference = jest.fn((_key: string, _value: unknown) => Promise.resolve())
  const controllerManager = {
    getConfig: () => ({ setPreference }),
  } as unknown as import('../../controllers/ControllerManager').ControllerManager

  let cueStyleListener: Listener | undefined

  beforeEach(() => {
    jest.clearAllMocks()
    mockIpcMain.on.mockImplementation((...args: unknown[]) => {
      const [channel, listener] = args as [string, Listener]
      if (channel === CUE.CUE_STYLE) cueStyleListener = listener
    })
    setupCueHandlers(mockIpcMain as never, controllerManager)
  })

  it('persists a valid style', () => {
    cueStyleListener!(null, 'complex')
    expect(setPreference).toHaveBeenCalledWith('complex', true)
    cueStyleListener!(null, 'simple')
    expect(setPreference).toHaveBeenCalledWith('complex', false)
  })

  it.each([undefined, null, 42, 'fancy', {}])('ignores an invalid style payload: %s', (bad) => {
    cueStyleListener!(null, bad)
    expect(setPreference).not.toHaveBeenCalled()
  })
})
