import { BrowserWindow } from 'electron';
import { BaseSender, SenderError } from './BaseSender';

/**
 * IPC Sender uses Electron IPC's to communicate 
 * with the front end UI. This is used for the 
 * DMX preview so that it accurately reflects 
 * the same DMX data going out over the wire.
 */
export class IpcSender extends BaseSender {
    private enabled:Boolean = false;

    public constructor (){
        super();
        // Window will be determined when sending, not during construction
    }

  public async start(): Promise<void> {
    this.enabled = true;
  }

  public async stop(): Promise<void> {
   this.enabled = false;
  }

  /**
   * Sends DMX data using Electron IPC protocol.
   * @param universeBuffer Pre-built universe buffer (channel -> value mapping).
   */
  public async send(universeBuffer: Record<number, number>): Promise<void> {
    if(!this.enabled) {
      console.error('IPC Sender: Not enabled');
      return;
    }

    // Get the window when sending to ensure we have the current active window
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if(window){
      // Send buffer directly to renderer
      window.webContents.send("dmxValues", universeBuffer);
    } else {
      console.error('IPC Sender: No browser window available when sending');
    }
  }


  protected verifySenderStarted(): void {
    
  }

    /**
     * Registers an event listener for SacnSenderError events.
     * @param listener The listener function to handle the event.
     */
    public onSendError(_listener: (error: SenderError) => void): void {
      
    }
  
    /**
     * Removes an event listener for SacnSenderError events.
     * @param _listener The listener function to remove.
     */
    public removeSendError(_listener: (error: SenderError) => void): void {

    }


}