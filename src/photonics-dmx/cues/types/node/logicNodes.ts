/**
 * Every logic node kind, and the editor metadata describing them.
 */
import type { ValueSource, VariableType } from './variables'
import {
  ALL_CONFIG_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
  NET_CUE_DATA_PROPERTIES,
} from '../../../constants/nodeConstants'

export type LogicComparator = '>' | '>=' | '<' | '<=' | '==' | '!='
export type MathOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulus' | 'wrap'

export interface BaseLogicNode {
  id: string
  type: 'logic'
  label?: string
  outputs?: string[]
}

/** One target of a multi-set variable node. Same shape as the single-var fields, one per variable. */
export interface VariableAssignment {
  varName: string
  valueType: VariableType
  value?: ValueSource
}

export interface VariableLogicNode extends BaseLogicNode {
  logicType: 'variable'
  mode: 'set' | 'get' | 'init'
  varName: string
  valueType: VariableType
  value?: ValueSource
  // When present and non-empty, set/init every listed variable in order (honouring `mode`), instead of the
  // single varName/valueType/value above. Collapses a run of set nodes (e.g. a transparent-clear pair) into one.
  assignments?: VariableAssignment[]
}

export interface MathLogicNode extends BaseLogicNode {
  logicType: 'math'
  operator: MathOperator
  left: ValueSource
  right: ValueSource
  assignTo?: string
}

export interface ClampLogicNode extends BaseLogicNode {
  logicType: 'clamp'
  value: ValueSource
  min: ValueSource
  max: ValueSource
  assignTo: string
}

export interface ExpressionLogicNode extends BaseLogicNode {
  logicType: 'expression'
  // A single arithmetic formula over variables: numbers, the five operators (+ - * / %), parentheses,
  // unary minus, and built-in functions (min/max/clamp/wrap/abs/floor/ceil/round/sign/sqrt/pow/sin/cos)
  // plus the `pi` constant. Any other identifier is a variable resolved from the cue's variable store.
  // Replaces a chain of math nodes with one readable line. Result is written to `assignTo` (type number).
  expression: string
  assignTo: string
}

export interface SelectFromListLogicNode extends BaseLogicNode {
  logicType: 'select-from-list'
  list: number[] // Inline numeric list to select from
  index: ValueSource // Index into the list (with wraparound modulo list length)
  assignTo: string // Variable written with type 'number'
}

export interface PulseLogicNode extends BaseLogicNode {
  logicType: 'pulse'
  interval: ValueSource // Cycle length in ms (e.g. beat-duration-ms, optionally divided); guarded to >= 1
  anchorVar: string // Declared number var holding the cycle origin; captured on the first eval of the
  //                   activation and reset with cue-level vars on cue-started, so the phase is
  //                   activation-relative.
  assignTo: string // Declared number var written with the monotonic integer cycle index
  assignPhase?: string // Optional declared number var written with the fractional phase in [0, 1)
}

export interface ConditionalLogicNode extends BaseLogicNode {
  logicType: 'conditional'
  comparator: LogicComparator
  left: ValueSource
  right: ValueSource
}

export interface FrameGateLogicNode extends BaseLogicNode {
  logicType: 'frame-gate'
  // Fires the `true` port every `divisor`-th time this node is reached and the `false` port otherwise,
  // using an internal per-node counter that resets each activation. Collapses the count++ / modulus /
  // conditional trio a frame-rate strobe or self-driven step gate would otherwise need. divisor is
  // guarded to >= 1.
  divisor: ValueSource
}

export interface TempoLogicNode extends BaseLogicNode {
  logicType: 'tempo'
  // Reads the song tempo (beat-duration-ms / bpm cue data) and writes the derived timing variables that
  // tempo-locked tweens breathe on, replacing the ~12-node read/guard/clamp/multiply/band chain every cue
  // repeats. A song that reports no tempo (menus, practice) falls back to `fallbackBeatMs` before clamping.
  assignBeatMs: string // Declared number var written with the clamped beat duration in ms
  assignBarMs?: string // Optional: beat * beatsPerBar
  assignPhraseMs?: string // Optional: bar * barsPerPhrase
  beatsPerBar?: ValueSource // Beats per bar (default 4)
  barsPerPhrase?: ValueSource // Bars per phrase (default 2)
  minBeatMs?: ValueSource // Clamp floor for the beat (default 250)
  maxBeatMs?: ValueSource // Clamp ceil for the beat (default 1000)
  fallbackBeatMs?: ValueSource // Beat used when the song reports no tempo (default 461, ~130 BPM)
  assignCycles?: string // Optional: number var written with a BPM-banded cycle count
  cycleBands?: number[] // Ascending BPM thresholds for the cycle count (default [110, 150])
  cycleValues?: number[] // Cycle count per band, length = cycleBands.length + 1 (default [2, 3, 5])
}

