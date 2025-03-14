// src/senders/SacnSender.ts
import { EventEmitter } from 'events';
import { DmxChannel } from '../types';
import { BaseSender, SenderError } from './BaseSender';
import { Sender } from 'sacn';

export class SacnSender extends BaseSender {
  private sender: Sender | undefined;
  private eventEmitter: EventEmitter;

  constructor() {
    super();
    this.eventEmitter = new EventEmitter();
    // process.on('exit', () => this.stop());
  }

  public async start(): Promise<void> {
    this.sender = new Sender({
      universe: 1,
      defaultPacketOptions: {
        sourceName: "un1",
        useRawDmxValues: true,
      },
      minRefreshRate: 30,
      //  useUnicastDestination: "192.168.1.116",
    });
  }

  public async stop(): Promise<void> {
    if (!this.sender) {
      return;
    }

    try {
      const zeroChannels: DmxChannel[] = Array.from({ length: 255 }, (_, index) => ({
        universe: 1,
        channel: index + 1,
        value: 0,
      }));
      await this.send(zeroChannels);
    } catch (error) {
      console.error('Failed to send zero values before stopping:', error);
    } finally {
      this.sender.close();
      this.sender = undefined;
    }
  }

  public async send(channelValues: DmxChannel[]): Promise<void> {
    try {
      this.verifySenderStarted();
      const payloadMap = new Map<number, number>();
      channelValues.forEach(({ channel, value }) => {
        payloadMap.set(channel, value);
      });
      const payload = Object.fromEntries(payloadMap);
      await this.sender!.send({ payload });
    } catch (err) {
      console.error("SacnSender error:", err);
      const errorEvent = new SenderError(err);
      this.eventEmitter.emit('SenderError', errorEvent);
    }
  }

  protected verifySenderStarted(): void {
    if (!this.sender) {
      throw new Error("SacnSender isn't running.");
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener);
  }
}