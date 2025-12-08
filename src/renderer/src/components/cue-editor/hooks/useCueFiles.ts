import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  NodeCueFile,
  NodeCueGroupMeta,
  NodeCueMode,
  YargNodeCueDefinition,
  YargNodeCueFile
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { getNodeCueTypes, listNodeCueFiles, readNodeCueFile, saveNodeCueFile, deleteNodeCueFile, importNodeCueFile, exportNodeCueFile, validateNodeCue } from '../../../ipcApi';
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers';
import { createBlankCue, createDefaultFile } from '../lib/cueDefaults';
import { clearStoredLastFilePath, getStoredLastFilePath, setStoredLastFilePath } from './useLastCueFilePath';
import type { EditorDocument } from '../lib/types';

type UseCueFilesParams = {
  loadCueIntoFlow: (cue: YargNodeCueDefinition | AudioNodeCueDefinition | null) => void;
  getUpdatedDocument: () => NodeCueFile | null;
};

const useCueFiles = ({ loadCueIntoFlow, getUpdatedDocument }: UseCueFilesParams) => {
  const initialDocRef = useRef<EditorDocument | null>(null);
  if (!initialDocRef.current) {
    const file = createDefaultFile('yarg');
    initialDocRef.current = { file, path: null };
  }

  const [files, setFiles] = useState<NodeCueFileSummary[]>([]);
  const [mode, setMode] = useState<NodeCueMode>('yarg');
  const [editorDoc, setEditorDoc] = useState<EditorDocument | null>(initialDocRef.current);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(initialDocRef.current?.file.cues[0]?.id ?? null);
  const [filename, setFilename] = useState<string>(`${initialDocRef.current?.file.group.id ?? 'untitled'}.json`);
  const [availableCueTypes, setAvailableCueTypes] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const restoredLastFileRef = useRef<boolean>(false);
  const lastStoredFilePathRef = useRef<string | null>(getStoredLastFilePath());

  const activeMode: NodeCueMode = editorDoc?.file.mode ?? mode;

  const currentCueDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId) return null;
    return editorDoc.file.cues.find(cue => cue.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const groupedFiles = useMemo(() => ({
    yarg: files.filter(file => file.mode === 'yarg'),
    audio: files.filter(file => file.mode === 'audio')
  }), [files]);

  const refreshFiles = useCallback(async () => {
    try {
      const summary = await listNodeCueFiles();
      setFiles([...summary.yarg, ...summary.audio]);
    } catch (error) {
      console.error('Failed to list node cue files', error);
    }
  }, []);

  useEffect(() => {
    refreshFiles();
    const handler = (_: unknown, payload: { yarg: NodeCueFileSummary[]; audio: NodeCueFileSummary[] }) => {
      setFiles([...payload.yarg, ...payload.audio]);
    };
    addIpcListener('node-cues:changed', handler);
    return () => removeIpcListener('node-cues:changed', handler);
  }, [refreshFiles]);

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
      setEditorDoc({ file, path: fileSummary.path });
      setMode(file.mode);
      setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path);
      const cueId = file.cues[0]?.id ?? null;
      setSelectedCueId(cueId);
      setIsDirty(false);
      loadCueIntoFlow(file.cues[0] ?? null);
      rememberLastFilePath(fileSummary.path);
    } catch (error) {
      console.error('Failed to open node cue file', error);
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
    if (initialDocRef.current) {
      const initialCue = initialDocRef.current.file.cues[0] ?? null;
      loadCueIntoFlow(initialCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    }
  }, [loadCueIntoFlow]);

  const handleModeChange = useCallback((nextMode: NodeCueMode) => {
    setMode(nextMode);
    if (!editorDoc) {
      const file = createDefaultFile(nextMode);
      setEditorDoc({ file, path: null });
      setSelectedCueId(file.cues[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.cues[0] ?? null);
      setIsDirty(true);
    }
  }, [editorDoc, loadCueIntoFlow]);

  const handleNewFile = useCallback(() => {
    const file = createDefaultFile(mode);
    setEditorDoc({ file, path: null });
    setSelectedCueId(file.cues[0]?.id ?? null);
    setFilename(`${file.group.id}.json`);
    loadCueIntoFlow(file.cues[0] ?? null);
    setIsDirty(true);
    setValidationErrors([]);
  }, [mode, loadCueIntoFlow]);

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
    if (!editorDoc || !selectedCueId) return;
    const updatedCues = editorDoc.file.cues.map(cue => cue.id === selectedCueId ? { ...cue, ...updates } : cue);
    const updated = {
      ...editorDoc,
      file: {
        ...editorDoc.file,
        cues: updatedCues
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc, selectedCueId]);

  const handleAddCue = useCallback(() => {
    const newCue = createBlankCue(mode);
    const baseDoc = editorDoc ?? { file: createDefaultFile(mode), path: null };
    const updatedCues = [...baseDoc.file.cues, newCue];
    const updatedFile = mode === 'yarg'
      ? { ...baseDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...baseDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile };
    setEditorDoc(updatedDoc);
    setSelectedCueId(newCue.id);
    loadCueIntoFlow(newCue as YargNodeCueDefinition | AudioNodeCueDefinition);
    setIsDirty(true);
  }, [editorDoc, mode, loadCueIntoFlow]);

  const removeCue = useCallback((cueId: string) => {
    if (!editorDoc) return;
    if (editorDoc.file.cues.length <= 1) return;

    const updatedCues = editorDoc.file.cues.filter(cue => cue.id !== cueId);
    const updatedFile = editorDoc.file.mode === 'yarg'
      ? { ...editorDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...editorDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
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

  const handleSave = useCallback(async () => {
    if (!editorDoc) return;
    const updatedFile = getUpdatedDocument();
    if (!updatedFile) return;

    const payload = {
      mode: updatedFile.mode,
      filename,
      content: updatedFile
    };

    const validation = await validateNodeCue({ content: updatedFile });
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      const response = await saveNodeCueFile(payload);
      setEditorDoc({ file: updatedFile, path: response.path });
      rememberLastFilePath(response.path);
      setValidationErrors([]);
      setIsDirty(false);
      refreshFiles();
    } catch (error) {
      console.error('Failed to save node cue file', error);
    }
  }, [editorDoc, filename, getUpdatedDocument, refreshFiles, rememberLastFilePath]);

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return;
    if (editorDoc.path === lastStoredFilePathRef.current) {
      clearLastFilePath();
    }
    await deleteNodeCueFile(editorDoc.path);
    const file = createDefaultFile(mode);
    setEditorDoc({ file, path: null });
    const cueId = file.cues[0]?.id ?? null;
    setSelectedCueId(cueId);
    setFilename(`${file.group.id}.json`);
    loadCueIntoFlow(file.cues[0] ?? null);
    setValidationErrors([]);
    setIsDirty(true);
    refreshFiles();
  }, [clearLastFilePath, editorDoc, loadCueIntoFlow, mode, refreshFiles]);

  const handleImport = useCallback(async () => {
    await importNodeCueFile(mode);
    refreshFiles();
  }, [mode, refreshFiles]);

  const handleExport = useCallback(async () => {
    if (!editorDoc?.path) return;
    await exportNodeCueFile(editorDoc.path);
  }, [editorDoc]);

  return {
    mode,
    activeMode,
    files,
    groupedFiles,
    editorDoc,
    selectedCueId,
    filename,
    availableCueTypes,
    validationErrors,
    isDirty,
    currentCueDefinition,
    setFilename,
    setSelectedCueId,
    setIsDirty,
    setValidationErrors,
    handleModeChange,
    handleNewFile,
    updateGroupMeta,
    updateCueMetadata,
    handleAddCue,
    removeCue,
    selectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    refreshFiles
  };
};

export { useCueFiles };

