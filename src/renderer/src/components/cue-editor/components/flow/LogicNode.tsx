import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import FlowNodeFrame from './FlowNodeFrame'
import type {
  ForEachLightLogicNode,
  LogicNode,
  ValueSource,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

const formatValueSource = (value?: ValueSource): string => {
  if (!value) return ''
  if (value.source === 'literal') {
    return `${value.value}`
  }
  return `${value.name}`
}

const LogicNodeComponent: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  if (data.kind !== 'logic') return null
  const logic = data.payload as LogicNode
  const logicType = logic.logicType
  if (!logicType) return null

  const Mono = ({ children }: { children: React.ReactNode }) => (
    <span style={FONT_COURIER_NEW}>{children}</span>
  )

  const renderDetails = (): React.ReactNode => {
    if (logicType === 'variable') {
      const valueText = formatValueSource(logic.value)
      const mode = (logic.mode as string).toUpperCase()
      return valueText ? (
        <>
          {mode} <Mono>{logic.varName}</Mono> = <Mono>{valueText}</Mono>
        </>
      ) : (
        <>
          {mode} <Mono>{logic.varName}</Mono>
        </>
      )
    }
    if (logicType === 'math') {
      const left = formatValueSource(logic.left)
      const right = formatValueSource(logic.right)
      const operatorSymbol =
        logic.operator === 'add'
          ? '+'
          : logic.operator === 'subtract'
            ? '-'
            : logic.operator === 'multiply'
              ? '*'
              : logic.operator === 'divide'
                ? '/'
                : logic.operator === 'modulus'
                  ? '%'
                  : logic.operator
      return (
        <>
          <div>
            {logic.operator.toUpperCase()}: <Mono>{left}</Mono> {operatorSymbol}{' '}
            <Mono>{right}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'conditional') {
      const left = formatValueSource(logic.left)
      const right = formatValueSource(logic.right)
      return (
        <>
          IF <Mono>{left}</Mono> {logic.comparator} <Mono>{right}</Mono>
        </>
      )
    }
    if (logicType === 'cue-data') {
      return (
        <>
          <div>
            <Mono>{logic.dataProperty}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'config-data') {
      return (
        <>
          <div>
            Assign: <Mono>{logic.dataProperty}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'lights-from-index') {
      const indexText = formatValueSource(logic.index)
      return (
        <>
          <div>
            <Mono>{logic.sourceVariable || '?'}</Mono>[<Mono>{indexText}</Mono>]
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'array-length') {
      return (
        <>
          <div>
            LENGTH OF <Mono>{logic.sourceVariable || '?'}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'reverse-lights') {
      return (
        <>
          <div>
            REVERSE <Mono>{logic.sourceVariable || '?'}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'create-pairs') {
      return (
        <>
          <div>{(logic.pairType || 'opposite').toUpperCase()} PAIRS</div>
          <div>
            FROM: <Mono>{logic.sourceVariable || '?'}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'concat-lights') {
      const vars = logic.sourceVariables || []
      return (
        <>
          <div>
            CONCAT <Mono>{vars.length}</Mono> ARRAYS
          </div>
          {vars.length > 0 && (
            <div>
              <Mono>{vars.join(' + ')}</Mono>
            </div>
          )}
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'shuffle-lights') {
      return (
        <>
          <div>
            SHUFFLE <Mono>{logic.sourceVariable || '?'}</Mono>
          </div>
          {logic.assignTo && (
            <div>
              To Var: <Mono>{logic.assignTo}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'for-each-light') {
      const groupSize = (logic as ForEachLightLogicNode).groupSize
      const groupSizeText = groupSize ? formatValueSource(groupSize) : ''
      return (
        <>
          <div>
            FOR EACH <Mono>{logic.sourceVariable || '?'}</Mono>
          </div>
          <div>
            Light → <Mono>{logic.currentLightVariable || '?'}</Mono> Index →{' '}
            <Mono>{logic.currentIndexVariable || '?'}</Mono>
          </div>
          {groupSizeText && (
            <div>
              Group size → <Mono>{groupSizeText}</Mono>
            </div>
          )}
        </>
      )
    }
    if (logicType === 'delay') {
      const delayTime = formatValueSource(logic.delayTime)
      return (
        <>
          <Mono>{delayTime}</Mono>ms
        </>
      )
    }
    if (logicType === 'random') {
      const mode = (logic.mode as string) ?? 'random-integer'
      const assignTo = logic.assignTo ?? '?'
      if (mode === 'random-integer') {
        const min = formatValueSource(logic.min)
        const max = formatValueSource(logic.max)
        return (
          <>
            <Mono>int</Mono> [{min}..{max}] → <Mono>{assignTo}</Mono>
          </>
        )
      }
      if (mode === 'random-choice') {
        const n = (logic.choices as string[] | undefined)?.length ?? 0
        return (
          <>
            <Mono>choice</Mono> ({n} options) → <Mono>{assignTo}</Mono>
          </>
        )
      }
      if (mode === 'random-light') {
        const count = formatValueSource(logic.count)
        return (
          <>
            <Mono>lights</Mono> from <Mono>{logic.sourceVariable ?? '?'}</Mono> ×{count} →{' '}
            <Mono>{assignTo}</Mono>
          </>
        )
      }
      return (
        <>
          random → <Mono>{assignTo}</Mono>
        </>
      )
    }
    if (logicType === 'debugger') {
      const messageText = formatValueSource(logic.message)
      const variables = (logic.variablesToLog as string[] | undefined) ?? []
      return (
        <>
          <div>
            Message: <Mono>{messageText || '(empty)'}</Mono>
          </div>
          <div>
            Vars: <Mono>{variables.length > 0 ? variables.join(', ') : 'none'}</Mono>
          </div>
        </>
      )
    }
    return logicType
  }

  const isConditional = logicType === 'conditional'
  const isForEachLight = logicType === 'for-each-light'
  const isDataNode = logicType === 'cue-data' || logicType === 'config-data'
  const isArrayNode =
    logicType === 'array-length' ||
    logicType === 'reverse-lights' ||
    logicType === 'create-pairs' ||
    logicType === 'concat-lights' ||
    logicType === 'shuffle-lights' ||
    logicType === 'for-each-light'
  const isDebugNode = logicType === 'debugger'

  const nodeStyles = isDebugNode
    ? 'border-red-400 bg-red-50 dark:bg-red-900/30 text-xs shadow-sm min-w-[150px]'
    : isArrayNode
      ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-xs shadow-sm min-w-[150px]'
      : isDataNode
        ? 'border-orange-800 bg-orange-50 dark:bg-orange-900/30 text-xs shadow-sm min-w-[150px]'
        : 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-xs shadow-sm min-w-[150px]'

  const titleStyles = isDebugNode
    ? 'font-semibold text-red-800 dark:text-red-100 text-center'
    : isArrayNode
      ? 'font-semibold text-teal-800 dark:text-teal-100 text-center'
      : isDataNode
        ? 'font-semibold text-orange-200 dark:text-orange-100 text-center'
        : 'font-semibold text-amber-800 dark:text-amber-100 text-center'

  const detailStyles = isDebugNode
    ? 'text-[11px] text-red-900 dark:text-red-50 opacity-90 text-center'
    : isArrayNode
      ? 'text-[11px] text-teal-900 dark:text-teal-50 opacity-90 text-center'
      : isDataNode
        ? 'text-[11px] text-orange-900 dark:text-orange-50 opacity-90 text-center'
        : 'text-[11px] text-amber-900 dark:text-amber-50 opacity-90 text-center'

  const handleStyles = isDebugNode
    ? 'text-red-700 dark:text-red-100'
    : isArrayNode
      ? 'text-teal-700 dark:text-teal-100'
      : isDataNode
        ? 'text-orange-700 dark:text-orange-100'
        : 'text-amber-700 dark:text-amber-100'

  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''

  return (
    <FlowNodeFrame
      id={id}
      className={`px-3 py-2 rounded-lg border-2 ${nodeStyles} ${selectedStyles}`}>
      <Handle type="target" position={Position.Top} />
      <div className={titleStyles}>{data.label}</div>
      <div className={detailStyles}>{renderDetails()}</div>
      {isConditional ? (
        <div className="relative mt-5 h-2">
          <span
            className={`absolute left-[25%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase ${handleStyles}`}>
            true
          </span>
          <span
            className={`absolute left-[75%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase ${handleStyles}`}>
            false
          </span>
          <Handle type="source" id="true" position={Position.Bottom} style={{ left: '25%' }} />
          <Handle type="source" id="false" position={Position.Bottom} style={{ left: '75%' }} />
        </div>
      ) : isForEachLight ? (
        <div className="relative mt-5 h-2">
          <span
            className={`absolute left-[25%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase ${handleStyles}`}>
            each
          </span>
          <span
            className={`absolute left-[75%] -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase ${handleStyles}`}>
            done
          </span>
          <Handle type="source" id="each" position={Position.Bottom} style={{ left: '25%' }} />
          <Handle type="source" id="done" position={Position.Bottom} style={{ left: '75%' }} />
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </FlowNodeFrame>
  )
}

export default LogicNodeComponent
