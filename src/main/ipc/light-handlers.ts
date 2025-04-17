import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { SenderConfig } from '../../photonics-dmx/types';
import { SacnSender } from '../../photonics-dmx/senders/SacnSender';
import { IpcSender } from '../../photonics-dmx/senders/IpcSender';
import { EnttecProSender } from '../../photonics-dmx/senders/EnttecProSender';
import { CueType } from '../../photonics-dmx/cues/cueTypes';
import { CueRegistry } from '../../photonics-dmx/cues/CueRegistry';

/**
 * Set up light-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupLightHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Enable a sender
  ipcMain.on('sender-enable', (_, data: SenderConfig) => {
    try {
      const { sender, port } = data;
      
      if (!sender) {
        console.error('Sender name is required');
        return;
      }
      
      const senderManager = controllerManager.getSenderManager();
      
      // Create appropriate sender instance based on name
      if (sender === 'sacn') {
        const sacnSender = new SacnSender();
        senderManager.enableSender(sender, sacnSender);
      } else if (sender === 'ipc') {
        const ipcSender = new IpcSender();
        senderManager.enableSender(sender, ipcSender);
      } else if (sender === 'enttecpro') {
        // Only pass port if it's defined, otherwise use a default value
        if (!port) {
          console.error('Port is required for EnttecPro sender');
          return;
        }
        const enttecProSender = new EnttecProSender(port);
        senderManager.enableSender(sender, enttecProSender);
      }
    } catch (error) {
      console.error('Error enabling sender:', error);
    }
  });

  // Disable a sender
  ipcMain.on('sender-disable', (_, data: { sender: string }) => {
    try {
      const { sender } = data;
      
      if (!sender) {
        console.error('Sender name is required');
        return;
      }
      
      controllerManager.getSenderManager().disableSender(sender);
    } catch (error) {
      console.error('Error disabling sender:', error);
    }
  });

  // Get available light effects
  ipcMain.handle('get-available-cues', async (_, groupName?: string) => {
    try {
      // Get the registry instance
      const registry = CueRegistry.getInstance();
      
      // Default to 'default' if no group name is provided
      const targetGroupName = groupName || 'default';
      
      console.log(`Getting cues for group: ${targetGroupName}`);
      
      // Set this group as active for this operation
      registry.setActiveGroups([targetGroupName]);
      
      // Get the group directly to check which cues are available
      const group = registry.getGroup(targetGroupName);
      if (!group) {
        console.error(`Group not found: ${targetGroupName}`);
        return []; // No group found, return empty array
      }
      
      // Get only the cue types that are actually defined in this group
      const availableCueTypes = Array.from(group.cues.keys());
      console.log(`Found ${availableCueTypes.length} cue types in group ${targetGroupName}`);
      
      if (availableCueTypes.length === 0) {
        console.error(`No cue types found in group: ${targetGroupName}`);
        return [];
      }
      
      // Create descriptions based on the implementations
      const cueDescriptions = availableCueTypes.map(cueType => {
        // Get the implementation for this cue
        const implementation = group.cues.get(cueType);
        
        // Use only the implementation's description
        const yargDescription = implementation?.description || 
                              "No description available";
        
        return {
          id: cueType,
          yargDescription: yargDescription,
          rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values.",
          groupName: targetGroupName
        };
      });
      
      console.log(`Returning ${cueDescriptions.length} cue descriptions`);
      return cueDescriptions;
    } catch (error) {
      console.error('Error getting available cues:', error);
      return [];
    }
  });

  // Start a test effect
  ipcMain.handle('start-test-effect', async (_, effectId: string) => {
    try {
      // Check if the controller is initialized
      if (!controllerManager.getIsInitialized()) {
        console.log("System not initialized, initializing now before testing effect");
        await controllerManager.init();
      }
      
      // Use the controller manager to start the test effect
      controllerManager.startTestEffect(effectId);
      return { success: true };
    } catch (error) {
      console.error('Error starting test effect:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Stop a test effect
  ipcMain.handle('stop-test-effect', async () => {
    try {
      // Use the controller manager to stop the test effect
      await controllerManager.stopTestEffect();
      return true;
    } catch (error) {
      console.error('Error stopping test effect:', error);
      return false;
    }
  });

  // Simulate a beat
  ipcMain.handle('simulate-beat', async () => {
    if (controllerManager.getLightingController()) {
      controllerManager.getLightingController()?.onBeat();
      return true;
    }
    return false;
  });

  // Simulate a keyframe
  ipcMain.handle('simulate-keyframe', async () => {
    if (controllerManager.getLightingController()) {
      controllerManager.getLightingController()?.onKeyframe();
      return true;
    }
    return false;
  });

  // Simulate a measure
  ipcMain.handle('simulate-measure', async () => {
    if (controllerManager.getLightingController()) {
      controllerManager.getLightingController()?.onMeasure();
      return true;
    }
    return false;
  });

  // Get the system status
  ipcMain.handle('get-system-status', async () => {
    try {
      return {
        success: true,
        isInitialized: controllerManager.getIsInitialized(),
        isYargEnabled: controllerManager.getIsYargEnabled(),
        isRb3Enabled: controllerManager.getIsRb3Enabled(),
        hasCueHandler: !!controllerManager.getCueHandler(),
        hasLightingSystem: !!controllerManager.getLightingController()
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get available cue groups from registry
  ipcMain.handle('get-cue-groups', async () => {
    const registry = CueRegistry.getInstance();
    const groupNames = registry.getRegisteredGroups();
    
    // Get descriptions for each group
    const groupInfo = groupNames.map(groupName => {
      const group = registry.getGroup(groupName);
      return {
        name: groupName,
        description: group?.description || `${groupName} cue group`,
        // Get list of cue types defined in this group
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
    
    return groupInfo;
  });
  
  // Set the active cue group
  ipcMain.handle('set-active-cue-group', async (_, groupName: string) => {
    const registry = CueRegistry.getInstance();
    registry.setActiveGroups([groupName]);
    return { success: true };
  });
} 