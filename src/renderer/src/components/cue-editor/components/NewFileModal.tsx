import React, { useState } from 'react'
import type { NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { CueFileField, CueFileModal, GroupIdField, isGroupIdTaken } from './CueFileModal'

type Props = {
  isOpen: boolean
  isEffectMode: boolean
  mode: NodeCueMode
  /** Lowercase group IDs already used for this mode (yarg vs audio) and document kind (cue vs effect). */
  existingGroupIds: ReadonlySet<string>
  onCancel: () => void
  onSave: (metadata: {
    groupId: string
    groupName: string
    groupDescription: string
    itemName: string
    itemDescription: string
  }) => void
}

const NewFileModal: React.FC<Props> = ({
  isOpen,
  isEffectMode,
  mode,
  existingGroupIds,
  onCancel,
  onSave,
}) => {
  const [groupId, setGroupId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemDescription, setItemDescription] = useState('')

  const fileTypeLabel = isEffectMode ? 'Effect' : 'Cue'
  const groupLabel = isEffectMode ? 'Effect Group' : 'Cue Group'
  const groupIdTaken = isGroupIdTaken(groupId, existingGroupIds)
  const complete = Boolean(groupId.trim() && groupName.trim() && itemName.trim())

  if (!isOpen) return null

  return (
    <CueFileModal
      title={`Create New ${fileTypeLabel} File (${mode.toUpperCase()})`}
      actionLabel="Save"
      canSubmit={complete && !groupIdTaken}
      onSubmit={() => onSave({ groupId, groupName, groupDescription, itemName, itemDescription })}
      onCancel={onCancel}>
      <GroupIdField
        label={`${groupLabel} ID`}
        value={groupId}
        onChange={setGroupId}
        taken={groupIdTaken}
        fileKind={fileTypeLabel.toLowerCase()}
        mode={mode}
        hint="Used as the filename (e.g., my-custom-effects.json)"
        autoFocus
      />

      <CueFileField label={`${groupLabel} Name`} required>
        {(inputProps) => (
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g., My Custom Effects"
            {...inputProps}
          />
        )}
      </CueFileField>

      <CueFileField label={`${groupLabel} Description`}>
        {(inputProps) => (
          <textarea
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            placeholder={`Description of this ${groupLabel.toLowerCase()}`}
            rows={2}
            {...inputProps}
          />
        )}
      </CueFileField>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <CueFileField label={`First ${fileTypeLabel} Name`} required>
          {(inputProps) => (
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder={`e.g., My First ${fileTypeLabel}`}
              {...inputProps}
            />
          )}
        </CueFileField>
      </div>

      <CueFileField label={`First ${fileTypeLabel} Description`}>
        {(inputProps) => (
          <textarea
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder={`Description of this ${fileTypeLabel.toLowerCase()}`}
            rows={2}
            {...inputProps}
          />
        )}
      </CueFileField>
    </CueFileModal>
  )
}

export default NewFileModal
