import React, { useState } from 'react'
import type { EffectMode, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { CueFileField, CueFileModal, GroupIdField, isGroupIdTaken } from './CueFileModal'

type Props = {
  isOpen: boolean
  isEffectMode: boolean
  mode: NodeCueMode | EffectMode
  sourceBasename: string
  defaultGroupId: string
  existingGroupIds: ReadonlySet<string>
  existingFilenamesLower: ReadonlySet<string>
  onCancel: () => void
  onSave: (filename: string, groupId: string) => void
}

function ensureJsonBasename(raw: string): string {
  const stripped = raw.trim().replace(/^.*[/\\]/, '')
  if (!stripped) {
    return 'imported.json'
  }
  return stripped.toLowerCase().endsWith('.json') ? stripped : `${stripped}.json`
}

const ImportCueFileModal: React.FC<Props> = ({
  isOpen,
  isEffectMode,
  mode,
  sourceBasename,
  defaultGroupId,
  existingGroupIds,
  existingFilenamesLower,
  onCancel,
  onSave,
}) => {
  const [filename, setFilename] = useState(() => ensureJsonBasename(sourceBasename))
  const [groupId, setGroupId] = useState(() => defaultGroupId)

  const normalizedFilename = ensureJsonBasename(filename)
  const filenameTaken = existingFilenamesLower.has(normalizedFilename.toLowerCase())
  const groupIdTaken = isGroupIdTaken(groupId, existingGroupIds)
  const fileTypeLabel = isEffectMode ? 'Effect' : 'Cue'

  if (!isOpen) return null

  return (
    <CueFileModal
      title={`Import ${fileTypeLabel} File (${mode.toUpperCase()})`}
      actionLabel="Import"
      canSubmit={Boolean(groupId.trim()) && !filenameTaken && !groupIdTaken}
      onSubmit={() => onSave(normalizedFilename, groupId.trim())}
      onCancel={onCancel}>
      <CueFileField
        label="Save as filename"
        required
        hint="Default is the imported file name. `.json` is added if omitted."
        error={
          filenameTaken &&
          `A ${fileTypeLabel.toLowerCase()} file with this name already exists. Choose a different filename.`
        }>
        {(inputProps) => (
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            spellCheck={false}
            {...inputProps}
          />
        )}
      </CueFileField>

      <GroupIdField
        label={`${fileTypeLabel} group ID`}
        value={groupId}
        onChange={setGroupId}
        taken={groupIdTaken}
        fileKind={fileTypeLabel.toLowerCase()}
        mode={mode}
        hint="A new ID avoids registry conflicts with existing groups. You can edit it before saving."
      />
    </CueFileModal>
  )
}

export default ImportCueFileModal
