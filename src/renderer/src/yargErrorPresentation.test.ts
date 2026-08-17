import { describe, expect, it, jest } from '@jest/globals'
import { handleYargErrorPayload, presentYargError } from './yargErrorPresentation'

describe('presentYargError', () => {
  it('uses amber warning toast timing and does not disable YARG for newer-version warnings', () => {
    const presentation = presentYargError({
      type: 'datagram-version-newer',
      severity: 'warning',
      message: 'YARG datagram version 6 is newer than this build supports (5).',
      datagramVersion: 6,
    })

    expect(presentation).toEqual({
      toastMessage: 'YARG: YARG datagram version 6 is newer than this build supports (5).',
      toastVariant: 'warning',
      toastDurationMs: 10000,
      logLevel: 'warn',
      shouldDisableYarg: false,
    })
  })

  it('uses error toast timing and disables YARG when autoDisabled is set', () => {
    const presentation = presentYargError({
      type: 'port-in-use',
      message: 'YARG network port is already in use.',
      autoDisabled: true,
    })

    expect(presentation).toEqual({
      toastMessage: 'YARG: YARG network port is already in use.',
      toastVariant: 'error',
      toastDurationMs: 5000,
      logLevel: 'error',
      shouldDisableYarg: true,
    })
  })
})

describe('handleYargErrorPayload', () => {
  it('logs a warning, shows a 10 second warning toast, and does not disable YARG', () => {
    const showToast = jest.fn()
    const setYargEnabled = jest.fn()
    const log = { warn: jest.fn(), error: jest.fn() }
    const payload = {
      type: 'datagram-version-newer',
      severity: 'warning' as const,
      message: 'YARG datagram version 6 is newer than this build supports (5).',
      datagramVersion: 6,
    }

    handleYargErrorPayload(payload, { log, showToast, setYargEnabled })

    expect(log.warn).toHaveBeenCalledWith('YARG warning:', payload)
    expect(log.error).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      'YARG: YARG datagram version 6 is newer than this build supports (5).',
      'warning',
      10000,
    )
    expect(setYargEnabled).not.toHaveBeenCalled()
  })

  it('logs an error, shows a 5 second error toast, and disables YARG when autoDisabled is set', () => {
    const showToast = jest.fn()
    const setYargEnabled = jest.fn()
    const log = { warn: jest.fn(), error: jest.fn() }
    const payload = {
      type: 'port-in-use',
      message: 'YARG network port is already in use.',
      autoDisabled: true,
    }

    handleYargErrorPayload(payload, { log, showToast, setYargEnabled })

    expect(log.error).toHaveBeenCalledWith('YARG error:', payload)
    expect(log.warn).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      'YARG: YARG network port is already in use.',
      'error',
      5000,
    )
    expect(setYargEnabled).toHaveBeenCalledWith(false)
  })
})