/** Default values the tempo node uses for its optional fields, shared by the runtime and the editor so the
 *  two never disagree about what "unset" means. */
export const TEMPO_DEFAULTS = {
  beatsPerBar: 4,
  barsPerPhrase: 2,
  minBeatMs: 250,
  maxBeatMs: 1000,
  fallbackBeatMs: 461,
  cycleBands: [110, 150],
  cycleValues: [2, 3, 5],
} as const

// YARG Cue Data Properties - derived from shared constants
export type NetCueDataProperty = (typeof NET_CUE_DATA_PROPERTIES)[number]

// Audio Cue Data Properties - derived from shared constants
export type AudioCueDataProperty = (typeof AUDIO_CUE_DATA_PROPERTIES)[number]

export type CueDataProperty = NetCueDataProperty | AudioCueDataProperty

// Config Data Properties - derived from shared constants
export type ConfigDataProperty = (typeof ALL_CONFIG_DATA_PROPERTIES)[number]

export interface CueDataLogicNode extends BaseLogicNode {
  logicType: 'cue-data'
  dataProperty: CueDataProperty
  assignTo?: string
}

export interface ConfigDataLogicNode extends BaseLogicNode {
  logicType: 'config-data'
  dataProperty: ConfigDataProperty
  assignTo?: string
}

export interface LightsFromIndexLogicNode extends BaseLogicNode {
  logicType: 'lights-from-index'
  sourceVariable: string // Name of the light-array variable
  index: ValueSource // Index to extract (with wraparound)
  assignTo: string // Variable to assign the single light to
}

export interface ColorFromIndexLogicNode extends BaseLogicNode {
  logicType: 'color-from-index'
  colors: ValueSource // Palette: inline literal Color[] (enum-validated) or a color-array variable
  index: ValueSource // Index into the palette (with wraparound modulo palette length)
  assignTo: string // Variable written with type 'color'
}

export interface ReverseColorsLogicNode extends BaseLogicNode {
  logicType: 'reverse-colors'
  sourceVariable: string // Name of color-array variable
  assignTo: string // Variable to store reversed color-array
}

export interface ConcatColorsLogicNode extends BaseLogicNode {
  logicType: 'concat-colors'
  sourceVariables: string[] // Names of color-array variables to concatenate
  assignTo: string // Variable to store concatenated color-array
}

export interface ShuffleColorsLogicNode extends BaseLogicNode {
  logicType: 'shuffle-colors'
  sourceVariable: string // color-array to shuffle
  assignTo: string // shuffled copy
}

export interface ArrayLengthLogicNode extends BaseLogicNode {
  logicType: 'array-length'
  sourceVariable: string // Name of light-array variable
  assignTo: string // Variable to store count
}

export interface ReverseLightsLogicNode extends BaseLogicNode {
  logicType: 'reverse-lights'
  sourceVariable: string // Name of light-array variable
  assignTo: string // Variable to store reversed array
}

export type CreatePairsType = 'opposite' | 'diagonal'

export interface CreatePairsLogicNode extends BaseLogicNode {
  logicType: 'create-pairs'
  pairType: CreatePairsType // Type of pair grouping
  sourceVariable: string // Name of light-array variable
  assignTo: string // Variable to store paired lights (flattened)
}

export interface ConcatLightsLogicNode extends BaseLogicNode {
  logicType: 'concat-lights'
  sourceVariables: string[] // Names of light-array variables to concatenate
  assignTo: string // Variable to store concatenated array
}

