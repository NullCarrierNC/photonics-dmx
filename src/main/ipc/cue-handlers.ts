import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { CueData } from '../../photonics-dmx/cues/types/cueTypes';
import { sendToAllWindows } from '../utils/windowUtils';
import { ipcError } from './ipcResult';
import { CUE, RENDERER_RECEIVE } from '../../shared/ipcChannels';

/**
 * Set up cue-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupCueHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Event listeners for YARG and RB3
  ipcMain.on(CUE.YARG_LISTENER_ENABLED, () => {
    controllerManager.enableYarg();
  });

  ipcMain.on(CUE.YARG_LISTENER_DISABLED, async () => {
    await controllerManager.disableYarg();
  });

  ipcMain.on(CUE.RB3E_LISTENER_ENABLED, () => {
    controllerManager.enableRb3();
  });

  ipcMain.on(CUE.RB3E_LISTENER_DISABLED, async () => {
    await controllerManager.disableRb3();
  });

  // Disable YARG
  ipcMain.handle(CUE.DISABLE_YARG, async () => {
    try {
      await controllerManager.disableYarg();
      return { success: true };
    } catch (error) {
      console.error('Error disabling YARG:', error);
      return ipcError(error);
    }
  });

  // Disable RB3
  ipcMain.handle(CUE.DISABLE_RB3, async () => {
    try {
      await controllerManager.disableRb3();
      return { success: true };
    } catch (error) {
      console.error('Error disabling RB3:', error);
      return ipcError(error);
    }
  });

  // RB3 mode switching
  ipcMain.on(CUE.RB3E_SWITCH_MODE, async (_, mode: 'direct' | 'cueBased') => {
    await controllerManager.switchRb3Mode(mode);
  });

  // Get RB3 current mode
  ipcMain.handle(CUE.RB3E_GET_MODE, () => {
    return controllerManager.getRb3Mode();
  });

  // Get RB3 processor statistics
  ipcMain.handle(CUE.RB3E_GET_STATS, () => {
    return controllerManager.getRb3ProcessorStats();
  });
  
  // Send handled cue data to renderer
  const sendCueHandledData = (cueData: CueData) => {
    sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, cueData);
  };
  
  // Listen for cue data
  ipcMain.on(CUE.SET_LISTEN_CUE_DATA, (_, shouldListen: boolean) => {
    if (shouldListen) {
      // Listen to cue handler if it exists
      const cueHandler = controllerManager.getCueHandler();
      if (cueHandler) {
        cueHandler.addCueHandledListener(sendCueHandledData);
      }
      
      // Also listen to ProcessorManager for RB3E direct mode
      const processorManager = controllerManager.getProcessorManager();
      if (processorManager) {
        processorManager.on('cueHandled', sendCueHandledData);
      }
    } else {
      // Remove listeners
      const cueHandler = controllerManager.getCueHandler();
      if (cueHandler) {
        cueHandler.removeCueHandledListener(sendCueHandledData);
      }
      
      const processorManager = controllerManager.getProcessorManager();
      if (processorManager) {
        processorManager.off('cueHandled', sendCueHandledData);
      }
    }
  });

  // Update effect debounce time
  ipcMain.on(CUE.UPDATE_EFFECT_DEBOUNCE, (_, debounceTime: number) => {
    // Save the debounce time to preferences
    controllerManager.getConfig().setPreference('effectDebounce', debounceTime);
    
    // Update the cue handler if it exists
    const cueHandler = controllerManager.getCueHandler();
    if (cueHandler) {
      if ('setEffectDebouncePeriod' in cueHandler) {
        cueHandler.setEffectDebouncePeriod(debounceTime);
      }
    }
  });

  // Set cue style
  ipcMain.on(CUE.CUE_STYLE, (_, style: 'simple' | 'complex') => {
    // Save complex cue style preference
    controllerManager.getConfig().setPreference('complex', style === 'complex');
  });

  // Get YARG enabled state
  ipcMain.handle(CUE.GET_YARG_ENABLED, () => {
    return controllerManager.getIsYargEnabled();
  });

  // Get RB3 enabled state
  ipcMain.handle(CUE.GET_RB3_ENABLED, () => {
    return controllerManager.getIsRb3Enabled();
  });
} 