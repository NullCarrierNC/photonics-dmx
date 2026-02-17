import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry';
import { DrumNoteType, InstrumentNoteType, getCueTypeFromId } from '../../photonics-dmx/cues/types/cueTypes';
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry';
import { sendToAllWindows } from '../utils/windowUtils';
import { ipcError } from './ipcResult';
import { createMockCueData } from './mockCueData';

/**
 * Set up simulation and test-effect IPC handlers (beat/keyframe/measure/instrument, test effects, system status, available cues).
 */
export function setupSimulationHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle('get-audio-cue-groups', async () => {
    try {
      const registry = AudioCueRegistry.getInstance();
      return registry.getGroupSummaries();
    } catch (error) {
      console.error('Error getting audio cue groups:', error);
      return [];
    }
  });

  ipcMain.handle('get-available-audio-cues', async (_, groupId?: string) => {
    try {
      const registry = AudioCueRegistry.getInstance();
      const targetGroupId =
        groupId ||
        registry.getDefaultGroup() ||
        registry.getEnabledGroups()[0];
      if (!targetGroupId) return [];
      return registry.getCueDetails(targetGroupId);
    } catch (error) {
      console.error('Error getting available audio cues:', error);
      return [];
    }
  });

  ipcMain.handle('get-available-cues', async (_, groupId?: string) => {
    try {
      const registry = YargCueRegistry.getInstance();
      const targetGroupId = groupId || 'default';
      console.log(`Getting cues for group: ${targetGroupId}`);
      const group = registry.getGroup(targetGroupId);
      if (!group) {
        console.error(`Group not found: ${targetGroupId}`);
        return [];
      }
      const availableCueTypes = Array.from(group.cues.keys());
      console.log(`Found ${availableCueTypes.length} cue types in group ${targetGroupId}`);
      if (availableCueTypes.length === 0) {
        console.error(`No cue types found in group: ${targetGroupId}`);
        return [];
      }
      return availableCueTypes.map(cueType => {
        const implementation = group.cues.get(cueType);
        const yargDescription = implementation!.description;
        return {
          id: cueType,
          yargDescription,
          rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values.",
          groupName: group.name
        };
      });
    } catch (error) {
      console.error('Error getting available cues:', error);
      return [];
    }
  });

  ipcMain.handle('start-test-effect', async (_, effectId: string, venueSize?: 'NoVenue' | 'Small' | 'Large', bpm?: number) => {
    console.log(`IPC start-test-effect called with effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}`);
    try {
      if (!controllerManager.getIsInitialized()) {
        console.log("System not initialized, initializing now before testing effect");
        await controllerManager.init();
      }
      controllerManager.startTestEffect(effectId, venueSize, bpm);
      return { success: true };
    } catch (error) {
      console.error('Error starting test effect:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('stop-test-effect', async () => {
    try {
      await controllerManager.stopTestEffect();
      return true;
    } catch (error) {
      console.error('Error stopping test effect:', error);
      return false;
    }
  });

  ipcMain.handle('simulate-beat', async (_, data?: {
    venueSize?: 'NoVenue' | 'Small' | 'Large';
    bpm?: number;
    cueGroup?: string;
    effectId?: string | null;
  }) => {
    if (controllerManager.getLightingController()) {
      if (data) {
        const { venueSize = 'Small', bpm = 120, cueGroup, effectId } = data;
        const mockCueData = createMockCueData({ venueSize, bpm, effectId: effectId ?? undefined, beat: 'Strong', keyframe: 'Unknown' });
        if (cueGroup) {
          try {
            const registry = YargCueRegistry.getInstance();
            registry.setActiveGroups([cueGroup]);
          } catch (error) {
            console.warn(`Failed to set active cue group: ${error}`);
          }
        }
        const cueHandler = controllerManager.getCueHandler();
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId);
          if (cueType) await cueHandler.handleCue(cueType, mockCueData);
        }
        sendToAllWindows('cue-handled', mockCueData);
      }
      controllerManager.getLightingController()?.onBeat();
      return true;
    }
    return false;
  });

  ipcMain.handle('simulate-keyframe', async (_, data?: {
    venueSize?: 'NoVenue' | 'Small' | 'Large';
    bpm?: number;
    cueGroup?: string;
    effectId?: string | null;
  }) => {
    if (controllerManager.getLightingController()) {
      if (data) {
        const { venueSize = 'Small', bpm = 120, cueGroup, effectId } = data;
        const mockCueData = createMockCueData({ venueSize, bpm, effectId: effectId ?? undefined, beat: 'Unknown', keyframe: 'Next' });
        if (cueGroup) {
          try {
            const registry = YargCueRegistry.getInstance();
            registry.setActiveGroups([cueGroup]);
          } catch (error) {
            console.warn(`Failed to set active cue group: ${error}`);
          }
        }
        const cueHandler = controllerManager.getCueHandler();
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId);
          if (cueType) await cueHandler.handleCue(cueType, mockCueData);
        }
        sendToAllWindows('cue-handled', mockCueData);
      }
      controllerManager.getLightingController()?.onKeyframe();
      return true;
    }
    return false;
  });

  ipcMain.handle('simulate-measure', async (_, data?: {
    venueSize?: 'NoVenue' | 'Small' | 'Large';
    bpm?: number;
    cueGroup?: string;
    effectId?: string | null;
  }) => {
    if (controllerManager.getLightingController()) {
      if (data) {
        const { venueSize = 'Small', bpm = 120, cueGroup, effectId } = data;
        const mockCueData = createMockCueData({ venueSize, bpm, effectId: effectId ?? undefined, beat: 'Measure', keyframe: 'Unknown' });
        if (cueGroup) {
          try {
            const registry = YargCueRegistry.getInstance();
            registry.setActiveGroups([cueGroup]);
          } catch (error) {
            console.warn(`Failed to set active cue group: ${error}`);
          }
        }
        const cueHandler = controllerManager.getCueHandler();
        if (cueHandler && effectId) {
          const cueType = getCueTypeFromId(effectId);
          if (cueType) await cueHandler.handleCue(cueType, mockCueData);
        }
        sendToAllWindows('cue-handled', mockCueData);
      }
      controllerManager.getLightingController()?.onMeasure();
      return true;
    }
    return false;
  });

  ipcMain.handle('simulate-instrument-note', async (_, data: {
    instrument: string;
    noteType: string;
    venueSize?: 'NoVenue' | 'Small' | 'Large';
    bpm?: number;
    cueGroup?: string;
    effectId?: string | null;
  }) => {
    try {
      const { instrument, noteType, venueSize = 'Small', bpm = 120, cueGroup, effectId } = data;
      const cueHandler = controllerManager.getCueHandler();
      if (cueHandler) {
        const mockCueData = createMockCueData({ venueSize, bpm, effectId: effectId ?? undefined, beat: 'Unknown', keyframe: 'Unknown' });
        switch (instrument) {
          case 'guitar': {
            const normalizedNote = String(noteType) as InstrumentNoteType;
            mockCueData.guitarNotes = [normalizedNote];
            if ('handleGuitarNote' in cueHandler && typeof cueHandler.handleGuitarNote === 'function') {
              cueHandler.handleGuitarNote(normalizedNote, mockCueData);
            }
            break;
          }
          case 'bass': {
            const normalizedNote = String(noteType) as InstrumentNoteType;
            mockCueData.bassNotes = [normalizedNote];
            if ('handleBassNote' in cueHandler && typeof cueHandler.handleBassNote === 'function') {
              cueHandler.handleBassNote(normalizedNote, mockCueData);
            }
            break;
          }
          case 'keys': {
            const normalizedNote = String(noteType) as InstrumentNoteType;
            mockCueData.keysNotes = [normalizedNote];
            if ('handleKeysNote' in cueHandler && typeof cueHandler.handleKeysNote === 'function') {
              cueHandler.handleKeysNote(normalizedNote, mockCueData);
            }
            break;
          }
          case 'drums': {
            const normalizedNote = String(noteType) as DrumNoteType;
            mockCueData.drumNotes = [normalizedNote];
            if ('handleDrumNote' in cueHandler && typeof cueHandler.handleDrumNote === 'function') {
              cueHandler.handleDrumNote(normalizedNote, mockCueData);
            }
            break;
          }
          default:
            console.warn(`Unknown instrument: ${instrument}`);
            return { success: false, error: `Unknown instrument: ${instrument}` };
        }
        if (cueGroup) {
          try {
            const registry = YargCueRegistry.getInstance();
            registry.setActiveGroups([cueGroup]);
          } catch (error) {
            console.warn(`Failed to set active cue group: ${error}`);
          }
        }
        sendToAllWindows('cue-handled', mockCueData);
        return { success: true };
      }
      return { success: false, error: 'No cue handler available' };
    } catch (error) {
      console.error('Error simulating instrument note:', error);
      return ipcError(error);
    }
  });

  ipcMain.handle('get-system-status', async () => {
    try {
      return {
        success: true,
        isYargEnabled: controllerManager.getIsYargEnabled(),
        isRb3Enabled: controllerManager.getIsRb3Enabled(),
        senderStatus: controllerManager.getSenderStatus()
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return ipcError(error);
    }
  });
}