export interface BuildRingLogicNode extends BaseLogicNode {
  logicType: 'build-ring'
  assignTo: string // Variable to store the virtual ring (light-array)
  assignGroupSize: string // Variable to store the ring group size (number)
}

export interface DelayLogicNode extends BaseLogicNode {
  logicType: 'delay'
  delayTime: ValueSource // Delay time in milliseconds
}

export interface DebuggerLogicNode extends BaseLogicNode {
  logicType: 'debugger'
  message: ValueSource // Message to log
  variablesToLog: string[] // List of variable names to log with their values
}

export type RandomMode = 'random-integer' | 'random-choice' | 'random-light'

/** One roll of a multi-roll random node. Structurally a RandomLogicNode minus the node envelope, so the
 *  node itself satisfies this shape and legacy single-roll nodes read as a one-element list. */
export interface RandomRoll {
  mode: RandomMode
  min?: ValueSource // random-integer: inclusive min
  max?: ValueSource // random-integer: inclusive max
  choices?: string[] // random-choice: list of string options
  sourceVariable?: string // random-light: light-array variable name
  count?: ValueSource // random-light: number of lights to pick
  assignTo: string // variable to store result
}

export interface RandomLogicNode extends BaseLogicNode {
  logicType: 'random'
  mode: RandomMode
  min?: ValueSource // random-integer: inclusive min
  max?: ValueSource // random-integer: inclusive max
  choices?: string[] // random-choice: list of string options
  sourceVariable?: string // random-light: light-array variable name
  count?: ValueSource // random-light: number of lights to pick
  assignTo: string // variable to store result
  // When present and non-empty, perform each roll in order instead of the single roll above. Collapses a
  // run of random nodes (e.g. strobe x/y/rotation, or preset + duration) into one node.
  rolls?: RandomRoll[]
}

export interface ShuffleLightsLogicNode extends BaseLogicNode {
  logicType: 'shuffle-lights'
  sourceVariable: string // light-array to shuffle
  assignTo: string // shuffled copy
}

export interface ForEachLightLogicNode extends BaseLogicNode {
  logicType: 'for-each-light'
  sourceVariable: string // light-array to iterate
  currentLightVariable: string // variable set to current TrackedLight[] (single light or group)
  currentIndexVariable: string // variable set to current index (number)
  /** When set, iterate in chunks of this many lights (literal or variable). Omit for one light per iteration. */
  groupSize?: ValueSource
}

export interface IndexedVariableLogicNode extends BaseLogicNode {
  logicType: 'indexed-variable'
  // Read or write one slot of a variable family stored as `${varName}#${index}`. Gives a cue a small
  // per-position array (e.g. a `lit#i` latch per StageKit LED) without declaring eight separate variables.
  // The slot lives in the same scope (cue vs cue-group) as the base `varName`, so it clears on activation.
  mode: 'get' | 'set'
  varName: string // base family name
  index: ValueSource // which slot of the family
  valueType: VariableType // the family's element type (set: type written; get: type of the empty-slot zero)
  value?: ValueSource // set: value written to the slot
  assignTo?: string // get: variable the slot's value is read into
}

export interface LedChangedLogicNode extends BaseLogicNode {
  logicType: 'led-changed'
  // A fan-out over the StageKit LED positions (0..7) whose colour changed since the previous frame. Runs
  // the `each` branch once per changed position, seeding the position index / new colour / edge, then the
  // `done` branch. Collapses the eight per-LED led-N event lanes an RB3 gameplay cue repeats into one.
  assignIndex: string // number var: the 0-based position that changed
  assignColor?: string // color var: the position's new colour (ledColorAt), 'transparent' when it turned off
  assignEdge?: string // string var: 'on' (off→lit), 'off' (lit→off), or 'color' (stayed lit, banks changed)
}

export type LogicNode =
  | VariableLogicNode
  | MathLogicNode
  | ClampLogicNode
  | ExpressionLogicNode
  | SelectFromListLogicNode
  | PulseLogicNode
  | ConditionalLogicNode
  | FrameGateLogicNode
  | TempoLogicNode
  | CueDataLogicNode
  | ConfigDataLogicNode
  | LightsFromIndexLogicNode
  | ColorFromIndexLogicNode
  | ReverseColorsLogicNode
  | ConcatColorsLogicNode
  | ShuffleColorsLogicNode
  | ArrayLengthLogicNode
  | ReverseLightsLogicNode
  | CreatePairsLogicNode
  | ConcatLightsLogicNode
  | BuildRingLogicNode
  | DelayLogicNode
  | DebuggerLogicNode
  | RandomLogicNode
  | ShuffleLightsLogicNode
  | ForEachLightLogicNode
  | IndexedVariableLogicNode
  | LedChangedLogicNode

