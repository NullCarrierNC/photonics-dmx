import type { RuntimeBroadcaster } from '../runtime/broadcaster'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { DmxValuesPayload } from '../../shared/ipcTypes'
import { createLogger } from '../../shared/logger'
const log = createLogger('IpcSender')

/**
 * IPC Sender forwards the publisher's per-rig (cue mode) or manual (console mode) DMX state
 * to the renderer over Electron IPC for the in-app preview.
 *
 * Note this does not extend {@link BaseSender}: wire senders share a flat `(buffer)` contract
 * and a network/USB error model that doesn't apply to a local Electron IPC pipe. The publisher
 * dispatches to wire senders and IPC through distinct {@link SenderManager} paths.
 *
 * The payload is per-rig in cue mode specifically so the preview can show a single rig's
 * universe without collisions from other rigs that happen to share channel numbers — the
 * common case when rigs target different wire outputs (separate physical universes).
 */
export class IpcSender {
  private enabled: boolean = false

  public constructor(
    private readonly broadcaster: RuntimeBroadcaster,
    private readonly hasReceivers: () => boolean,
  ) {}

  public async start(): Promise<void> {
    this.enabled = true
  }

  public async stop(): Promise<void> {
    this.enabled = false
  }

  /**
   * Forwards a {@link DmxValuesPayload} to the renderer. Tagged union: `kind: 'rigs'` carries
   * one channel buffer per active rig (renderer picks by preview rig id); `kind: 'manual'`
   * carries a single flat buffer (DMX Console takeover / shutdown blackout).
   */
  public async send(payload: DmxValuesPayload): Promise<void> {
    if (!this.enabled) {
      log.error('IPC Sender: Not enabled')
      return
    }

    if (!this.hasReceivers()) {
      log.error('IPC Sender: No browser window available when sending')
      return
    }

    this.broadcaster.emit(RENDERER_RECEIVE.DMX_VALUES, payload)
  }
}
