export type YargErrorPayload = {
  type: string
  message: string
  autoDisabled?: boolean
  severity?: 'error' | 'warning'
  datagramVersion?: number
}

export type YargErrorPresentation = {
  toastMessage: string
  toastVariant: 'error' | 'warning'
  toastDurationMs: number
  logLevel: 'error' | 'warn'
  shouldDisableYarg: boolean
}

export type YargErrorHandlerDeps = {
  log: {
    warn: (message: string, payload: YargErrorPayload) => void
    error: (message: string, payload: YargErrorPayload) => void
  }
  showToast: (message: string, variant: 'error' | 'warning', durationMs: number) => void
  setYargEnabled: (enabled: boolean) => void
}

export function presentYargError(payload: YargErrorPayload): YargErrorPresentation {
  const isWarning = payload.severity === 'warning'
  return {
    toastMessage: `YARG: ${payload.message}`,
    toastVariant: isWarning ? 'warning' : 'error',
    toastDurationMs: isWarning ? 10000 : 5000,
    logLevel: isWarning ? 'warn' : 'error',
    shouldDisableYarg: payload.autoDisabled === true,
  }
}

export function handleYargErrorPayload(
  payload: YargErrorPayload,
  deps: YargErrorHandlerDeps,
): void {
  const presentation = presentYargError(payload)
  if (presentation.logLevel === 'warn') {
    deps.log.warn('YARG warning:', payload)
  } else {
    deps.log.error('YARG error:', payload)
  }
  if (presentation.shouldDisableYarg) {
    deps.setYargEnabled(false)
  }
  deps.showToast(presentation.toastMessage, presentation.toastVariant, presentation.toastDurationMs)
}
