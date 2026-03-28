import React from 'react'
import type {
  RandomLogicNode,
  RandomMode,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface RandomLogicEditorProps extends LogicEditorCommonProps {
  node: RandomLogicNode
}

const RandomLogicEditor: React.FC<RandomLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const mode = node.mode ?? 'random-integer'
  const choices = node.choices ?? []
  const lightArrayVars = availableVariables.filter((v) => v.type === 'light-array')
  const assignToVars = availableVariables

  const addChoice = (value: string) => {
    if (value && !choices.includes(value)) {
      updateNode({ choices: [...choices, value] })
    }
  }
  const removeChoice = (index: number) => {
    const next = [...choices]
    next.splice(index, 1)
    updateNode({ choices: next })
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Mode
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={mode}
          onChange={(e) => updateNode({ mode: e.target.value as RandomMode })}>
          <option value="random-integer">Random Integer (min..max)</option>
          <option value="random-choice">Random Choice (from list)</option>
          <option value="random-light">Random Lights (pick N from array)</option>
        </select>
      </label>
      {mode === 'random-integer' && (
        <>
          <ValueSourceEditor
            label="Min (inclusive)"
            value={node.min}
            onChange={(next) => updateNode({ min: next })}
            expected="number"
            availableVariables={availableVariables}
          />
          <ValueSourceEditor
            label="Max (inclusive)"
            value={node.max}
            onChange={(next) => updateNode({ max: next })}
            expected="number"
            availableVariables={availableVariables}
          />
        </>
      )}
      {mode === 'random-choice' && (
        <div className="space-y-1">
          <span className="font-medium">Choices (one will be picked at random)</span>
          <div className="space-y-1">
            {(choices as string[]).map((choice, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                  {choice}
                </span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 px-1"
                  onClick={() => removeChoice(index)}>
                  ×
                </button>
              </div>
            ))}
            <input
              type="text"
              className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              placeholder="Add choice and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = (e.target as HTMLInputElement).value.trim()
                  if (value) {
                    addChoice(value)
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }
              }}
            />
          </div>
        </div>
      )}
      {mode === 'random-light' && (
        <>
          <label className="flex flex-col font-medium">
            Source Variable (light-array)
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={node.sourceVariable ?? ''}
              onChange={(e) => updateNode({ sourceVariable: e.target.value || undefined })}>
              <option value="">-- Select light-array --</option>
              {lightArrayVars.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.scope})
                </option>
              ))}
            </select>
          </label>
          <ValueSourceEditor
            label="Count (number of lights to pick)"
            value={node.count}
            onChange={(next) => updateNode({ count: next })}
            expected="number"
            availableVariables={availableVariables}
          />
        </>
      )}
      <label className="flex flex-col font-medium">
        Assign To
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={(e) => updateNode({ assignTo: e.target.value })}>
          <option value="">-- Select variable --</option>
          {assignToVars.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-gray-500 italic">
        {mode === 'random-integer' && 'Random integer in [min, max] (inclusive).'}
        {mode === 'random-choice' && 'Picks one string from the list at random.'}
        {mode === 'random-light' && 'Picks count lights at random from the source array.'}
      </p>
    </div>
  )
}

export default RandomLogicEditor
