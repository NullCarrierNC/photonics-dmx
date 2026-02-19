import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioNodeCueDefinition,
  NodeCueFile,
  NodeCueMode,
  YargNodeCueDefinition,
  EffectFile,
  YargEffectDefinition,
  AudioEffectDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import {
  getNodeCueTypes,
  listNodeCueFiles,
  listEffectFiles
} from '../../../ipcApi';
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers';
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels';
import { createDefaultFile } from '../lib/cueDefaults';
import { clearStoredLastFilePath, getStoredLastFilePath, setStoredLastFilePath } from './useLastCueFilePath';
import type { EditorDocument } from '../lib/types';
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader';
import { useCueFileIO } from './useCueFileIO';
import { useCueCrud } from './useCueCrud';
import { useCueMetadata } from './useCueMetadata';

type UseCueFilesParams = {
  loadCueIntoFlow: (
    cue:
      | YargNodeCueDefinition
      | AudioNodeCueDefinition
      | YargEffectDefinition
      | AudioEffectDefinition
      | null
  ) => void;
  getUpdatedDocument: () => NodeCueFile | EffectFile | null;
  onSaveSuccess?: (message: string) => void;
};

const useCueFiles = ({ loadCueIntoFlow, getUpdatedDocument, onSaveSuccess }: UseCueFilesParams) => {
  const initialDocRef = useRef<EditorDocument | null>(null);
  if (!initialDocRef.current) {
    const file = createDefaultFile('yarg');
    initialDocRef.current = { mode: 'cue', file, path: null };
  }

  const [files, setFiles] = useState<NodeCueFileSummary[]>([]);
  const [effectFiles, setEffectFiles] = useState<EffectFileSummary[]>([]);
  const [mode, setMode] = useState<NodeCueMode>('yarg');
  const [editorDoc, setEditorDoc] = useState<EditorDocument | null>(initialDocRef.current);
  const initialCueFile = initialDocRef.current.file as NodeCueFile;
  const [selectedCueId, setSelectedCueId] = useState<string | null>(
    initialCueFile.cues[0]?.id ?? null
  );
  const [filename, setFilename] = useState<string>(`${initialCueFile.group.id ?? 'untitled'}.json`);
  const [availableCueTypes, setAvailableCueTypes] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const restoredLastFileRef = useRef<boolean>(false);
  const lastStoredFilePathRef = useRef<string | null>(getStoredLastFilePath());

  const activeMode: NodeCueMode = editorDoc?.file.mode ?? mode;

  const refreshFiles = useCallback(async () => {
    try {
      const summary = await listNodeCueFiles();
      setFiles([...summary.yarg, ...summary.audio]);
    } catch (error) {
      console.error('Failed to list node cue files', error);
    }
  }, []);

  const refreshEffectFiles = useCallback(async () => {
    try {
      const summary = await listEffectFiles();
      setEffectFiles([...summary.yarg, ...summary.audio]);
    } catch (error) {
      console.error('Failed to list effect files', error);
    }
  }, []);

  const rememberLastFilePath = useCallback((path: string | null) => {
    if (!path) return;
    setStoredLastFilePath(path);
    lastStoredFilePathRef.current = path;
  }, []);

  const clearLastFilePath = useCallback(() => {
    clearStoredLastFilePath();
    lastStoredFilePathRef.current = null;
  }, []);

  const fileIO = useCueFileIO({
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
  });

  const crud = useCueCrud({
    editorDoc,
    setEditorDoc,
    selectedCueId,
    setSelectedCueId,
    setFilename,
    mode,
    setValidationErrors,
    setIsDirty,
    loadCueIntoFlow,
    refreshFiles: fileIO.refreshFiles,
    refreshEffectFiles: fileIO.refreshEffectFiles
  });

  const metadata = useCueMetadata({
    editorDoc,
    setEditorDoc,
    selectedCueId,
    setSelectedCueId,
    setMode,
    setFilename,
    setIsDirty,
    loadCueIntoFlow
  });

  const currentCueDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return null;
    const cueFile = editorDoc.file as NodeCueFile;
    return cueFile.cues.find(cue => cue.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const currentEffectDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return null;
    const effectFile = editorDoc.file as EffectFile;
    return effectFile.effects.find(effect => effect.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const groupedFiles = useMemo(
    () => ({
      yarg: files.filter(file => file.mode === 'yarg'),
      audio: files.filter(file => file.mode === 'audio')
    }),
    [files]
  );

  const groupedEffectFiles = useMemo(
    () => ({
      yarg: effectFiles.filter(file => file.mode === 'yarg'),
      audio: effectFiles.filter(file => file.mode === 'audio')
    }),
    [effectFiles]
  );

  useEffect(() => {
    fileIO.refreshFiles();
    fileIO.refreshEffectFiles();
    const handler = (
      _: unknown,
      payload: { yarg: NodeCueFileSummary[]; audio: NodeCueFileSummary[] }
    ) => {
      setFiles([...payload.yarg, ...payload.audio]);
    };
    const effectHandler = (
      _: unknown,
      payload: { yarg: EffectFileSummary[]; audio: EffectFileSummary[] }
    ) => {
      setEffectFiles([...payload.yarg, ...payload.audio]);
    };
    addIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handler);
    addIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, effectHandler);
    return () => {
      removeIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handler);
      removeIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, effectHandler);
    };
  }, [fileIO.refreshFiles, fileIO.refreshEffectFiles]);

  useEffect(() => {
    getNodeCueTypes(mode)
      .then((types: string[]) => setAvailableCueTypes(types))
      .catch(() => setAvailableCueTypes([]));
  }, [mode]);

  useEffect(() => {
    if (restoredLastFileRef.current) return;
    if (files.length === 0) return;

    const storedPath = lastStoredFilePathRef.current;
    if (!storedPath) {
      restoredLastFileRef.current = true;
      return;
    }

    const summary = files.find(file => file.path === storedPath);
    restoredLastFileRef.current = true;

    if (!summary) {
      clearLastFilePath();
      return;
    }

    fileIO.selectFile(summary);
  }, [clearLastFilePath, files, fileIO.selectFile]);

  useEffect(() => {
    if (initialDocRef.current && initialDocRef.current.mode === 'cue') {
      const initialCueFile = initialDocRef.current.file as NodeCueFile;
      const initialCue = initialCueFile.cues[0] ?? null;
      loadCueIntoFlow(initialCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    }
  }, [loadCueIntoFlow]);

  return {
    mode,
    activeMode,
    files,
    effectFiles,
    groupedFiles,
    groupedEffectFiles,
    editorDoc,
    selectedCueId,
    filename,
    availableCueTypes,
    validationErrors,
    isDirty,
    currentCueDefinition,
    currentEffectDefinition,
    setFilename,
    setSelectedCueId,
    setIsDirty,
    setValidationErrors,
    handleModeChange: metadata.handleModeChange,
    handleNewFile: crud.handleNewFile,
    handleCreateNewFile: crud.handleCreateNewFile,
    updateGroupMeta: metadata.updateGroupMeta,
    updateCueMetadata: metadata.updateCueMetadata,
    updateEffectMetadata: metadata.updateEffectMetadata,
    handleAddCue: crud.handleAddCue,
    handleAddEffect: crud.handleAddEffect,
    removeCue: crud.removeCue,
    removeEffect: crud.removeEffect,
    selectFile: fileIO.selectFile,
    selectEffectFile: fileIO.selectEffectFile,
    handleSave: fileIO.handleSave,
    handleDelete: fileIO.handleDelete,
    handleImport: fileIO.handleImport,
    handleExport: fileIO.handleExport,
    refreshFiles: fileIO.refreshFiles,
    handleReload: fileIO.handleReload
  };
};

export { useCueFiles };
