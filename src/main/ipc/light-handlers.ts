import { IpcMain, BrowserWindow } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { SenderConfig } from '../../photonics-dmx/types';
import { SacnSender } from '../../photonics-dmx/senders/SacnSender';
import { IpcSender } from '../../photonics-dmx/senders/IpcSender';
import { EnttecProSender } from '../../photonics-dmx/senders/EnttecProSender';
import { ArtNetSender } from '../../photonics-dmx/senders/ArtNetSender';
import { CueRegistry, CueStateUpdate } from '../../photonics-dmx/cues/CueRegistry';
import { CueType } from '../../photonics-dmx/cues/cueTypes';

/**
 * Set up light-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupLightHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Send cue state updates to renderer
  const sendCueStateUpdate = (cueState: CueStateUpdate) => {
    const allWindows = BrowserWindow.getAllWindows();
    const mainWindow = allWindows.length > 0 ? allWindows[0] : null;
    if (mainWindow) {
      const registry = CueRegistry.getInstance();
      const group = registry.getGroup(cueState.groupId);
      const groupName = group ? group.name : null;
      
      const frontendCueState = {
        cueType: cueState.cueType,
        groupId: cueState.groupId,
        groupName,
        isFallback: cueState.isFallback,
        cueStyle: cueState.cueStyle,
        counter: cueState.counter,
        limit: cueState.limit
      };
      
      mainWindow.webContents.send('cue-state-update', frontendCueState);
    }
  };
  
  // Set up the callback with the CueRegistry
  const registry = CueRegistry.getInstance();
  registry.setCueStateUpdateCallback(sendCueStateUpdate);

  // Enable a sender
  ipcMain.on('sender-enable', (_, data: SenderConfig) => {
    try {
      const { sender, port, host, universe, net, subnet, subuni, artNetPort } = data;
      
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
      } else if (sender === 'artnet') {
        // ArtNet configuration
        const artNetHost = host || '127.0.0.1';
        const artNetUniverse = universe !== undefined ? universe : 0;
        const artNetNet = net !== undefined ? net : 0;
        const artNetSubnet = subnet !== undefined ? subnet : 0;
        const artNetSubuni = subuni !== undefined ? subuni : 0;
        const artNetPortValue = artNetPort !== undefined ? artNetPort : 6454;
        
        const artNetSender = new ArtNetSender(artNetHost, {
          universe: artNetUniverse,
          net: artNetNet,
          subnet: artNetSubnet,
          subuni: artNetSubuni,
          port: artNetPortValue
        });
        senderManager.enableSender(sender, artNetSender);
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
  ipcMain.handle('get-available-cues', async (_, groupId?: string) => {
    try {
      // Get the registry instance
      const registry = CueRegistry.getInstance();
      
      // Default to 'default' if no group ID is provided
      const targetGroupId = groupId || 'default';
      
      console.log(`Getting cues for group: ${targetGroupId}`);
      
       const group = registry.getGroup(targetGroupId);
      if (!group) {
        console.error(`Group not found: ${targetGroupId}`);
        return []; // No group found, return empty array
      }
      
      // Get only the cue types that are actually defined in this group
      const availableCueTypes = Array.from(group.cues.keys());
      console.log(`Found ${availableCueTypes.length} cue types in group ${targetGroupId}`);
      
      if (availableCueTypes.length === 0) {
        console.error(`No cue types found in group: ${targetGroupId}`);
        return [];
      }
      
      // Create descriptions based on the implementations
      const cueDescriptions = availableCueTypes.map(cueType => {
        // Get the implementation for this cue
        const implementation = group.cues.get(cueType);
        
        // Use the implementation's description (required property)
        const yargDescription = implementation!.description;
        
        return {
          id: cueType,
          yargDescription: yargDescription,
          rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values.",
          groupName: group.name 
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
    const groupIds = registry.getAllGroups();
    
    // Get descriptions for each group
    const groupInfo = groupIds.map(groupId => {
      const group = registry.getGroup(groupId);
      return {
        id: groupId,
        name: group!.name,
        description: group!.description,
        // Get list of cue types defined in this group
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
    
    return groupInfo;
  });
  
  // Get active cue groups
  ipcMain.handle('get-active-cue-groups', async () => {
    const registry = CueRegistry.getInstance();
    const activeGroupIds = registry.getActiveGroups();
    
    console.log('Active group IDs:', activeGroupIds);
    
    // Get details for the active groups
    const activeGroups = activeGroupIds.map(groupId => {
      const group = registry.getGroup(groupId);
      console.log(`Group ${groupId}:`, group ? 'found' : 'not found');
      return {
        id: groupId,
        name: group!.name,
        description: group!.description,
        // Get list of cue types defined in this group
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
    
    console.log(`Returning ${activeGroups.length} active groups`);
    return activeGroups;
  });
  
  // Activate a single cue group
  ipcMain.handle('activate-cue-group', async (_, groupId: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupId);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupId}' not found` 
        };
      }
      
      // Activate the group
      const result = registry.activateGroup(groupId);
      if (result) {
        console.log(`Activated cue group: ${group.name}`);
        return { success: true };
      } else {
        console.error(`Failed to activate group '${group.name}'. It may not be enabled.`);
        return { 
          success: false, 
          error: `Failed to activate group '${group.name}'. It may not be enabled.` 
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
  ipcMain.handle('deactivate-cue-group', async (_, groupId: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupId);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupId}' not found` 
        };
      }
      
      // Deactivate the group
      const result = registry.deactivateGroup(groupId);
      if (result) {
        console.log(`Deactivated cue group: ${group.name}`);
        return { success: true };
      } else {
        console.error(`Failed to deactivate group '${group.name}'. It may be the default group.`);
        return { 
          success: false, 
          error: `Failed to deactivate group '${group.name}'. It may be the default group.` 
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
  ipcMain.handle('enable-cue-group', async (_, groupId: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupId);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupId}' not found` 
        };
      }
      
      // Enable the group
      const result = registry.enableGroup(groupId);
      if (result) {
        console.log(`Enabled cue group: ${group.name}`);
        return { success: true };
      } else {
        console.error(`Failed to enable group '${group.name}'.`);
        return { 
          success: false, 
          error: `Failed to enable group '${group.name}'.` 
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
  ipcMain.handle('disable-cue-group', async (_, groupId: string) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Check if the group exists
      const group = registry.getGroup(groupId);
      if (!group) {
        return { 
          success: false, 
          error: `Group '${groupId}' not found` 
        };
      }
      
      // Disable the group
      const result = registry.disableGroup(groupId);
      if (result) {
        console.log(`Disabled cue group: ${group.name}`);
        return { success: true };
      } else {
        console.error(`Failed to disable group '${group.name}'. It may be the default group.`);
        return { 
          success: false, 
          error: `Failed to disable group '${group.name}'. It may be the default group.` 
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
  ipcMain.handle('set-active-cue-groups', async (_, groupIds: string[]) => {
    try {
      const registry = CueRegistry.getInstance();
      
      // Validate that each group exists and is enabled before setting them as active
      const invalidGroups: string[] = [];
      const disabledGroups: string[] = [];
      const validGroupIds: string[] = [];
      const enabledGroupIds = registry.getEnabledGroups();
      
      for (const groupId of groupIds) {
        if (!registry.getGroup(groupId)) {
          invalidGroups.push(groupId);
        } else if (!enabledGroupIds.includes(groupId)) {
          disabledGroups.push(groupId);
        } else {
          validGroupIds.push(groupId);
        }
      }
      
      if (invalidGroups.length > 0) {
        console.error(`Cannot set active groups: groups not found: ${invalidGroups.join(', ')}`);
      }
      
      if (disabledGroups.length > 0) {
        console.error(`Cannot set active groups: groups not enabled: ${disabledGroups.join(', ')}`);
      }
      
      if (validGroupIds.length === 0) {
        return { 
          success: false, 
          error: `No valid groups provided. Invalid: ${invalidGroups.join(', ')}, Disabled: ${disabledGroups.join(', ')}`
        };
      }
      
      // Set the valid group IDs as active
      registry.setActiveGroups(validGroupIds);
      console.log(`Set active cue groups: ${validGroupIds.join(', ')}`);
      
      return { 
        success: true,
        activeGroups: validGroupIds,
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
      const cueState = registry.getCueState(cueType as CueType);
      
      if (cueState) {
        return { 
          success: true,
          cueType: cueState.cueType,
          groupId: cueState.groupId,
          cueStyle: cueState.cueStyle,
          isFallback: cueState.isFallback,
          counter: cueState.counter,
          limit: cueState.limit
        };
      } else {
        return { 
          success: false, 
          error: `No state found for cue: ${cueType}` 
        };
      }
    } catch (error) {
      console.error('Error getting cue source group:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Set the cue consistency window
  ipcMain.handle('set-cue-consistency-window', async (_, windowMs: number) => {
    try {
      // Update the configuration
      controllerManager.getConfig().setCueConsistencyWindow(windowMs);
      
      // Also update the CueRegistry to apply the change immediately
      const registry = CueRegistry.getInstance();
      registry.setCueConsistencyWindow(windowMs);
      
      return { 
        success: true, 
        windowMs: windowMs 
      };
    } catch (error) {
      console.error('Error setting cue consistency window:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // Get the cue consistency window
  ipcMain.handle('get-cue-consistency-window', async () => {
    try {
      const windowMs = controllerManager.getConfig().getCueConsistencyWindow();
      return { 
        success: true, 
        windowMs: windowMs 
      };
    } catch (error) {
      console.error('Error getting cue consistency window:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // Get the current consistency status
  ipcMain.handle('get-consistency-status', async () => {
    try {
      const registry = CueRegistry.getInstance();
      const status = registry.getConsistencyStatus();
      
      return { 
        success: true,
        status
      };
    } catch (error) {
      console.error('Error getting consistency status:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
} 