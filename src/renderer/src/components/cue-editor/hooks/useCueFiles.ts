import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  NodeCueFile,
  NodeCueGroupMeta,
  NodeCueMode,
  YargNodeCueDefinition,
  YargNodeCueFile,
  EffectFile,
  YargEffectDefinition,
  AudioEffectDefinition,
  YargEffectFile,
  AudioEffectFile
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { 
  getNodeCueTypes, 
  listNodeCueFiles, 
  readNodeCueFile, 
  saveNodeCueFile, 
  deleteNodeCueFile, 
  importNodeCueFile, 
  exportNodeCueFile, 
  validateNodeCue, 
  validateEffect,
  listEffectFiles,
  readEffectFile,
  saveEffectFile,
  deleteEffectFile,
  importEffectFile,
  exportEffectFile
} from '../../../ipcApi';
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers';
import { createBlankCue, createDefaultFile, createDefaultEffectFile, createDefaultEffect } from '../lib/cueDefaults';
import { clearStoredLastFilePath, getStoredLastFilePath, setStoredLastFilePath } from './useLastCueFilePath';
import type { EditorDocument } from '../lib/types';
import type { EffectMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader';

type UseCueFilesParams = {
  loadCueIntoFlow: (cue: YargNodeCueDefinition | AudioNodeCueDefinition | any | null) => void;
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
  const [selectedCueId, setSelectedCueId] = useState<string | null>(initialCueFile.cues[0]?.id ?? null);
  const [filename, setFilename] = useState<string>(`${initialCueFile.group.id ?? 'untitled'}.json`);
  const [availableCueTypes, setAvailableCueTypes] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const restoredLastFileRef = useRef<boolean>(false);
  const lastStoredFilePathRef = useRef<string | null>(getStoredLastFilePath());

  const activeMode: NodeCueMode = editorDoc?.file.mode ?? mode;

  const currentCueDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return null;
    const cueFile = editorDoc.file as NodeCueFile;
    return cueFile.cues.find(cue => cue.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const currentEffectDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return null;
    const effectFile = editorDoc.file as import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectFile;
    return effectFile.effects.find(effect => effect.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const groupedFiles = useMemo(() => ({
    yarg: files.filter(file => file.mode === 'yarg'),
    audio: files.filter(file => file.mode === 'audio')
  }), [files]);

  const groupedEffectFiles = useMemo(() => ({
    yarg: effectFiles.filter(file => file.mode === 'yarg'),
    audio: effectFiles.filter(file => file.mode === 'audio')
  }), [effectFiles]);

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

  useEffect(() => {
    refreshFiles();
    refreshEffectFiles();
    const handler = (_: unknown, payload: { yarg: NodeCueFileSummary[]; audio: NodeCueFileSummary[] }) => {
      setFiles([...payload.yarg, ...payload.audio]);
    };
    const effectHandler = (_: unknown, payload: { yarg: EffectFileSummary[]; audio: EffectFileSummary[] }) => {
      setEffectFiles([...payload.yarg, ...payload.audio]);
    };
    addIpcListener('node-cues:changed', handler);
    addIpcListener('effects:changed', effectHandler);
    return () => {
      removeIpcListener('node-cues:changed', handler);
      removeIpcListener('effects:changed', effectHandler);
    };
  }, [refreshFiles, refreshEffectFiles]);

  useEffect(() => {
    getNodeCueTypes(mode).then((types: string[]) => setAvailableCueTypes(types)).catch(() => setAvailableCueTypes([]));
  }, [mode]);

  const rememberLastFilePath = useCallback((path: string | null) => {
    if (!path) return;
    setStoredLastFilePath(path);
    lastStoredFilePathRef.current = path;
  }, []);

  const clearLastFilePath = useCallback(() => {
    clearStoredLastFilePath();
    lastStoredFilePathRef.current = null;
  }, []);

  const selectFile = useCallback(async (fileSummary: NodeCueFileSummary) => {
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
  }, [loadCueIntoFlow, rememberLastFilePath]);

  const selectEffectFile = useCallback(async (fileSummary: EffectFileSummary) => {
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
  }, [loadCueIntoFlow, rememberLastFilePath]);

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

    selectFile(summary);
  }, [clearLastFilePath, files, selectFile]);

  useEffect(() => {
    if (initialDocRef.current && initialDocRef.current.mode === 'cue') {
      const initialCueFile = initialDocRef.current.file as NodeCueFile;
      const initialCue = initialCueFile.cues[0] ?? null;
      loadCueIntoFlow(initialCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    }
  }, [loadCueIntoFlow]);

  const handleModeChange = useCallback((nextMode: NodeCueMode | string) => {
    // Determine if this is an effect mode or cue mode
    const isEffectMode = nextMode === 'yarg-effect' || nextMode === 'audio-effect';
    const effectMode: EffectMode = nextMode === 'yarg-effect' ? 'yarg' : 'audio';
    const cueMode: NodeCueMode = nextMode === 'yarg-effect' || nextMode === 'yarg' ? 'yarg' : 'audio';
    
    // Update the mode state (for cues)
    setMode(cueMode);
    
    if (isEffectMode) {
      // Create a default effect file
      const file = createDefaultEffectFile(effectMode);
      setEditorDoc({ mode: 'effect', file, path: null });
      setSelectedCueId(file.effects[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(null); // Clear the flow for effect mode
      setIsDirty(true);
    } else if (!editorDoc || editorDoc.mode === 'effect') {
      // Switching to cue mode - create or use existing cue file
      const file = createDefaultFile(cueMode);
      setEditorDoc({ mode: 'cue', file, path: null });
      setSelectedCueId(file.cues[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.cues[0] ?? null);
      setIsDirty(true);
    }
  }, [editorDoc, loadCueIntoFlow]);

  const handleNewFile = useCallback(() => {
    // This function is now just a placeholder - the actual logic is in handleCreateNewFile
    // which is called after the modal is filled out
  }, []);

  const handleCreateNewFile = useCallback(async (metadata: {
    groupId: string;
    groupName: string;
    groupDescription: string;
    itemName: string;
    itemDescription: string;
  }) => {
    const isInEffectMode = editorDoc?.mode === 'effect';
    
    if (isInEffectMode) {
      // Create a new effect file with metadata
      const file = createDefaultEffectFile(mode as EffectMode);
      file.group.id = metadata.groupId;
      file.group.name = metadata.groupName;
      file.group.description = metadata.groupDescription;
      file.effects[0].name = metadata.itemName;
      file.effects[0].description = metadata.itemDescription;
      
      const filename = `${metadata.groupId}.json`;
      
      // Validate and save immediately
      const validation = await validateEffect({ content: file });
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        alert('Failed to create effect file: ' + validation.errors.join(', '));
        return;
      }

      try {
        const response = await saveEffectFile({ mode: file.mode, filename, content: file });
        setEditorDoc({ mode: 'effect', file, path: response.path });
        setSelectedCueId(file.effects[0]?.id ?? null);
        setFilename(filename);
        loadCueIntoFlow(file.effects[0] ?? null);
        setValidationErrors([]);
        setIsDirty(false);
        refreshEffectFiles();
      } catch (error) {
        console.error('Failed to save effect file', error);
        alert('Failed to save effect file: ' + error);
      }
    } else {
      // Create a new cue file with metadata
      const file = createDefaultFile(mode);
      file.group.id = metadata.groupId;
      file.group.name = metadata.groupName;
      file.group.description = metadata.groupDescription;
      file.cues[0].name = metadata.itemName;
      file.cues[0].description = metadata.itemDescription;
      
      const filename = `${metadata.groupId}.json`;
      
      // Validate and save immediately
      const validation = await validateNodeCue({ content: file });
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        alert('Failed to create cue file: ' + validation.errors.join(', '));
        return;
      }

      try {
        const response = await saveNodeCueFile({ mode: file.mode, filename, content: file });
        setEditorDoc({ mode: 'cue', file, path: response.path });
        setSelectedCueId(file.cues[0]?.id ?? null);
        setFilename(filename);
        loadCueIntoFlow(file.cues[0] ?? null);
        setValidationErrors([]);
        setIsDirty(false);
        refreshFiles();
      } catch (error) {
        console.error('Failed to save cue file', error);
        alert('Failed to save cue file: ' + error);
      }
    }
  }, [editorDoc?.mode, mode, loadCueIntoFlow, refreshFiles, refreshEffectFiles]);

  const updateGroupMeta = useCallback((updates: Partial<NodeCueGroupMeta>) => {
    if (!editorDoc) return;
    const updated = {
      ...editorDoc,
      file: {
        ...editorDoc.file,
        group: { ...editorDoc.file.group, ...updates }
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc]);

  const updateCueMetadata = useCallback((updates: Partial<YargNodeCueDefinition & AudioNodeCueDefinition>) => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return;
    const cueFile = editorDoc.file as NodeCueFile;
    const updatedCues = cueFile.cues.map(cue => cue.id === selectedCueId ? { ...cue, ...updates } : cue);
    const updated = {
      ...editorDoc,
      file: {
        ...cueFile,
        cues: updatedCues
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc, selectedCueId]);

  const updateEffectMetadata = useCallback((updates: Partial<import('../../../../../photonics-dmx/cues/types/nodeCueTypes').YargEffectDefinition> & Partial<import('../../../../../photonics-dmx/cues/types/nodeCueTypes').AudioEffectDefinition>) => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return;
    const effectFile = editorDoc.file as import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectFile;
    const updatedEffects = effectFile.effects.map(effect => effect.id === selectedCueId ? { ...effect, ...updates } : effect);
    const updated = {
      ...editorDoc,
      file: {
        ...effectFile,
        effects: updatedEffects
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc, selectedCueId]);

  const handleAddCue = useCallback(() => {
    const baseDoc = editorDoc ?? { mode: 'cue' as const, file: createDefaultFile(mode), path: null };
    
    // Don't add cues in effect mode
    if (baseDoc.mode === 'effect') {
      console.warn('Cannot add cue in effect mode');
      return;
    }
    
    const newCue = createBlankCue(mode);
    const baseCueFile = baseDoc.file as NodeCueFile;
    const updatedCues = [...baseCueFile.cues, newCue];
    const updatedFile = mode === 'yarg'
      ? { ...baseDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...baseDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile };
    setEditorDoc(updatedDoc);
    setSelectedCueId(newCue.id);
    loadCueIntoFlow(newCue as YargNodeCueDefinition | AudioNodeCueDefinition);
    setIsDirty(true);
  }, [editorDoc, mode, loadCueIntoFlow]);

  const handleAddEffect = useCallback(() => {
    const baseDoc = editorDoc ?? { mode: 'effect' as const, file: createDefaultEffectFile(mode as EffectMode), path: null };
    
    // Don't add effects in cue mode
    if (baseDoc.mode === 'cue') {
      console.warn('Cannot add effect in cue mode');
      return;
    }
    
    const newEffect = createDefaultEffect(mode as EffectMode);
    const baseEffectFile = baseDoc.file as EffectFile;
    const updatedEffects = [...baseEffectFile.effects, newEffect];
    const updatedFile = mode === 'yarg'
      ? { ...baseDoc.file, effects: updatedEffects as YargEffectDefinition[] } as YargEffectFile
      : { ...baseDoc.file, effects: updatedEffects as AudioEffectDefinition[] } as AudioEffectFile;
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile };
    setEditorDoc(updatedDoc);
    setSelectedCueId(newEffect.id);
    loadCueIntoFlow(newEffect as YargEffectDefinition | AudioEffectDefinition);
    setIsDirty(true);
  }, [editorDoc, mode, loadCueIntoFlow]);

  const removeCue = useCallback((cueId: string) => {
    if (!editorDoc || editorDoc.mode !== 'cue') return;
    const cueFile = editorDoc.file as NodeCueFile;
    if (cueFile.cues.length <= 1) return;

    const updatedCues = cueFile.cues.filter(cue => cue.id !== cueId);
    const updatedFile = cueFile.mode === 'yarg'
      ? { ...cueFile, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...cueFile, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
    const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile };

    setEditorDoc(updatedDoc);

    let nextCueId = selectedCueId;
    if (cueId === selectedCueId) {
      nextCueId = updatedCues[0]?.id ?? null;
      setSelectedCueId(nextCueId);
    }

    const nextCue = updatedCues.find(cue => cue.id === nextCueId) ?? updatedCues[0] ?? null;
    loadCueIntoFlow(nextCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    setIsDirty(true);
  }, [editorDoc, loadCueIntoFlow, selectedCueId]);

  const removeEffect = useCallback((effectId: string) => {
    if (!editorDoc || editorDoc.mode !== 'effect') return;
    const effectFile = editorDoc.file as EffectFile;
    if (effectFile.effects.length <= 1) return;

    const updatedEffects = effectFile.effects.filter(effect => effect.id !== effectId);
    const updatedFile = effectFile.mode === 'yarg'
      ? { ...effectFile, effects: updatedEffects as YargEffectDefinition[] } as YargEffectFile
      : { ...effectFile, effects: updatedEffects as AudioEffectDefinition[] } as AudioEffectFile;
    const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile };

    setEditorDoc(updatedDoc);

    let nextEffectId = selectedCueId;
    if (effectId === selectedCueId) {
      nextEffectId = updatedEffects[0]?.id ?? null;
      setSelectedCueId(nextEffectId);
    }

    const nextEffect = updatedEffects.find(effect => effect.id === nextEffectId) ?? updatedEffects[0] ?? null;
    loadCueIntoFlow(nextEffect as YargEffectDefinition | AudioEffectDefinition | null);
    setIsDirty(true);
  }, [editorDoc, loadCueIntoFlow, selectedCueId]);

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
  }, [editorDoc, filename, getUpdatedDocument, refreshFiles, refreshEffectFiles, rememberLastFilePath, onSaveSuccess]);

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return;
    if (editorDoc.path === lastStoredFilePathRef.current) {
      clearLastFilePath();
    }

    if (editorDoc.mode === 'effect') {
      await deleteEffectFile(editorDoc.path);
      const file = createDefaultEffectFile(mode as EffectMode);
      setEditorDoc({ mode: 'effect', file, path: null });
      const effectId = file.effects[0]?.id ?? null;
      setSelectedCueId(effectId);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.effects[0] ?? null);
      setValidationErrors([]);
      setIsDirty(true);
      refreshEffectFiles();
    } else {
      await deleteNodeCueFile(editorDoc.path);
      const file = createDefaultFile(mode);
      setEditorDoc({ mode: 'cue', file, path: null });
      const cueId = file.cues[0]?.id ?? null;
      setSelectedCueId(cueId);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.cues[0] ?? null);
      setValidationErrors([]);
      setIsDirty(true);
      refreshFiles();
    }
  }, [clearLastFilePath, editorDoc, loadCueIntoFlow, mode, refreshFiles, refreshEffectFiles]);

  const handleImport = useCallback(async () => {
    if (editorDoc?.mode === 'effect') {
      await importEffectFile(mode as EffectMode);
      refreshEffectFiles();
    } else {
      await importNodeCueFile(mode);
      refreshFiles();
    }
  }, [editorDoc, mode, refreshFiles, refreshEffectFiles]);

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
    
    // Refresh the file list
    if (editorDoc?.mode === 'effect') {
      await refreshEffectFiles();
    } else {
      await refreshFiles();
    }

    // If there's a current file open, reload it directly from disk
    if (currentPath) {
      try {
        if (editorDoc?.mode === 'effect') {
          const file = await readEffectFile(currentPath);
          setEditorDoc({ mode: 'effect', file, path: currentPath });
          setMode(file.mode);
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath);
          const effectFile = file as EffectFile;
          const effectId = effectFile.effects.find(e => e.id === selectedCueId)?.id ?? effectFile.effects[0]?.id ?? null;
          setSelectedCueId(effectId);
          setIsDirty(false);
          loadCueIntoFlow(effectFile.effects.find(e => e.id === effectId) ?? null);
        } else {
          const file = await readNodeCueFile(currentPath);
          setEditorDoc({ mode: 'cue', file, path: currentPath });
          setMode(file.mode);
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath);
          const cueFile = file as NodeCueFile;
          const cueId = cueFile.cues.find(c => c.id === selectedCueId)?.id ?? cueFile.cues[0]?.id ?? null;
          setSelectedCueId(cueId);
          setIsDirty(false);
          loadCueIntoFlow(cueFile.cues.find(c => c.id === cueId) ?? null);
        }
      } catch (error) {
        console.error('Failed to reload current file', error);
      }
    }
  }, [editorDoc, selectedCueId, refreshFiles, refreshEffectFiles, loadCueIntoFlow]);

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
    handleModeChange,
    handleNewFile,
    handleCreateNewFile,
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
    handleAddCue,
    handleAddEffect,
    removeCue,
    removeEffect,
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    refreshFiles,
    handleReload
  };
};

export { useCueFiles };