/** Presentation + wiring metadata for one logic node type. Plain data only (labels, semantic category and
 *  port shape) so the main process can share it, and the renderer maps `category` to its own colours. */
export interface LogicNodeMeta {
  /** Human label shown on palette buttons, the canvas, and menus. */
  label: string
  /** Colour/grouping bucket in the editor. */
  category: 'general' | 'array' | 'data' | 'debug'
  /** Output port shape: one plain out, a conditional true/false pair, or a fan-out each/done pair. */
  ports: 'single' | 'true-false' | 'each-done'
  /** Nodes that need an engine-stepped path and are inert under level mode / an audio "during" context. */
  timing?: true
}

// Canonical metadata for every logic node type, the sibling of NODE_EFFECT_TYPES. The Record keeps it
// exhaustive: adding a member to the LogicNode union without listing it here is a compile error, and an
// unknown key is rejected by excess-property checking. Insertion order is the editor palette order, and
// every consumer (palette, canvas, pane menu, drag parser, level-mode check, layout) derives from this so
// nobody hand-maintains a second copy that can silently drift.
export const LOGIC_NODE_META: Record<LogicNode['logicType'], LogicNodeMeta> = {
  'config-data': { label: 'Config Data', category: 'data', ports: 'single' },
  'cue-data': { label: 'Cue Data', category: 'data', ports: 'single' },
  'conditional': { label: 'Conditional', category: 'general', ports: 'true-false' },
  'delay': { label: 'Delay', category: 'general', ports: 'single', timing: true },
  'lights-from-index': { label: 'Lights From Index', category: 'general', ports: 'single' },
  'color-from-index': { label: 'Color From Index', category: 'general', ports: 'single' },
  'math': { label: 'Math', category: 'general', ports: 'single' },
  'expression': { label: 'Expression', category: 'general', ports: 'single' },
  'clamp': { label: 'Clamp', category: 'general', ports: 'single' },
  'frame-gate': { label: 'Frame Gate', category: 'general', ports: 'true-false' },
  'tempo': { label: 'Tempo', category: 'general', ports: 'single' },
  'indexed-variable': { label: 'Indexed Variable', category: 'general', ports: 'single' },
  'led-changed': { label: 'LED Changed', category: 'general', ports: 'each-done', timing: true },
  'select-from-list': { label: 'Select From List', category: 'general', ports: 'single' },
  'pulse': { label: 'Pulse', category: 'general', ports: 'single' },
  'random': { label: 'Random', category: 'general', ports: 'single' },
  'variable': { label: 'Variable', category: 'general', ports: 'single' },
  'array-length': { label: 'Array Length', category: 'array', ports: 'single' },
  'concat-lights': { label: 'Concat Lights', category: 'array', ports: 'single' },
  'create-pairs': { label: 'Create Pairs', category: 'array', ports: 'single' },
  'build-ring': { label: 'Build Ring', category: 'array', ports: 'single' },
  'reverse-lights': { label: 'Reverse Lights', category: 'array', ports: 'single' },
  'shuffle-lights': { label: 'Shuffle Lights', category: 'array', ports: 'single' },
  'for-each-light': {
    label: 'For Each Light',
    category: 'array',
    ports: 'each-done',
    timing: true,
  },
  'reverse-colors': { label: 'Reverse Colors', category: 'array', ports: 'single' },
  'concat-colors': { label: 'Concat Colors', category: 'array', ports: 'single' },
  'shuffle-colors': { label: 'Shuffle Colors', category: 'array', ports: 'single' },
  'debugger': { label: 'Debugger', category: 'debug', ports: 'single' },
}

export const NODE_LOGIC_TYPES = Object.keys(LOGIC_NODE_META) as LogicNode['logicType'][]
