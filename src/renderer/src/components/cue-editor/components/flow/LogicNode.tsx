import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { EditorNodeData } from '../../lib/types'
import { FONT_COURIER_NEW } from '../../lib/styles'
import FlowNodeFrame, { NODE_WIDTH_STYLES } from './FlowNodeFrame'
import type {
  LogicNode,
  LogicNodeMeta,
  ValueSource,
  ColorListValueSource,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { LOGIC_NODE_META } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

type LogicType = LogicNode['logicType']
type LogicOf<T extends LogicType> = Extract<LogicNode, { logicType: T }>

const formatValueSource = (value?: ValueSource | ColorListValueSource): string => {
  if (!value) return ''
  if (value.source === 'literal') {
    return `${value.value}`
  }
  return `${value.name}`
}

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={FONT_COURIER_NEW}>{children}</span>
)

/** The variable a node writes its result into, when it has one. */
const AssignTo: React.FC<{ name?: string }> = ({ name }) =>
  name ? (
    <div>
      To Var: <Mono>{name}</Mono>
    </div>
  ) : null

/** One labelled output, as `label → variable`, shown only when the variable is set. */
const Output: React.FC<{ label: string; name?: string }> = ({ label, name }) =>
  name ? (
    <div>
      {label} → <Mono>{name}</Mono>
    </div>
  ) : null

/** A node that works on one source variable: a verb, the variable, then where the result goes. */
const OnSource: React.FC<{ verb: string; source?: string; assignTo?: string }> = ({
  verb,
  source,
  assignTo,
}) => (
  <>
    <div>
      {verb} <Mono>{source || '?'}</Mono>
    </div>
    <AssignTo name={assignTo} />
  </>
)

/** A node that joins several variables: how many, of what, and their names. */
const Concat: React.FC<{ noun: string; sources?: string[]; assignTo?: string }> = ({
  noun,
  sources = [],
  assignTo,
}) => (
  <>
    <div>
      CONCAT <Mono>{sources.length}</Mono> {noun}
    </div>
    {sources.length > 0 && (
      <div>
        <Mono>{sources.join(' + ')}</Mono>
      </div>
    )}
    <AssignTo name={assignTo} />
  </>
)

const MATH_SYMBOLS: Record<string, string> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  modulus: '%',
}

