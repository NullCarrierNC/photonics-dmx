import {
    RGBIO,
    RgbwDmxChannels,
    RgbDmxChannels,
    RgbStrobeDmxChannels,
    StrobeDmxChannels,
    MovingHeadDmxChannels,
    DmxRig,
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
    private _rigManagers: Map<string, { manager: DmxLightManager; rig: DmxRig }> = new Map();
    private _sender: SenderManager;
    private _lightStateManager: LightStateManager;
    private _immediateBlackoutData: Record<number, number> = {};

    constructor(
        senderManager: SenderManager,
        lightStateManager: LightStateManager
    ) {
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
     * Updates the active rigs being published.
     * Only active rigs (where active === true) will be included.
     * @param activeRigs Array of active DMX rigs
     */
    public updateActiveRigs(activeRigs: DmxRig[]): void {
        // Filter to only active rigs
        const rigsToPublish = activeRigs.filter(rig => rig.active === true);
        
        // Remove managers for rigs that are no longer active or have been deleted
        const currentRigIds = new Set(rigsToPublish.map(rig => rig.id));
        for (const [rigId] of this._rigManagers) {
            if (!currentRigIds.has(rigId)) {
                this._rigManagers.delete(rigId);
            }
        }
        
        // Add or update managers for active rigs
        for (const rig of rigsToPublish) {
            const existing = this._rigManagers.get(rig.id);
            if (existing) {
                // Update existing manager if config changed
                if (existing.rig.config !== rig.config) {
                    existing.manager.setConfiguration(rig.config);
                    existing.rig = rig;
                } else {
                    // Just update rig metadata (universe, active, name)
                    existing.rig = rig;
                }
            } else {
                // Create new manager for this rig
                const manager = new DmxLightManager(rig.config);
                this._rigManagers.set(rig.id, { manager, rig });
            }
        }
    }

    /**
     * Contains the logic for converting light states
     * to DMX channels and sending them.
     * Only processes lights from active rigs and sends to their respective universes.
     */
    private publishNow(lights: Map<string, RGBIO>): void {
        // Process each active rig separately
        for (const [rigId, { manager, rig }] of this._rigManagers) {
            // Only process active rigs
            if (!rig.active) {
                continue;
            }

            // Build universe buffer for this rig
            const universeBuffer: Record<number, number> = {};
            
            // Sort light IDs for consistent processing order
            const sortedLightIds = Array.from(lights.keys()).sort((a, b) => a.localeCompare(b));

            for (const lightId of sortedLightIds) {
                const lightValue = lights.get(lightId)!;
                const dmxLight = manager.getDmxLight(lightId);
                if (!dmxLight) {
                    // Light doesn't belong to this rig, skip it
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

            // Send universe buffer to senders configured for this rig's universe
            if (Object.keys(universeBuffer).length > 0) {
                try {
                    this._sender.send(universeBuffer, rig.universe);
                } catch (error) {
                    console.error(`Failed to send DMX data for rig ${rig.name} (universe ${rig.universe}):`, error);
                }
            }
        }
    }

    public async shutdown(): Promise<void> {
        try {
            // Remove all event listeners
            this._lightStateManager.removeAllListeners();
            
            // Send a blackout signal to all DMX channels for each active rig's universe
            if (this._sender) {
                try {
                    // Get unique universes from active rigs
                    const universes = new Set<number>();
                    for (const { rig } of this._rigManagers.values()) {
                        if (rig.active) {
                            universes.add(rig.universe);
                        }
                    }
                    
                    // Send blackout to each universe
                    for (const universe of universes) {
                        await this._sender.send(this._immediateBlackoutData, universe);
                    }
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