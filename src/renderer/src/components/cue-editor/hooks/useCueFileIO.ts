import { useCallback } from 'react';
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectFile
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument } from '../lib/types';
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader';
import {
  readNodeCueFile,
  readEffectFile,
  saveNodeCueFile,
  saveEffectFile,
  deleteNodeCueFile,
  deleteEffectFile,
  importNodeCueFile,
  exportNodeCueFile,
  importEffectFile,
  exportEffectFile,
  validateNodeCue,
  validateEffect
} from '../../../ipcApi';
import { createDefaultFile, createDefaultEffectFile } from '../lib/cueDefaults';

export type UseCueFileIOParams = {
  editorDoc: EditorDocument | null;
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>;
  filename: string;
  setFilename: React.Dispatch<React.SetStateAction<string>>;
  selectedCueId: string | null;
  setSelectedCueId: (id: string | null) => void;
  mode: 'yarg' | 'audio';
  setMode: React.Dispatch<React.SetStateAction<'yarg' | 'audio'>>;
  setValidationErrors: (errors: string[]) => void;
  setIsDirty: (dirty: boolean) => void;
  loadCueIntoFlow: (cue: YargNodeCueDefinition | AudioNodeCueDefinition | YargEffectDefinition | AudioEffectDefinition | null) => void;
  getUpdatedDocument: () => NodeCueFile | EffectFile | null;
  rememberLastFilePath: (path: string | null) => void;
  clearLastFilePath: () => void;
  refreshFiles: () => Promise<void>;
  refreshEffectFiles: () => Promise<void>;
  onSaveSuccess?: (message: string) => void;
  lastStoredFilePathRef: React.MutableRefObject<string | null>;
};