/** The summary each logic type shows under its title. A type with no summary shows its name. */
const DETAILS: { [T in LogicType]?: (logic: LogicOf<T>) => React.ReactNode } = {
  'variable': (logic) => {
    const valueText = formatValueSource(logic.value)
    return (
      <>
        {(logic.mode as string).toUpperCase()} <Mono>{logic.varName}</Mono>
        {valueText && (
          <>
            {' '}
            = <Mono>{valueText}</Mono>
          </>
        )}
      </>
    )
  },
  'math': (logic) => (
    <>
      <div>
        {logic.operator.toUpperCase()}: <Mono>{formatValueSource(logic.left)}</Mono>{' '}
        {MATH_SYMBOLS[logic.operator] ?? logic.operator}{' '}
        <Mono>{formatValueSource(logic.right)}</Mono>
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'expression': (logic) => (
    <>
      <div>
        <Mono>{logic.expression}</Mono>
      </div>
      <div>
        To Var: <Mono>{logic.assignTo}</Mono>
      </div>
    </>
  ),
  'frame-gate': (logic) => (
    <div>
      Every <Mono>{formatValueSource(logic.divisor)}</Mono> frames
    </div>
  ),
  'tempo': (logic) => (
    <>
      <div>TEMPO</div>
      <div>
        beat → <Mono>{logic.assignBeatMs}</Mono>
      </div>
      <Output label="bar" name={logic.assignBarMs} />
      <Output label="phrase" name={logic.assignPhraseMs} />
      <Output label="cycles" name={logic.assignCycles} />
    </>
  ),
  'indexed-variable': (logic) => (
    <>
      <div>
        {(logic.mode as string).toUpperCase()} <Mono>{logic.varName || '?'}</Mono>#
        <Mono>{formatValueSource(logic.index)}</Mono>
      </div>
      {logic.mode === 'get' && <AssignTo name={logic.assignTo} />}
      {logic.mode === 'set' && (
        <div>
          = <Mono>{formatValueSource(logic.value)}</Mono>
        </div>
      )}
    </>
  ),
  'led-changed': (logic) => (
    <>
      <div>LED CHANGED</div>
      <div>
        index → <Mono>{logic.assignIndex}</Mono>
      </div>
      <Output label="colour" name={logic.assignColor} />
      <Output label="edge" name={logic.assignEdge} />
    </>
  ),
  'conditional': (logic) => (
    <>
      IF <Mono>{formatValueSource(logic.left)}</Mono> {logic.comparator}{' '}
      <Mono>{formatValueSource(logic.right)}</Mono>
    </>
  ),
  'cue-data': (logic) => (
    <>
      <div>
        <Mono>{logic.dataProperty}</Mono>
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'config-data': (logic) => (
    <>
      <div>
        Assign: <Mono>{logic.dataProperty}</Mono>
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'lights-from-index': (logic) => (
    <>
      <div>
        <Mono>{logic.sourceVariable || '?'}</Mono>[<Mono>{formatValueSource(logic.index)}</Mono>]
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'color-from-index': (logic) => (
    <>
      <div>
        [<Mono>{formatValueSource(logic.colors) || '?'}</Mono>][
        <Mono>{formatValueSource(logic.index)}</Mono>]
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'reverse-colors': (logic) => (
    <OnSource verb="REVERSE" source={logic.sourceVariable} assignTo={logic.assignTo} />
  ),
  'concat-colors': (logic) => (
    <Concat noun="PALETTES" sources={logic.sourceVariables} assignTo={logic.assignTo} />
  ),
  'shuffle-colors': (logic) => (
    <OnSource verb="SHUFFLE" source={logic.sourceVariable} assignTo={logic.assignTo} />
  ),
  'array-length': (logic) => (
    <OnSource verb="LENGTH OF" source={logic.sourceVariable} assignTo={logic.assignTo} />
  ),
  'reverse-lights': (logic) => (
    <OnSource verb="REVERSE" source={logic.sourceVariable} assignTo={logic.assignTo} />
  ),
  'create-pairs': (logic) => (
    <>
      <div>{(logic.pairType || 'opposite').toUpperCase()} PAIRS</div>
      <div>
        FROM: <Mono>{logic.sourceVariable || '?'}</Mono>
      </div>
      <AssignTo name={logic.assignTo} />
    </>
  ),
  'build-ring': (logic) => (
    <>
      <div>
        Ring → <Mono>{logic.assignTo || '?'}</Mono>
      </div>
      <div>
        Size → <Mono>{logic.assignGroupSize || '?'}</Mono>
      </div>
    </>
  ),
  'concat-lights': (logic) => (
    <Concat noun="ARRAYS" sources={logic.sourceVariables} assignTo={logic.assignTo} />
  ),
  'shuffle-lights': (logic) => (
    <OnSource verb="SHUFFLE" source={logic.sourceVariable} assignTo={logic.assignTo} />
  ),
  'for-each-light': (logic) => {
    const groupSizeText = logic.groupSize ? formatValueSource(logic.groupSize) : ''
    return (
      <>
        <div>
          FOR EACH <Mono>{logic.sourceVariable || '?'}</Mono>
        </div>
        <div>
          Light → <Mono>{logic.currentLightVariable || '?'}</Mono> Index →{' '}
          <Mono>{logic.currentIndexVariable || '?'}</Mono>
        </div>
        <Output label="Group size" name={groupSizeText} />
      </>
    )
  },
  'delay': (logic) => (
    <>
      <Mono>{formatValueSource(logic.delayTime)}</Mono>ms
    </>
  ),
  'random': (logic) => {
    const assignTo = logic.assignTo ?? '?'
    const mode = (logic.mode as string) ?? 'random-integer'
    if (mode === 'random-integer') {
      return (
        <>
          <Mono>int</Mono> [{formatValueSource(logic.min)}..{formatValueSource(logic.max)}] →{' '}
          <Mono>{assignTo}</Mono>
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
      return (
        <>
          <Mono>lights</Mono> from <Mono>{logic.sourceVariable ?? '?'}</Mono> ×
          {formatValueSource(logic.count)} → <Mono>{assignTo}</Mono>
        </>
      )
    }
    return (
      <>
        random → <Mono>{assignTo}</Mono>
      </>
    )
  },
  'debugger': (logic) => {
    const variables = (logic.variablesToLog as string[] | undefined) ?? []
    return (
      <>
        <div>
          Message: <Mono>{formatValueSource(logic.message) || '(empty)'}</Mono>
        </div>
        <div>
          Vars: <Mono>{variables.length > 0 ? variables.join(', ') : 'none'}</Mono>
        </div>
      </>
    )
  },
}

/** The colours of each category: the frame, the title, the summary and the port labels. */
const CATEGORY_STYLES: Record<
  LogicNodeMeta['category'],
  { node: string; title: string; detail: string; handle: string }
> = {
  debug: {
    node: 'border-red-400 bg-red-50 dark:bg-red-900/30',
    title: 'text-red-800 dark:text-red-100',
    detail: 'text-red-900 dark:text-red-50',
    handle: 'text-red-700 dark:text-red-100',
  },
  array: {
    node: 'border-teal-400 bg-teal-50 dark:bg-teal-900/30',
    title: 'text-teal-800 dark:text-teal-100',
    detail: 'text-teal-900 dark:text-teal-50',
    handle: 'text-teal-700 dark:text-teal-100',
  },
  data: {
    node: 'border-orange-800 bg-orange-50 dark:bg-orange-900/30',
    title: 'text-orange-200 dark:text-orange-100',
    detail: 'text-orange-900 dark:text-orange-50',
    handle: 'text-orange-700 dark:text-orange-100',
  },
  general: {
    node: 'border-amber-400 bg-amber-50 dark:bg-amber-900/30',
    title: 'text-amber-800 dark:text-amber-100',
    detail: 'text-amber-900 dark:text-amber-50',
    handle: 'text-amber-700 dark:text-amber-100',
  },
}

/** The two labelled outputs a branching node has, true/false or each/done. */
const PortPair: React.FC<{ ids: [string, string]; labelClass: string }> = ({ ids, labelClass }) => (
  <div className="relative mt-5 h-2">
    {ids.map((portId, i) => (
      <span
        key={portId}
        className={`absolute ${i === 0 ? 'left-[25%]' : 'left-[75%]'} -top-3 translate-x-[-50%] text-[10px] font-semibold uppercase ${labelClass}`}>
        {portId}
      </span>
    ))}
    {ids.map((portId, i) => (
      <Handle
        key={portId}
        type="source"
        id={portId}
        position={Position.Bottom}
        style={{ left: i === 0 ? '25%' : '75%' }}
      />
    ))}
  </div>
)

const LogicNodeComponent: React.FC<NodeProps<EditorNodeData>> = ({ id, data, selected }) => {
  if (data.kind !== 'logic') return null
  const logic = data.payload as LogicNode
  const logicType = logic.logicType
  if (!logicType) return null

  const renderDetails = DETAILS[logicType] as ((logic: LogicNode) => React.ReactNode) | undefined
  const meta = LOGIC_NODE_META[logicType]
  const styles = CATEGORY_STYLES[meta.category] ?? CATEGORY_STYLES.general
  const selectedStyles = selected
    ? 'shadow-[0_0_18px_16px_rgba(59,130,246,0.8)] ring-[5px] ring-blue-400'
    : ''

  return (
    <FlowNodeFrame
      id={id}
      className={`px-3 py-2 rounded-lg border-2 ${NODE_WIDTH_STYLES} ${styles.node} text-xs shadow-sm min-w-[150px] ${selectedStyles}`}>
      <Handle type="target" position={Position.Top} />
      <div className={`font-semibold ${styles.title} text-center`}>{data.label}</div>
      <div className={`text-[11px] ${styles.detail} opacity-90 text-center break-words`}>
        {renderDetails ? renderDetails(logic) : logicType}
      </div>
      {meta.ports === 'true-false' ? (
        <PortPair ids={['true', 'false']} labelClass={styles.handle} />
      ) : meta.ports === 'each-done' ? (
        <PortPair ids={['each', 'done']} labelClass={styles.handle} />
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </FlowNodeFrame>
  )
}

export default LogicNodeComponent
