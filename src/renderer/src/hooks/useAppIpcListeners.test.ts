/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react'
import * as ipcHelpers from '../utils/ipcHelpers'
import * as ipcApi from '../ipcApi'
import { useAppIpcListeners, type UseAppIpcListenersParams } from './useAppIpcListeners'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getAppVersion: jest.fn().mockResolvedValue('9.9.9'),
    getPrefs: jest.fn().mockResolvedValue({}),
    getValidationErrors: jest.fn().mockResolvedValue([]),
    getCorruptRecoveryEvents: jest.fn().mockResolvedValue({ files: [] }),
    saveLightLayout: jest.fn().mockResolvedValue(undefined),
  }
})

const getAppVersion = jest.mocked(ipcApi.getAppVersion)
const getPrefs = jest.mocked(ipcApi.getPrefs)
const getValidationErrors = jest.mocked(ipcApi.getValidationErrors)
const getCorruptRecoveryEvents = jest.mocked(ipcApi.getCorruptRecoveryEvents)
const saveLightLayout = jest.mocked(ipcApi.saveLightLayout)

function minimalParams(over: Partial<UseAppIpcListenersParams> = {}): UseAppIpcListenersParams {
  return {
    setAppVer: jest.fn(),
    setPrefs: jest.fn(),
    setEnttecProComPort: jest.fn(),
    setOpenDmxComPort: jest.fn(),
    setIsLeftMenuCollapsed: jest.fn(),
    handleSenderError: jest.fn(),
    handleYargError: jest.fn(),
    handleNodeCueRuntimeError: jest.fn(),
    handleSenderNetworkError: jest.fn(),
    handleCueStateUpdate: jest.fn(),
    handleSenderStartFailure: jest.fn(),
    handleCueValidationErrors: jest.fn(),
    handleConfigCorruptRecovered: jest.fn(),
    handleAudioEnable: jest.fn(),
    handleAudioDisable: jest.fn(),
    handleAudioConfigUpdate: jest.fn(),
    ...over,
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'api', {
    value: {
      receive: jest.fn().mockReturnValue(jest.fn()),
    },
    configurable: true,
  })
})

describe('useAppIpcListeners', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not call saveLightLayout (layout is persisted from LightsLayout / explicit save only)', async () => {
    renderHook(() => useAppIpcListeners(minimalParams()))
    await waitFor(() => expect(getPrefs).toHaveBeenCalled())
    expect(saveLightLayout).not.toHaveBeenCalled()
  })

  it('runs initial fetches once; rerender does not trigger additional fetches', async () => {
    const { rerender } = renderHook((p: UseAppIpcListenersParams) => useAppIpcListeners(p), {
      initialProps: minimalParams(),
    })
    await waitFor(() => expect(getAppVersion).toHaveBeenCalled())
    const v0 = getAppVersion.mock.calls.length
    const p0 = getPrefs.mock.calls.length
    const e0 = getValidationErrors.mock.calls.length
    const c0 = getCorruptRecoveryEvents.mock.calls.length

    rerender(minimalParams())
    expect(getAppVersion.mock.calls.length).toBe(v0)
    expect(getPrefs.mock.calls.length).toBe(p0)
    expect(getValidationErrors.mock.calls.length).toBe(e0)
    expect(getCorruptRecoveryEvents.mock.calls.length).toBe(c0)
  })

  it('does not register additional IPC subscribers on rerender (stable listener wiring)', async () => {
    const addSpy = jest.spyOn(ipcHelpers, 'addIpcListener')
    const { rerender } = renderHook((p: UseAppIpcListenersParams) => useAppIpcListeners(p), {
      initialProps: minimalParams(),
    })
    await waitFor(() => expect(addSpy).toHaveBeenCalled())
    const n0 = addSpy.mock.calls.length
    rerender(minimalParams())
    expect(addSpy.mock.calls.length).toBe(n0)
  })
})
