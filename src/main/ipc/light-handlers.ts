import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { SenderConfig } from '../../photonics-dmx/types';
import { SacnSender } from '../../photonics-dmx/senders/SacnSender';
import { IpcSender } from '../../photonics-dmx/senders/IpcSender';
import { EnttecProSender } from '../../photonics-dmx/senders/EnttecProSender';
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
    const groupNames = registry.getAllGroups();
    
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
  
  // Get active cue groups
  ipcMain.handle('get-active-cue-groups', async () => {
    const registry = CueRegistry.getInstance();
    const activeGroupNames = registry.getActiveGroups();
    
    console.log('Active group names:', activeGroupNames);
    
    // Get details for the active groups
    const activeGroups = activeGroupNames.map(groupName => {
      const group = registry.getGroup(groupName);
      console.log(`Group ${groupName}:`, group ? 'found' : 'not found');
      return {
        name: groupName,
        description: group?.description || `${groupName} cue group`,
        // Get list of cue types defined in this group
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
    
    console.log(`Returning ${activeGroups.length} active groups`);
    return activeGroups;
  });
  
  // Activate a single cue group
  ipcMain.handle('activate-cue-group', async (_, groupName: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupName);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupName}' not found` 
        };
      }
      
      // Activate the group
      const result = registry.activateGroup(groupName);
      if (result) {
        console.log(`Activated cue group: ${groupName}`);
        return { success: true };
      } else {
        console.error(`Failed to activate group '${groupName}'. It may not be enabled.`);
        return { 
          success: false, 
          error: `Failed to activate group '${groupName}'. It may not be enabled.` 
        };
      }
    } catch (error) {
      console.error('Error activating cue group:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Deactivate a single cue group
  ipcMain.handle('deactivate-cue-group', async (_, groupName: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupName);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupName}' not found` 
        };
      }
      
      // Deactivate the group
      const result = registry.deactivateGroup(groupName);
      if (result) {
        console.log(`Deactivated cue group: ${groupName}`);
        return { success: true };
      } else {
        console.error(`Failed to deactivate group '${groupName}'. It may be the default group.`);
        return { 
          success: false, 
          error: `Failed to deactivate group '${groupName}'. It may be the default group.` 
        };
      }
    } catch (error) {
      console.error('Error deactivating cue group:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Enable a single cue group
  ipcMain.handle('enable-cue-group', async (_, groupName: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupName);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupName}' not found` 
        };
      }
      
      // Enable the group
      const result = registry.enableGroup(groupName);
      if (result) {
        console.log(`Enabled cue group: ${groupName}`);
        return { success: true };
      } else {
        console.error(`Failed to enable group '${groupName}'.`);
        return { 
          success: false, 
          error: `Failed to enable group '${groupName}'.` 
        };
      }
    } catch (error) {
      console.error('Error enabling cue group:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Disable a single cue group
  ipcMain.handle('disable-cue-group', async (_, groupName: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupName);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupName}' not found` 
        };
      }
      
      // Disable the group
      const result = registry.disableGroup(groupName);
      if (result) {
        console.log(`Disabled cue group: ${groupName}`);
        return { success: true };
      } else {
        console.error(`Failed to disable group '${groupName}'. It may be the default group.`);
        return { 
          success: false, 
          error: `Failed to disable group '${groupName}'. It may be the default group.` 
        };
      }
    } catch (error) {
      console.error('Error disabling cue group:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Set active cue groups
  ipcMain.handle('set-active-cue-groups', async (_, groupNames: string[]) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Validate that each group exists and is enabled before setting them as active
      const invalidGroups: string[] = [];
      const disabledGroups: string[] = [];
      const validGroups: string[] = [];
      const enabledGroups = registry.getEnabledGroups();
      
      for (const groupName of groupNames) {
        const group = registry.getGroup(groupName);
        if (!group) {
          invalidGroups.push(groupName);
        } else if (!enabledGroups.includes(groupName)) {
          disabledGroups.push(groupName);
        } else {
          validGroups.push(groupName);
        }
      }
      
      if (invalidGroups.length > 0) {
        console.error(`Cannot set active groups: groups not found: ${invalidGroups.join(', ')}`);
      }
      
      if (disabledGroups.length > 0) {
        console.error(`Cannot set active groups: groups not enabled: ${disabledGroups.join(', ')}`);
      }
      
      if (validGroups.length === 0) {
        return { 
          success: false, 
          error: `No valid enabled groups provided. Invalid: ${invalidGroups.join(', ')}, Disabled: ${disabledGroups.join(', ')}`
        };
      }
      
      // Set the valid groups as active
      registry.setActiveGroups(validGroups);
      console.log(`Set active cue groups: ${validGroups.join(', ')}`);
      
      return { 
        success: true,
        activeGroups: validGroups,
        invalidGroups: invalidGroups.length > 0 ? invalidGroups : undefined,
        disabledGroups: disabledGroups.length > 0 ? disabledGroups : undefined
      };
    } catch (error) {
      console.error('Error setting active cue groups:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get the source group for a specific cue
  ipcMain.handle('get-cue-source-group', async (_, cueType: string) => {
    try {
      const registry = CueRegistry.getInstance();
      const activeGroups = registry.getActiveGroups();
      const defaultGroupName = registry.getDefaultGroupName();
      
      // Try active groups first
      for (const groupName of activeGroups) {
        const group = registry.getGroup(groupName);
        if (group?.cues.has(cueType as any)) {
          return {
            groupName: group.name,
            isFromDefault: group.name === defaultGroupName
          };
        }
      }
      
      // Fallback to default group if it exists and wasn't already checked in active groups
      if (defaultGroupName && !activeGroups.includes(defaultGroupName)) {
        const defaultGroup = registry.getGroup(defaultGroupName);
        if (defaultGroup?.cues.has(cueType as any)) {
          return {
            groupName: defaultGroup.name,
            isFromDefault: true // This is fallback behavior
          };
        }
      }
      
      // If not found anywhere
      return {
        groupName: null,
        isFromDefault: false
      };
    } catch (error) {
      console.error('Error getting cue source group:', error);
      return {
        groupName: null,
        isFromDefault: false
      };
    }
  });
} 