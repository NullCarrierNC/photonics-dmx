import { IpcMain, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ControllerManager } from '../controllers/ControllerManager';
import { EffectMode, EffectFile } from '../../photonics-dmx/cues/types/nodeCueTypes';
import { validateEffectFile } from '../../photonics-dmx/cues/node/schema/validation';
import { ipcError } from './ipcResult';
import { EFFECTS } from '../../shared/ipcChannels';

const ensureLoader = (controllerManager: ControllerManager) => {
  const loader = controllerManager.getEffectLoader();
  if (!loader) {
    throw new Error('Effect loader is not initialized.');
  }
  return loader;
};

interface SavePayload {
  mode: EffectMode;
  filename: string;
  content: EffectFile;
}

interface ValidatePayload {
  path?: string;
  content?: EffectFile;
}

export function setupEffectHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle(EFFECTS.LIST, async () => {
    const loader = ensureLoader(controllerManager);
    return loader.getSummary();
  });

  ipcMain.handle(EFFECTS.RELOAD, async () => {
    const loader = ensureLoader(controllerManager);
    return loader.reload();
  });

  ipcMain.handle(EFFECTS.READ, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager);
    return loader.readFile(filePath);
  });

  ipcMain.handle(EFFECTS.SAVE, async (_event, payload: SavePayload) => {
    const loader = ensureLoader(controllerManager);
    return loader.saveFile(payload.mode, payload.filename, payload.content);
  });

  ipcMain.handle(EFFECTS.DELETE, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager);
    return loader.deleteFile(filePath);
  });

  ipcMain.handle(EFFECTS.VALIDATE, async (_event, payload: ValidatePayload) => {
    const loader = ensureLoader(controllerManager);

    if (payload.content) {
      return validateEffectFile(payload.content);
    }

    if (payload.path) {
      try {
        const file = await loader.readFile(payload.path);
        return {
          valid: true,
          data: file,
          errors: [],
          mode: file.mode
        };
      } catch (error) {
        return {
          valid: false,
          errors: [ipcError(error).error]
        };
      }
    }

    throw new Error('Validation payload must include either content or path.');
  });

  ipcMain.handle(EFFECTS.IMPORT, async (_event, preferredMode?: EffectMode) => {
    const loader = ensureLoader(controllerManager);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Effect Files', extensions: ['json'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'User cancelled import.' };
    }

    const sourcePath = result.filePaths[0];
    const raw = await fs.readFile(sourcePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateEffectFile(parsed);
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.errors.join(', ') || 'Invalid effect file' };
    }

    if (!validation.mode) {
      return { success: false, error: 'Effect file has no mode specified.' };
    }

    const mode = preferredMode ?? validation.mode;
    const filename = path.basename(sourcePath);
    const saveResult = await loader.saveFile(mode, filename, validation.data);
    return { success: true, path: saveResult.path };
  });

  ipcMain.handle(EFFECTS.EXPORT, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager);
    await loader.readFile(filePath); // ensure file is valid/exists

    const result = await dialog.showSaveDialog({
      title: 'Export Effect File',
      defaultPath: path.basename(filePath),
      filters: [{ name: 'Effect Files', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'User cancelled export.' };
    }

    await fs.copyFile(filePath, result.filePath);
    return { success: true, path: result.filePath };
  });
}