export function useCueFileIO({
  editorDoc,
  setEditorDoc,
  filename,
  setFilename,
  selectedCueId,
  setSelectedCueId,
  mode,
  setMode,
  setValidationErrors,
  setIsDirty,
  loadCueIntoFlow,
  getUpdatedDocument,
  rememberLastFilePath,
  clearLastFilePath,
  refreshFiles,
  refreshEffectFiles,
  onSaveSuccess,
  lastStoredFilePathRef
}: UseCueFileIOParams) {
  const selectFile = useCallback(
    async (fileSummary: NodeCueFileSummary) => {
      try {
        const file = await readNodeCueFile(fileSummary.path);
        setEditorDoc({ mode: 'cue', file, path: fileSummary.path });
        setMode(file.mode);
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path);
        const cueFile = file as NodeCueFile;
        const cueId = cueFile.cues[0]?.id ?? null;
        setSelectedCueId(cueId);
        setIsDirty(false);
        loadCueIntoFlow(file.cues[0] ?? null);
        rememberLastFilePath(fileSummary.path);
      } catch (error) {
        console.error('Failed to open node cue file', error);
      }
    },
    [loadCueIntoFlow, rememberLastFilePath, setEditorDoc, setFilename, setMode, setSelectedCueId, setIsDirty]
  );

  const selectEffectFile = useCallback(
    async (fileSummary: EffectFileSummary) => {
      try {
        const file = await readEffectFile(fileSummary.path);
        setEditorDoc({ mode: 'effect', file, path: fileSummary.path });
        setMode(file.mode);
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path);
        const effectFile = file as EffectFile;
        const effectId = effectFile.effects[0]?.id ?? null;
        setSelectedCueId(effectId);
        setIsDirty(false);
        loadCueIntoFlow(effectFile.effects[0] ?? null);
        rememberLastFilePath(fileSummary.path);
      } catch (error) {
        console.error('Failed to open effect file', error);
      }
    },
    [loadCueIntoFlow, rememberLastFilePath, setEditorDoc, setFilename, setMode, setSelectedCueId, setIsDirty]
  );

  const handleSave = useCallback(async () => {
    if (!editorDoc) return;
    const updatedFile = getUpdatedDocument();
    if (!updatedFile) return;

    const payload = {
      mode: updatedFile.mode,
      filename,
      content: updatedFile
    };

    if (editorDoc.mode === 'effect') {
      const validation = await validateEffect({ content: updatedFile });
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        return;
      }
      try {
        const response = await saveEffectFile(payload);
        setEditorDoc({ mode: 'effect', file: updatedFile, path: response.path });
        rememberLastFilePath(response.path);
        setValidationErrors([]);
        setIsDirty(false);
        refreshEffectFiles();
        onSaveSuccess?.(`Effect saved: ${filename}`);
      } catch (error) {
        console.error('Failed to save effect file', error);
      }
    } else {
      const validation = await validateNodeCue({ content: updatedFile });
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        return;
      }
      try {
        const response = await saveNodeCueFile(payload);
        setEditorDoc({ mode: 'cue', file: updatedFile, path: response.path });
        rememberLastFilePath(response.path);
        setValidationErrors([]);
        setIsDirty(false);
        refreshFiles();
        onSaveSuccess?.(`Cue saved: ${filename}`);
      } catch (error) {
        console.error('Failed to save node cue file', error);
      }
    }
  }, [
    editorDoc,
    filename,
    getUpdatedDocument,
    refreshFiles,
    refreshEffectFiles,
    rememberLastFilePath,
    onSaveSuccess,
    setEditorDoc,
    setValidationErrors,
    setIsDirty
  ]);

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return;
    if (editorDoc.path === lastStoredFilePathRef.current) {
      clearLastFilePath();
    }

    if (editorDoc.mode === 'effect') {
      await deleteEffectFile(editorDoc.path);
      const file = createDefaultEffectFile(mode);
      setEditorDoc({ mode: 'effect', file, path: null });
      setSelectedCueId(file.effects[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.effects[0] ?? null);
      setValidationErrors([]);
      setIsDirty(true);
      refreshEffectFiles();
    } else {
      await deleteNodeCueFile(editorDoc.path);
      const file = createDefaultFile(mode);
      setEditorDoc({ mode: 'cue', file, path: null });
      setSelectedCueId(file.cues[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.cues[0] ?? null);
      setValidationErrors([]);
      setIsDirty(true);
      refreshFiles();
    }
  }, [
    clearLastFilePath,
    editorDoc,
    loadCueIntoFlow,
    mode,
    refreshFiles,
    refreshEffectFiles,
    lastStoredFilePathRef,
    setEditorDoc,
    setFilename,
    setSelectedCueId,
    setValidationErrors,
    setIsDirty
  ]);

  const handleImport = useCallback(async () => {
    if (editorDoc?.mode === 'effect') {
      await importEffectFile(mode);
      refreshEffectFiles();
    } else {
      await importNodeCueFile(mode);
      refreshFiles();
    }
  }, [editorDoc?.mode, mode, refreshFiles, refreshEffectFiles]);

  const handleExport = useCallback(async () => {
    if (!editorDoc?.path) return;
    if (editorDoc.mode === 'effect') {
      await exportEffectFile(editorDoc.path);
    } else {
      await exportNodeCueFile(editorDoc.path);
    }
  }, [editorDoc]);

  const handleReload = useCallback(async () => {
    const currentPath = editorDoc?.path;

    if (editorDoc?.mode === 'effect') {
      await refreshEffectFiles();
    } else {
      await refreshFiles();
    }

    if (currentPath) {
      try {
        if (editorDoc?.mode === 'effect') {
          const file = await readEffectFile(currentPath);
          setEditorDoc({ mode: 'effect', file, path: currentPath });
          setMode(file.mode);
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath);
          const effectFile = file as EffectFile;
          const effectId =
            effectFile.effects.find(e => e.id === selectedCueId)?.id ?? effectFile.effects[0]?.id ?? null;
          setSelectedCueId(effectId);
          setIsDirty(false);
          loadCueIntoFlow(effectFile.effects.find(e => e.id === effectId) ?? null);
        } else {
          const file = await readNodeCueFile(currentPath);
          setEditorDoc({ mode: 'cue', file, path: currentPath });
          setMode(file.mode);
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath);
          const cueFile = file as NodeCueFile;
          const cueId =
            cueFile.cues.find(c => c.id === selectedCueId)?.id ?? cueFile.cues[0]?.id ?? null;
          setSelectedCueId(cueId);
          setIsDirty(false);
          loadCueIntoFlow(cueFile.cues.find(c => c.id === cueId) ?? null);
        }
      } catch (error) {
        console.error('Failed to reload current file', error);
      }
    }
  }, [editorDoc, selectedCueId, refreshFiles, refreshEffectFiles, loadCueIntoFlow, setEditorDoc, setFilename, setMode, setSelectedCueId, setIsDirty]);

  return {
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    handleReload,
    refreshFiles,
    refreshEffectFiles
  };
}
