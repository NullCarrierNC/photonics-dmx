import { useCallback, useState } from 'react'
import type { Node, Edge, ReactFlowInstance } from 'reactflow'
import type {
  NodeCueFile,
  EffectFile,
  NetNodeCueDefinition,
  AudioNodeCueDefinition,
  NodeCueKind,
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { updateDocumentFromFlow, updateEffectDocumentFromFlow } from '../lib/cueTransforms'
import { layoutGraph } from '../lib/graphPrettier'
import { replaceCueInFile, replaceEffectInFile } from '../lib/cueUtils'

type EditorDoc = EditorDocument | null
type CueDefinition = NetNodeCueDefinition | AudioNodeCueDefinition | null
type EffectDefinition = YargEffectDefinition | AudioEffectDefinition | null

interface UseCueJsonEditorArgs {
  editorDoc: EditorDoc
  selectedCueId: string | null
  currentCueDefinition: CueDefinition
  currentEffectDefinition: EffectDefinition
  nodes: Node[]
  edges: Edge[]
  reactFlowInstance: ReactFlowInstance | null
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  setEditorDoc(doc: EditorDoc): void
  setSelectedCueId(id: string | null): void
  setCueKind: React.Dispatch<React.SetStateAction<NodeCueKind>>
  setIsDirty(dirty: boolean): void
  loadCueIntoFlow(definition: unknown): void
}

/**
 * The cue editor's JSON side: whether the editor is open and dirty, applying an edited cue or
 * effect back into the document, prettifying the graph layout, and building the document the flow
 * canvas currently represents.
 */
export function useCueJsonEditor({
  editorDoc,
  selectedCueId,
  currentCueDefinition,
  currentEffectDefinition,
  nodes,
  edges,
  reactFlowInstance,
  setNodes,
  setEditorDoc,
  setSelectedCueId,
  setCueKind,
  setIsDirty,
  loadCueIntoFlow,
}: UseCueJsonEditorArgs) {
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [jsonEditorDirty, setJsonEditorDirty] = useState(false)

  const closeJsonEditor = useCallback(() => {
    setShowJsonEditor(false)
    setJsonEditorDirty(false)
  }, [])

  const getUpdatedDocument = useCallback((): NodeCueFile | EffectFile | null => {
    if (editorDoc?.mode === 'effect') {
      return updateEffectDocumentFromFlow(
        editorDoc,
        currentEffectDefinition,
        nodes,
        edges,
        reactFlowInstance,
      )
    }
    return updateDocumentFromFlow(editorDoc, currentCueDefinition, nodes, edges, reactFlowInstance)
  }, [editorDoc, currentCueDefinition, currentEffectDefinition, nodes, edges, reactFlowInstance])

  const handleJsonEditorSave = useCallback(
    (updatedCue: NetNodeCueDefinition | AudioNodeCueDefinition) => {
      if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return
      if (updatedCue.kind === 'lighting' || updatedCue.kind === 'motion') {
        setCueKind(updatedCue.kind)
      }
      const file = editorDoc.file as NodeCueFile
      const updatedFile = replaceCueInFile(file, selectedCueId, updatedCue)
      setEditorDoc({ mode: 'cue', file: updatedFile, path: editorDoc.path })
      // Collision resolution may have regenerated the cue's id; follow it so the editor
      // keeps the same cue selected instead of falling back to another one.
      setSelectedCueId(updatedCue.id)
      loadCueIntoFlow(updatedCue)
      closeJsonEditor()
      setIsDirty(true)
    },
    [
      editorDoc,
      selectedCueId,
      loadCueIntoFlow,
      setEditorDoc,
      setSelectedCueId,
      setCueKind,
      setIsDirty,
      closeJsonEditor,
    ],
  )

  const handleJsonEffectSave = useCallback(
    (updatedEffect: YargEffectDefinition | AudioEffectDefinition) => {
      if (!editorDoc || editorDoc.mode !== 'effect' || !selectedCueId) return
      const file = editorDoc.file as EffectFile
      const updatedFile = replaceEffectInFile(file, selectedCueId, updatedEffect)
      setEditorDoc({ mode: 'effect', file: updatedFile, path: editorDoc.path })
      setSelectedCueId(updatedEffect.id)
      loadCueIntoFlow(updatedEffect)
      closeJsonEditor()
      setIsDirty(true)
    },
    [
      editorDoc,
      selectedCueId,
      loadCueIntoFlow,
      setEditorDoc,
      setSelectedCueId,
      setIsDirty,
      closeJsonEditor,
    ],
  )

  const handleGraphPrettify = useCallback(() => {
    const definition = editorDoc?.mode === 'effect' ? currentEffectDefinition : currentCueDefinition
    if (!definition) return

    const result = layoutGraph(
      definition.id,
      definition.nodes,
      definition.connections,
      definition.layout?.nodePositions ?? {},
    )
    if (!('nodePositions' in result) || !result.nodePositions) return

    setNodes((prev) =>
      prev.map((node) => {
        const newPos = result.nodePositions[node.id]
        return newPos ? { ...node, position: newPos } : node
      }),
    )

    if (result.viewport && reactFlowInstance) {
      reactFlowInstance.setViewport(result.viewport)
    }

    setIsDirty(true)
  }, [
    editorDoc?.mode,
    currentCueDefinition,
    currentEffectDefinition,
    setNodes,
    reactFlowInstance,
    setIsDirty,
  ])

  return {
    showJsonEditor,
    setShowJsonEditor,
    jsonEditorDirty,
    setJsonEditorDirty,
    closeJsonEditor,
    getUpdatedDocument,
    handleJsonEditorSave,
    handleJsonEffectSave,
    handleGraphPrettify,
  }
}
