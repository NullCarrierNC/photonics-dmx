import { BrowserWindow } from 'electron'
import { BaseSender, SenderError } from './BaseSender'
import { sendToAllWindows } from '../../main/utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'

/**
 * IPC Sender uses Electron IPC's to communicate
 * with the front end UI. This is used for the
 * DMX preview so that it accurately reflects
 * the same DMX data going out over the wire.
 */
export class IpcSender extends BaseSender {
  private enabled: boolean = false

  public constructor() {
    super()
    // Window will be determined when sending, not during construction
  }

  public async start(): Promise<void> {
    this.enabled = true
  }

  public async stop(): Promise<void> {
    this.enabled = false
  }

  /**
   * Sends DMX data using Electron IPC protocol.
   * @param universeBuffer Pre-built universe buffer (channel -> value mapping).
   */
  public async send(universeBuffer: Record<number, number>): Promise<void> {
    if (!this.enabled) {
      console.error('IPC Sender: Not enabled')
      return
    }

    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      console.error('IPC Sender: No browser window available when sending')
      return
    }

    sendToAllWindows(RENDERER_RECEIVE.DMX_VALUES, { universeBuffer })
  }

  protected verifySenderStarted(): void {}

  /**
   * Registers an event listener for SacnSenderError events.
   * @param listener The listener function to handle the event.
   */
  public onSendError(_listener: (error: SenderError) => void): void {}

  /**
   * Removes an event listener for SacnSenderError events.
   * @param _listener The listener function to remove.
   */
  public removeSendError(_listener: (error: SenderError) => void): void {}

  public getUniverse(): number {
    // Return -1 to indicate IPC sender handles all universes (for preview purposes)
    return -1
  }
}
