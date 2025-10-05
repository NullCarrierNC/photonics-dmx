import { BrowserWindow } from 'electron';
import { BaseSender, SenderError } from './BaseSender';
import { DmxChannel } from '../types';

/**
 * IPC Sender uses Electron IPC's to communicate 
 * with the front end UI. This is used for the 
 * DMX preview so that it accurately reflects 
 * the same DMX data going out over the wire.
 */
export class IpcSender extends BaseSender {
    private window:BrowserWindow
    private enabled:Boolean = false;
    
    
    public constructor (){
        super();
        this.window = BrowserWindow.getAllWindows()[0];
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
    if(this.enabled){
      // Convert buffer to DmxChannel[] format for renderer
      const channelValues: DmxChannel[] = [];
      for (const channelStr in universeBuffer) {
        const channel = parseInt(channelStr, 10);
        channelValues.push({
          universe: 1,
          channel,
          value: universeBuffer[channel]
        });
      }
      this.window.webContents.send("dmxValues", channelValues);
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