import React, { useCallback } from 'react'
import type {
  AudioNodeCueDefinition,
  NodeCueFile,
  NetNodeCueDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { CueDocument } from '../lib/types'
import { validateNodeCue } from '../../../ipcApi'
import { replaceCueInFile, resolveCueCollisions } from '../lib/cueUtils'
import NodeJsonEditor from './NodeJsonEditor'

type CueDefinition = NetNodeCueDefinition | AudioNodeCueDefinition

const validateCueContent = (file: NodeCueFile) => validateNodeCue({ content: file })

type CueJsonEditorProps = {
  cueDefinition: CueDefinition
  editorDoc: CueDocument
  selectedCueId: string
  availableCueTypes: string[]
  onSave: (updatedCue: CueDefinition) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * The JSON editor for one cue. A cue pasted from elsewhere has its id, name and cue type reconciled
 * against the other cues in the file first, so saving it cannot clobber a sibling.
 */
const CueJsonEditor: React.FC<CueJsonEditorProps> = ({
  cueDefinition,
  editorDoc,
  selectedCueId,
  availableCueTypes,
  onSave,
  onCancel,
  onDirtyChange,
}) => {
  const buildFile = useCallback(
    (cue: CueDefinition): NodeCueFile => replaceCueInFile(editorDoc.file, selectedCueId, cue),
    [editorDoc.file, selectedCueId],
  )

  const reconcile = useCallback(
    (cue: CueDefinition) => {
      const siblings = editorDoc.file.cues.filter((c) => c.id !== selectedCueId)
      const { cue: definition, notices } = resolveCueCollisions(cue, siblings, availableCueTypes)
      return { definition, notices }
    },
    [editorDoc.file, selectedCueId, availableCueTypes],
  )

  return (
    <NodeJsonEditor
      definition={cueDefinition}
      collectionKey="cues"
      selectedId={selectedCueId}
      buildFile={buildFile}
      validate={validateCueContent}
      reconcile={reconcile}
      onSave={onSave}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />
  )
}

export default CueJsonEditor
