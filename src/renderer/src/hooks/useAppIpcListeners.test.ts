/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react'
import * as ipcHelpers from '../utils/ipcHelpers'
import * as ipcApi from '../ipcApi'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { useAppIpcListeners, type UseAppIpcListenersParams } from './useAppIpcListeners'
import { useYargErrorHandler } from './useYargErrorHandler'

jest.mock('../../../shared/logger', () => {
  const warn = jest.fn()
  const error = jest.fn()
  return {
    createLogger: jest.fn(() => ({
      warn,
      error,
      info: jest.fn(),
      debug: jest.fn(),
    })),
    __testLoggerMocks: { warn, error },
  }
})

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

const loggerMocks = jest.requireMock<{
  __testLoggerMocks: { warn: jest.Mock; error: jest.Mock }
}>('../../../shared/logger').__testLoggerMocks

function minimalParams(over: Partial<UseAppIpcListenersParams> = {}): UseAppIpcListenersParams {
  return {
    setAppVer: jest.fn(),
    setPrefs: jest.fn(),
    setEnttecProComPort: jest.fn(),
    setOpenDmxComPort: jest.fn(),
    setIsLeftMenuCollapsed: jest.fn(),
    handleSenderError: jest.fn(),
    handleYargError: jest.fn(),
    handleRb3Error: jest.fn(),
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

  it('routes YARG_ERROR IPC warnings through the real App handler without disabling YARG', async () => {
    let yargErrorCallback:
      | ((payload: {
          type: string
          message: string
          severity?: 'error' | 'warning'
          datagramVersion?: number
        }) => void)
      | undefined
    const addSpy = jest.spyOn(ipcHelpers, 'addIpcListener').mockImplementation((channel, cb) => {
      if (channel === RENDERER_RECEIVE.YARG_ERROR) {
        yargErrorCallback = cb as typeof yargErrorCallback
      }
    })
    const showToast = jest.fn()
    const setYargEnabled = jest.fn()

    const { result } = renderHook(() =>
      useYargErrorHandler({
        showToast,
        setYargEnabled,
      }),
    )

    renderHook(() => useAppIpcListeners(minimalParams({ handleYargError: result.current })))
    await waitFor(() => expect(yargErrorCallback).toBeDefined())

    yargErrorCallback!({
      type: 'datagram-version-newer',
      severity: 'warning',
      message: 'YARG datagram version 6 is newer than this build supports (5).',
      datagramVersion: 6,
    })

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'YARG warning:',
      expect.objectContaining({
        severity: 'warning',
        datagramVersion: 6,
      }),
    )
    expect(loggerMocks.error).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      'YARG: YARG datagram version 6 is newer than this build supports (5).',
      'warning',
      10000,
    )
    expect(setYargEnabled).not.toHaveBeenCalled()
    addSpy.mockRestore()
  })
})
