import {
    LightState,
    DmxChannel,
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
    private _immediateBlackoutData:DmxChannel[] = [];

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


        for (let channel = 1; channel <= 255; channel++) {
            this._immediateBlackoutData.push({
                universe: 1,
                channel: channel,
                value: 0
            });
        }
    }

    /**
     * Publishes the provided light states to the DMX senders by 
     * mapping the desired channels to each DMX fixtures channels.
     * (Assuming publishers are enabled of course)
     */
    public publish = async (lights: LightState[]): Promise<void> => {
        this.publishNow(lights);
    };

 


    /**
     * Contains the logic for converting light states
     * to DMX channels and sending them. 
     */
    private async publishNow(lights: LightState[]): Promise<void> {
        const dmxChannels: DmxChannel[] = [];

        for (const light of lights) {
            const dmxLight = this._dmxLightManager.getDmxLight(light.id);
            if (!dmxLight) {
                console.warn(`DMX Light configuration not found for Light ID: ${light.id}`);
                continue;
            }

            const { red: r, green: g, blue: b, intensity: i, pan, tilt } = light.value;
            const channelsInput: { [key: string]: number } = {
                red: r,
                green: g,
                blue: b,
                masterDimmer: i,
                pan: pan ?? dmxLight.config?.panHome ?? 0,
                tilt: tilt ?? dmxLight.config?.tiltHome ??  0,
            };

            let dmxChannelData;
            try {
                dmxChannelData = castToChannelType(dmxLight.fixture, channelsInput);
            } catch (error) {
                console.error(`Error casting channels for Light ID: ${light.id} - ${error}`);
                continue;
            }


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

                // Ensure the DMX value is within [0, 255]
                value = Math.max(0, Math.min(255, value));

                const dmxChannel: DmxChannel = {
                    universe: dmxLight.universe ?? 0,
                    channel: channelNumber,
                    value: value,
                };

                dmxChannels.push(dmxChannel);
            }

            
        }

        if (dmxChannels.length > 0) {
            try {
                this._sender.send(dmxChannels);
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