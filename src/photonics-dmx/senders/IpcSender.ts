import { BrowserWindow } from 'electron';
import { DmxChannel } from '../types';
import { BaseSender, SenderError } from './BaseSender'

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
   * @param channelValues Array of channel-value pairs.
   */
  public async send(channelValues: DmxChannel[]): Promise<void> {
    if(this.enabled){
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