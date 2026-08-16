import { useCallback } from 'react'
import { createLogger } from '../../../shared/logger'
import { handleYargErrorPayload, type YargErrorPayload } from '../yargErrorPresentation'

const log = createLogger('App')

export function useYargErrorHandler(deps: {
  showToast: (message: string, variant: 'error' | 'warning', durationMs: number) => void
  setYargEnabled: (enabled: boolean) => void
}): (payload: YargErrorPayload) => void {
  const { showToast, setYargEnabled } = deps

  return useCallback(
    (payload: YargErrorPayload): void => {
      handleYargErrorPayload(payload, { log, showToast, setYargEnabled })
    },
    [showToast, setYargEnabled],
  )
}
