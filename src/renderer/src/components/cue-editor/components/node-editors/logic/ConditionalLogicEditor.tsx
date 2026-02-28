import React, { useEffect } from 'react'
import type {
  ConditionalLogicNode,
  LogicComparator,
  ValueSource,
} from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

type ExpectedType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'color'
  | 'cue-type'
  | 'light-array'
  | 'event'
  | 'either'

export interface ConditionalLogicEditorProps extends LogicEditorCommonProps {
  node: ConditionalLogicNode
}

function coerceToExpected(
  val: unknown,
  expected: ExpectedType,
): string | number | boolean | undefined {
  if (expected === 'either') return undefined
  if (expected === 'number') {
    if (typeof val === 'number' && !Number.isNaN(val)) return val
    const n = parseFloat(String(val))
    return Number.isNaN(n) ? 0 : n
  }
  if (expected === 'boolean') {
    if (typeof val === 'boolean') return val
    return val === true || String(val).toLowerCase() === 'true'
  }
  if (
    expected === 'string' ||
    expected === 'color' ||
    expected === 'event' ||
    expected === 'cue-type'
  ) {
    return String(val ?? '')
  }
  if (expected === 'light-array') return undefined
  return undefined
}

const ConditionalLogicEditor: React.FC<ConditionalLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const inferExpected = (otherSide: ValueSource | undefined): ExpectedType => {
    if (!otherSide || otherSide.source !== 'variable') return 'either'
    const varDef = availableVariables.find((v) => v.name === otherSide.name)
    if (!varDef) return 'either'
    const t = varDef.type
    if (
      t === 'number' ||
      t === 'boolean' ||
      t === 'string' ||
      t === 'color' ||
      t === 'cue-type' ||
      t === 'light-array' ||
      t === 'event'
    ) {
      return t
    }
    return 'either'
  }

  const expectedLeft = inferExpected(node.right)
  const expectedRight = inferExpected(node.left)

  useEffect(() => {
    if (node.left?.source === 'literal' && node.left.value !== undefined) {
      const coerced = coerceToExpected(node.left.value, expectedLeft)
      if (coerced !== undefined && coerced !== node.left.value) {
        updateNode({ left: { ...node.left, value: coerced } })
      }
    }
    if (node.right?.source === 'literal' && node.right.value !== undefined) {
      const coerced = coerceToExpected(node.right.value, expectedRight)
      if (coerced !== undefined && coerced !== node.right.value) {
        updateNode({ right: { ...node.right, value: coerced } })
      }
    }
  }, [node.left, node.right, expectedLeft, expectedRight, updateNode])

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Comparator
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.comparator}
          onChange={(event) => updateNode({ comparator: event.target.value as LogicComparator })}>
          <option value=">">&gt;</option>
          <option value=">=">&gt;=</option>
          <option value="<">&lt;</option>
          <option value="<=">&lt;=</option>
          <option value="==">==</option>
          <option value="!=">!=</option>
        </select>
      </label>
      <ValueSourceEditor
        label="Left"
        value={node.left}
        onChange={(next) => updateNode({ left: next })}
        availableVariables={availableVariables}
        expected={expectedLeft}
      />
      <ValueSourceEditor
        label="Right"
        value={node.right}
        onChange={(next) => updateNode({ right: next })}
        availableVariables={availableVariables}
        expected={expectedRight}
      />
      <p className="text-[10px] text-gray-500">
        First outgoing edge becomes TRUE branch, second becomes FALSE.
      </p>
    </div>
  )
}

export default ConditionalLogicEditor
