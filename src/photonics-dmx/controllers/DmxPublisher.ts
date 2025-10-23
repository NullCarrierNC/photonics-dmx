import {
    RGBIO,
    RgbwDmxChannels,
    RgbDmxChannels,
    RgbStrobeDmxChannels,
    StrobeDmxChannels,
    MovingHeadDmxChannels,
} from '../types';
import { DmxLightManager } from './DmxLightManager';
import { castToChannelType } from '../helpers/dmxHelpers';
import { SenderManager } from './SenderManager';
import { LightStateManager } from './sequencer/LightStateManager';

/**
 * Prepares DMX data to be sent to individual lights by
 * mapping the provided channel names to the individual 
 * fixture's channel numbers and setting their values accordingly.
 * These are then passed to a Sender for actual output.
 */
export class DmxPublisher {
    private _dmxLightManager: DmxLightManager;
    private _sender: SenderManager;
    private _lightStateManager: LightStateManager;
    private _immediateBlackoutData: Record<number, number> = {};

    constructor(
        dmxLightManager: DmxLightManager,
        senderManager: SenderManager,
        lightStateManager: LightStateManager
    ) {
        this._dmxLightManager = dmxLightManager;
        this._sender = senderManager;
        this._lightStateManager = lightStateManager;

        this.publish = this.publish.bind(this);
        this._lightStateManager.on('LightStatesUpdated', this.publish);

        // Pre-build blackout buffer
        for (let channel = 1; channel <= 512; channel++) {
            this._immediateBlackoutData[channel] = 0;
        }
    }

    /**
     * Publishes the provided light states to the DMX senders by 
     * mapping the desired channels to each DMX fixture's channels.
     */
    public publish = (lights: Map<string, RGBIO>): void => {
        this.publishNow(lights);
    };

 


    /**
     * Contains the logic for converting light states
     * to DMX channels and sending them.
     * Optimized to build complete universe buffer once before sending.
     */
    private publishNow(lights: Map<string, RGBIO>): void {
        // Build complete universe buffer (channels 0-511)
        const universeBuffer: Record<number, number> = {};
        
        // Sort light IDs for consistent processing order
        const sortedLightIds = Array.from(lights.keys()).sort((a, b) => a.localeCompare(b));

        for (const lightId of sortedLightIds) {
            const lightValue = lights.get(lightId)!;
            const dmxLight = this._dmxLightManager.getDmxLight(lightId);
            if (!dmxLight) {
                console.warn(`DMX Light configuration not found for Light ID: ${lightId}`);
                continue;
            }

            const { red: r, green: g, blue: b, intensity, pan, tilt } = lightValue;
            const channelsInput: { [key: string]: number } = {
                red: r,
                green: g,
                blue: b,
                masterDimmer: intensity,
                pan: pan ?? dmxLight.config?.panHome ?? 0,
                tilt: tilt ?? dmxLight.config?.tiltHome ??  0,
            };

            let dmxChannelData;
            try {
                dmxChannelData = castToChannelType(dmxLight.fixture, channelsInput);
            } catch (error) {
                console.error(`Error casting channels for Light ID: ${lightId} - ${error}`);
                continue;
            }

            // Write directly to universe buffer
            for (const [channelName, channelNumber] of Object.entries(dmxLight.channels)) {
                let value: number = 0;

                switch (channelName) {
                    case 'red':
                        value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels).red;
                        break;
                    case 'green':
                        value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels).green;
                        break;
                    case 'blue':
                        value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels).blue;
                        break;
                    case 'masterDimmer':
                        value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels | StrobeDmxChannels).masterDimmer;
                        break;
                    case 'pan':
                        value = (dmxChannelData as MovingHeadDmxChannels).pan;
                        break;
                    case 'tilt':
                        value = (dmxChannelData as MovingHeadDmxChannels).tilt;
                        break;
                    default:
                        // If the channel is not handled, continue to the next.
                        continue;
                }

                // Ensure the DMX value is within [0, 255] and write directly to buffer
                universeBuffer[channelNumber] = Math.max(0, Math.min(255, value));
            }
        }

        // Send complete universe buffer to all senders at once
        if (Object.keys(universeBuffer).length > 0) {
            try {
                this._sender.send(universeBuffer);
            } catch (error) {
                console.error('Failed to send DMX data:', error);
            }
        }
    }

    public async shutdown(): Promise<void> {
        try {
            // Remove all event listeners
            this._lightStateManager.removeAllListeners();
            
            // Send a blackout signal to all DMX channels
            if (this._sender) {
                try {
                    await this._sender.send(this._immediateBlackoutData);
                    console.log('DmxPublisher sent final blackout signal');
                } catch (err) {
                    console.error('Error sending final blackout signal:', err);
                }
            }
            
            console.log('DmxPublisher has been successfully shut down.');
        } catch (error) {
            console.error('Error during DmxPublisher shutdown:', error);
            throw error;
        }
    }
}