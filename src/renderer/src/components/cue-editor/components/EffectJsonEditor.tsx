import React, { useCallback } from 'react'
import type {
  AudioEffectDefinition,
  EffectFile,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EffectDocument } from '../lib/types'
import { validateEffect } from '../../../ipcApi'
import { replaceEffectInFile } from '../lib/cueUtils'
import NodeJsonEditor from './NodeJsonEditor'

type EffectDefinition = YargEffectDefinition | AudioEffectDefinition

const validateEffectContent = (file: EffectFile) => validateEffect({ content: file })

type EffectJsonEditorProps = {
  effectDefinition: EffectDefinition
  editorDoc: EffectDocument
  selectedEffectId: string
  onSave: (updatedEffect: EffectDefinition) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** The JSON editor for one effect. */
const EffectJsonEditor: React.FC<EffectJsonEditorProps> = ({
  effectDefinition,
  editorDoc,
  selectedEffectId,
  onSave,
  onCancel,
  onDirtyChange,
}) => {
  const buildFile = useCallback(
    (effect: EffectDefinition): EffectFile =>
      replaceEffectInFile(editorDoc.file, selectedEffectId, effect),
    [editorDoc.file, selectedEffectId],
  )

  return (
    <NodeJsonEditor
      definition={effectDefinition}
      collectionKey="effects"
      selectedId={selectedEffectId}
      buildFile={buildFile}
      validate={validateEffectContent}
      onSave={onSave}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />
  )
}

export default EffectJsonEditor
