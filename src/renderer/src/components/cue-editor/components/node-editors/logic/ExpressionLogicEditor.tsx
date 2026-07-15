import React from 'react'
import type { ExpressionLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { compileExpression } from '../../../../../../../photonics-dmx/cues/node/runtime/expressionEvaluator'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface ExpressionLogicEditorProps extends LogicEditorCommonProps {
  node: ExpressionLogicNode
}

/** One arithmetic formula over variables, replacing a chain of math nodes. Live-validates the expression
 *  and flags any referenced variable that isn't declared in scope. */
const ExpressionLogicEditor: React.FC<ExpressionLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const declared = new Set(availableVariables.map((v) => v.name))
  let parseError: string | null = null
  let unknownVars: string[] = []
  try {
    const compiled = compileExpression(node.expression)
    unknownVars = compiled.variables.filter((v) => !declared.has(v))
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Expression
        <input
          type="text"
          className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.expression}
          spellCheck={false}
          onChange={(event) => updateNode({ expression: event.target.value })}
          placeholder="e.g. a + (b - a) * t"
        />
      </label>
      <p className="text-[10px] text-gray-500">
        Numbers, variables, + - * / %, parentheses, and
        min/max/clamp/wrap/abs/floor/ceil/round/sign/sqrt/pow/sin/cos + pi.
      </p>
      {parseError && (
        <p className="text-[10px] text-red-600 dark:text-red-400">Parse error: {parseError}</p>
      )}
      {!parseError && unknownVars.length > 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Not declared in scope (reads as 0): {unknownVars.join(', ')}
        </p>
      )}
      <label className="flex flex-col font-medium">
        Assign To
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo}
          onChange={(event) => updateNode({ assignTo: event.target.value })}>
          <option value="">-- select variable --</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default ExpressionLogicEditor
