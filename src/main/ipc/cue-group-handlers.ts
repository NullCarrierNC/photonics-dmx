import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry';
import { CueType } from '../../photonics-dmx/cues/types/cueTypes';
import { ipcError } from './ipcResult';

/**
 * Set up cue-group and consistency IPC handlers.
 */
export function setupCueGroupHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle('get-cue-groups', async () => {
    const registry = YargCueRegistry.getInstance();
    const groupIds = registry.getAllGroups();
    return groupIds.map(groupId => {
      const group = registry.getGroup(groupId);
      return {
        id: groupId,
        name: group!.name,
        description: group!.description,
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
  });

  ipcMain.handle('get-active-cue-groups', async () => {
    const registry = YargCueRegistry.getInstance();
    const activeGroupIds = registry.getActiveGroups();
    console.log('Active group IDs:', activeGroupIds);
    return activeGroupIds.map(groupId => {
      const group = registry.getGroup(groupId);
      console.log(`Group ${groupId}:`, group ? 'found' : 'not found');
      return {
        id: groupId,
        name: group!.name,
        description: group!.description,
        cueTypes: group ? Array.from(group.cues.keys()) : []
      };
    });
  });

  ipcMain.handle('activate-cue-group', async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
      const group = registry.getGroup(groupId);
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` };
      }
      const result = registry.activateGroup(groupId);
      if (result) {
        console.log(`Activated cue group: ${group.name}`);
        return { success: true };
      }
      console.error(`Failed to activate group '${group.name}'. It may not be enabled.`);
      return { success: false, error: `Failed to activate group '${group.name}'. It may not be enabled.` };
    } catch (error) {
      console.error('Error activating cue group:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('deactivate-cue-group', async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
      const group = registry.getGroup(groupId);
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` };
      }
      const result = registry.deactivateGroup(groupId);
      if (result) {
        console.log(`Deactivated cue group: ${group.name}`);
        return { success: true };
      }
      console.error(`Failed to deactivate group '${group.name}'. It may be the default group.`);
      return { success: false, error: `Failed to deactivate group '${group.name}'. It may be the default group.` };
    } catch (error) {
      console.error('Error deactivating cue group:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('enable-cue-group', async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
      const group = registry.getGroup(groupId);
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` };
      }
      const result = registry.enableGroup(groupId);
      if (result) {
        console.log(`Enabled cue group: ${group.name}`);
        return { success: true };
      }
      console.error(`Failed to enable group '${group.name}'.`);
      return { success: false, error: `Failed to enable group '${group.name}'.` };
    } catch (error) {
      console.error('Error enabling cue group:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('disable-cue-group', async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
      const group = registry.getGroup(groupId);
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` };
      }
      const result = registry.disableGroup(groupId);
      if (result) {
        console.log(`Disabled cue group: ${group.name}`);
        return { success: true };
      }
      console.error(`Failed to disable group '${group.name}'. It may be the default group.`);
      return { success: false, error: `Failed to disable group '${group.name}'. It may be the default group.` };
    } catch (error) {
      console.error('Error disabling cue group:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('set-active-cue-groups', async (_, groupIds: string[]) => {
    try {
      const registry = YargCueRegistry.getInstance();
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
      return ipcError(error);
    }
  });

  ipcMain.handle('get-cue-source-group', async (_, cueType: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
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
      }
      return { success: false, error: `No state found for cue: ${cueType}` };
    } catch (error) {
      console.error('Error getting cue source group:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('set-cue-consistency-window', async (_, windowMs: number) => {
    try {
      controllerManager.getConfig().setCueConsistencyWindow(windowMs);
      const registry = YargCueRegistry.getInstance();
      registry.setCueConsistencyWindow(windowMs);
      return { success: true, windowMs };
    } catch (error) {
      console.error('Error setting cue consistency window:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('get-cue-consistency-window', async () => {
    try {
      const windowMs = controllerManager.getConfig().getCueConsistencyWindow();
      return { success: true, windowMs };
    } catch (error) {
      console.error('Error getting cue consistency window:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('get-consistency-status', async () => {
    try {
      const registry = YargCueRegistry.getInstance();
      const status = registry.getConsistencyStatus();
      return { success: true, status };
    } catch (error) {
      console.error('Error getting consistency status:', error);
      return ipcError(error);
    }
  });
}
