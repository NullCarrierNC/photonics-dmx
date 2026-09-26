import React from 'react'
import type {
  EffectRaiserNode,
  EffectDefinition,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  isNumberRule,
  literalChoices,
  parameterRules,
  raiserParameterIssue,
} from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import type { LiteralRule } from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import ValueSourceEditor from '../shared/ValueSourceEditor'
import KnownValueSelect from '../shared/KnownValueSelect'

interface EffectRaiserEditorProps {
  node: EffectRaiserNode
  availableEffects: { id: string; name: string; definition?: EffectDefinition }[]
  availableVariables: { name: string; type: string; scope: 'cue' | 'cue-group' }[]
  updateNode: (updates: Partial<EffectRaiserNode>) => void
  /** When set, enables built-in event-option fallback for params with type "event". */
  activeMode?: NodeCueMode
}

const EffectRaiserEditor: React.FC<EffectRaiserEditorProps> = ({
  node,
  availableEffects,
  availableVariables,
  updateNode,
  activeMode,
}) => {
  const selectedEffect = availableEffects.find((e) => e.id === node.effectId)
  const parameterVars = selectedEffect?.definition?.variables?.filter((v) => v.isParameter) ?? []
  const effectActions = selectedEffect?.definition?.nodes?.actions ?? []

  return (
    <div className="space-y-2 text-xs">
      <KnownValueSelect
        label="Select Effect"
        value={node.effectId || ''}
        options={availableEffects.map((effect) => ({ value: effect.id, label: effect.name }))}
        onChange={(effectId) => updateNode({ effectId })}
        placeholder="-- Choose an effect --"
      />
      {availableEffects.length === 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          No effects imported. Go to the Effects tab to import effects.
        </p>
      )}
      <p className="text-[10px] text-gray-500">
        Triggers the selected effect. Configure parameter values below.
      </p>

      <label className="flex items-center gap-2 font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={node.isPersistent ?? false}
          onChange={(e) => updateNode({ isPersistent: e.target.checked })}
          className="rounded"
        />
        Persistent (loop)
      </label>
      <p className="text-[10px] text-gray-500">
        When enabled, the effect automatically re-triggers when it completes.
      </p>

      {/* Parameter Values Configuration */}
      {parameterVars.length === 0 ? (
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded text-[10px] text-gray-500">
          This effect has no parameters defined.
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t pt-2">
          <div className="font-semibold text-xs">Parameter Values</div>
          {parameterVars.map((param) => {
            const currentValue = node.parameterValues?.[param.name]
            const integerOnly = param.type === 'number' && param.name === 'paramLayer'
            // The choices of the first rule the parameter meets that has a list of its own.
            const listedRule = parameterRules(param, effectActions).find(
              (rule): rule is LiteralRule => !isNumberRule(rule) && rule !== 'groups',
            )
            const validLiterals =
              param.validValues ?? (listedRule ? literalChoices(listedRule, activeMode) : undefined)
            const issue = raiserParameterIssue(param, currentValue, {
              effectActions,
              variables: availableVariables,
              mode: activeMode,
            })
            return (
              <div key={param.name} className="space-y-1">
                <ValueSourceEditor
                  label={`${param.name} (${param.type})`}
                  value={currentValue}
                  onChange={(newValue) => {
                    const updatedValues = { ...(node.parameterValues ?? {}) }
                    updatedValues[param.name] = newValue
                    updateNode({ parameterValues: updatedValues })
                  }}
                  expected={
                    param.type as
                      | 'number'
                      | 'boolean'
                      | 'string'
                      | 'color'
                      | 'cue-type'
                      | 'light-array'
                      | 'color-array'
                      | 'event'
                  }
                  validLiterals={validLiterals}
                  issue={issue}
                  activeMode={activeMode}
                  integerOnly={integerOnly}
                  availableVariables={availableVariables}
                />
                {param.description && (
                  <div className="text-[10px] text-gray-500 italic">{param.description}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default EffectRaiserEditor
