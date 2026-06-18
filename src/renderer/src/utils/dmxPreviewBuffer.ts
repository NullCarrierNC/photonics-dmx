import type { DmxValuesPayload } from '../../../shared/ipcTypes'

/**
 * Selects the flat DMX universe buffer to preview from a DMX_VALUES payload.
 * `kind: 'manual'` (console takeover / shutdown blackout) is a loopback of what was just sent on
 * every wire slot, so its flat buffer is returned as-is. `kind: 'rigs'` carries one independent
 * buffer per active rig; this picks the buffer for the given rig id. Returns an empty record when
 * no rig is selected or that rig has no buffer in the payload.
 */
export function selectDmxBufferForRig(
  payload: DmxValuesPayload,
  rigId: string | null,
): Record<number, number> {
  if (payload.kind === 'manual') {
    return payload.buffer ?? {}
  }
  const rigBuffer = rigId != null ? payload.rigBuffers[rigId] : undefined
  return rigBuffer ?? {}
}
