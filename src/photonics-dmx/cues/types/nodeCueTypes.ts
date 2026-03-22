import { CueType } from './cueTypes'

import type { YargEventType, TrackedLight } from '../../types'
import {
  ALL_CONFIG_DATA_PROPERTIES,
  YARG_CUE_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
} from '../../constants/nodeConstants'

export type NodeCueMode = 'yarg' | 'audio'

// Effect mode - typed like cues
export type EffectMode = 'yarg' | 'audio'

export interface NodeCueGroupMeta {
  id: string
  name: string
  description?: string
  variables?: VariableDefinition[]
  /** When true, this group is set as the registry default (fallback) group after load. */
  isDefault?: boolean
  /** When true, this group is set as the registry stage-kit group after load. */
  isStageKit?: boolean
}

export interface NodeLayoutMetadata {
  nodePositions: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
}

export interface Connection {
  from: string
  to: string
  fromPort?: string
  toPort?: string
}

export type VariableType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'color'
  | 'light-array'
  | 'cue-type'
  | 'event'

export type ValueSource =
  | { source: 'literal'; value: number | boolean | string | TrackedLight[] }
  | { source: 'variable'; name: string }

export interface VariableDefinition {
  name: string
  type: VariableType
  scope: 'cue' | 'cue-group'
  initialValue: number | boolean | string | TrackedLight[]
  description?: string
  isParameter?: boolean
  /** Constrained set of allowed literal values; drives a selector in the effect-raiser parameter UI */
  validValues?: string[]
}

export interface EventDefinition {
  name: string
  description?: string
}

export type LogicComparator = '>' | '>=' | '<' | '<=' | '==' | '!='
export type MathOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulus'

export interface BaseLogicNode {
  id: string
  type: 'logic'
  label?: string
  outputs?: string[]
}

export interface VariableLogicNode extends BaseLogicNode {
  logicType: 'variable'
  mode: 'set' | 'get' | 'init'
  varName: string
  valueType: VariableType
  value?: ValueSource
}

export interface MathLogicNode extends BaseLogicNode {
  logicType: 'math'
  operator: MathOperator
  left: ValueSource
  right: ValueSource
  assignTo?: string
}

export interface ConditionalLogicNode extends BaseLogicNode {
  logicType: 'conditional'
  comparator: LogicComparator
  left: ValueSource
  right: ValueSource
}

// YARG Cue Data Properties - derived from shared constants
export type YargCueDataProperty = (typeof YARG_CUE_DATA_PROPERTIES)[number]

// Audio Cue Data Properties - derived from shared constants
export type AudioCueDataProperty = (typeof AUDIO_CUE_DATA_PROPERTIES)[number]

export type CueDataProperty = YargCueDataProperty | AudioCueDataProperty

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

export interface RandomLogicNode extends BaseLogicNode {
  logicType: 'random'
  mode: RandomMode
  min?: ValueSource // random-integer: inclusive min
  max?: ValueSource // random-integer: inclusive max
  choices?: string[] // random-choice: list of string options
  sourceVariable?: string // random-light: light-array variable name
  count?: ValueSource // random-light: number of lights to pick
  assignTo: string // variable to store result
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

export type LogicNode =
  | VariableLogicNode
  | MathLogicNode
  | ConditionalLogicNode
  | CueDataLogicNode
  | ConfigDataLogicNode
  | LightsFromIndexLogicNode
  | ArrayLengthLogicNode
  | ReverseLightsLogicNode
  | CreatePairsLogicNode
  | ConcatLightsLogicNode
  | DelayLogicNode
  | DebuggerLogicNode
  | RandomLogicNode
  | ShuffleLightsLogicNode
  | ForEachLightLogicNode

export interface EventRaiserNode {
  id: string
  type: 'event-raiser'
  eventName: string
  label?: string
  inputs?: string[]
  outputs?: string[]
}

export interface EventListenerNode {
  id: string
  type: 'event-listener'
  eventName: string
  label?: string
  outputs?: string[]
}

// Effect Event Listener node
export interface EffectEventListenerNode {
  id: string
  type: 'effect-listener'
  label?: string
  outputs?: string[]
  // parameterMappings removed - auto-mapped from effect variables with isParameter=true
}

// Effect Raiser node
export interface EffectRaiserNode {
  id: string
  type: 'effect-raiser'
  effectId: string // References effect definition
  label?: string
  inputs?: string[]
  outputs?: string[]
  parameterValues?: Record<string, ValueSource> // Parameter name -> value
  /** When true, the effect automatically re-triggers when it completes, creating a continuous loop.
   *  Used for effects like sweeps or cross-fades that should run indefinitely until the cue stops. */
  isPersistent?: boolean
}

export type NotesStyle = 'notes' | 'info' | 'important'

// Notes node - for documentation only, not part of execution
export interface NotesNode {
  id: string
  type: 'notes'
  label?: string
  title?: string // Optional title for the note
  style?: NotesStyle
  note: string // Text content of the note
}

export interface NodeGraph<TEvent extends BaseEventNode, TAction extends ActionNode> {
  events: TEvent[]
  actions: TAction[]
  logic?: LogicNode[]
  eventRaisers?: EventRaiserNode[]
  eventListeners?: EventListenerNode[]
  effectRaisers?: EffectRaiserNode[]
  effectListeners?: EffectEventListenerNode[]
  notes?: NotesNode[] // Notes nodes for documentation
}

export interface BaseCueDefinition {
  id: string
  name: string
  description?: string
  nodes: NodeGraph<BaseEventNode, ActionNode>
  connections: Connection[]
  layout?: NodeLayoutMetadata
  variables?: VariableDefinition[]
  events?: EventDefinition[]
  effects?: EffectReference[] // NEW: registered effects
}

// Effect reference in cue
export interface EffectReference {
  effectId: string // ID of the effect
  effectFileId: string // ID of the effect file/group
  name: string // Display name (cached for UI)
}

export interface YargNodeCueDefinition extends BaseCueDefinition {
  cueType: CueType
  style: 'primary' | 'secondary'
  nodes: NodeGraph<YargEventNode, ActionNode>
}

export interface AudioNodeCueDefinition extends BaseCueDefinition {
  cueTypeId: string
  nodes: NodeGraph<AudioEventNodeUnion, ActionNode>
}

export interface YargNodeCueFile {
  version: 1
  mode: 'yarg'
  group: NodeCueGroupMeta
  cues: YargNodeCueDefinition[]
  bundled?: boolean
}

export interface AudioNodeCueFile {
  version: 1
  mode: 'audio'
  group: NodeCueGroupMeta
  cues: AudioNodeCueDefinition[]
  bundled?: boolean
}

export type NodeCueFile = YargNodeCueFile | AudioNodeCueFile

export interface BaseEventNode {
  id: string
  type: 'event'
  label?: string
  outputs?: string[]
}

export interface YargEventNode extends BaseEventNode {
  eventType: YargEventType
}

export type AudioEventType =
  | 'none'
  | 'delay'
  | 'cue-started'
  | 'audio-beat'
  | 'audio-energy'
  | 'audio-trigger'
  | 'audio-centroid'
  | 'audio-flatness'
  | 'audio-hfc'

export interface AudioEventNode extends BaseEventNode {
  eventType: AudioEventType
  threshold?: number
  triggerMode: 'edge' | 'level'
  /** Minimum ms between edge triggers; 0 = no limit */
  cooldownMs?: number
  /**
   * When true (edge mode only), also require max per-band onset strength >= onsetThreshold.
   * Used to tighten beat/HFC-style events against weak or duplicate edges.
   */
  useOnsetGating?: boolean
  /** Minimum onset strength (0–1) when useOnsetGating is true. Default 0.3 */
  onsetThreshold?: number
}

/** Optional min/max range for a single spectral gate (0–1 feature values). */
export interface SpectralGateRange {
  min?: number
  max?: number
}

/** When set, all defined sub-gates must pass (AND). Omitted sub-gates are ignored. */
export interface AudioTriggerSpectralGates {
  /** Spectral flatness (0–1). 0 = tonal, 1 = noise */
  flatness?: SpectralGateRange
  /** Zero-crossing rate (0–1). Low = sustained, high = percussive */
  zeroCrossingRate?: SpectralGateRange
  /** HFC onset (0–1). Higher = more percussive / transient */
  hfcOnset?: SpectralGateRange
  /** Spectral crest (0–1). Higher = peakier / more tonal */
  crest?: SpectralGateRange
}

export type AudioTriggerInstrumentPresetId =
  | 'sub-bass'
  | 'kick'
  | 'snare'
  | 'bass-guitar'
  | 'electric-guitar'
  | 'vocals'
  | 'hi-hat-cymbals'
  | 'full-kit'

export interface AudioTriggerNode extends BaseEventNode {
  type: 'event'
  eventType: 'audio-trigger'
  frequencyRange: { minHz: number; maxHz: number }
  /** Power level (0-1) the band energy must exceed to trigger. Higher = needs more energy to fire. */
  threshold: number
  /** Hysteresis margin (0-1). Release when level drops below threshold - hysteresis. Omitted = 0. */
  hysteresis?: number
  /** Minimum ms the trigger stays active after entering. 0 = no minimum hold. */
  holdMs?: number
  /** Energy smoothing (0–1). 0 = raw/immediate, 1 = maximum smoothing (slow response). Default 0.45. */
  smoothing?: number
  /** Optional spectral conditions (flatness, ZCR, HFC, crest). AND with band energy. */
  spectralGates?: AudioTriggerSpectralGates
  /** When true, also require per-band onset strength above onsetThreshold for the matched band */
  useOnsetGating?: boolean
  /** Minimum onset strength (0–1) when useOnsetGating is true. Default 0.3 */
  onsetThreshold?: number
  /** Last-applied instrument preset (for editor display) */
  appliedTriggerPreset?: AudioTriggerInstrumentPresetId
  /** True when the user changed fields after applying a preset */
  triggerPresetDirty?: boolean
  color: string
  nodeLabel: string
  outputs: ['enter', 'during', 'exit']
}

export type AudioEventNodeUnion = AudioEventNode | AudioTriggerNode

export const NODE_EFFECT_TYPES = ['set-color', 'blackout'] as const

export type NodeEffectType = (typeof NODE_EFFECT_TYPES)[number]

export interface NodeActionTarget {
  groups: ValueSource // Can reference a string variable containing comma-separated groups
  filter: ValueSource // Can reference a string variable with filter name
}

export interface NodeColorSetting {
  name: ValueSource // Can reference a string variable with color name
  brightness: ValueSource // Can reference a string variable with brightness level
  blendMode?: ValueSource // Can reference a string variable with blend mode
  opacity?: ValueSource // Can reference a number variable with opacity (0.0-1.0)
}

export interface ActionTimingConfig {
  waitForCondition: ValueSource
  waitForTime: ValueSource
  waitForConditionCount?: ValueSource
  duration: ValueSource
  waitUntilCondition: ValueSource
  waitUntilTime: ValueSource
  waitUntilConditionCount?: ValueSource
  easing?: string
  level?: ValueSource
}

export interface NodeActionConfig {
  custom?: Record<string, unknown>
}

export const createDefaultActionTiming = (): ActionTimingConfig => ({
  waitForCondition: { source: 'literal', value: 'none' },
  waitForTime: { source: 'literal', value: 0 },
  duration: { source: 'literal', value: 200 },
  waitUntilCondition: { source: 'literal', value: 'none' },
  waitUntilTime: { source: 'literal', value: 0 },
  easing: 'linear',
  level: { source: 'literal', value: 1 },
})

export interface ActionNode {
  id: string
  type: 'action'
  effectType: NodeEffectType
  target: NodeActionTarget
  color: NodeColorSetting
  timing: ActionTimingConfig
  layer?: ValueSource
  label?: string
  inputs?: string[]
  outputs?: string[]
  config?: NodeActionConfig
}

// ============================================================================
// Effect Definitions
// ============================================================================

// Effect definition (like CueDefinition but for effects)
export interface BaseEffectDefinition {
  id: string
  name: string
  description?: string
  nodes: NodeGraph<BaseEventNode, ActionNode>
  connections: Connection[]
  layout?: NodeLayoutMetadata
  variables?: VariableDefinition[] // Effect-local variables (some may be parameters with isParameter: true)
  events?: EventDefinition[] // Effect-scoped runtime events
}

export interface YargEffectDefinition extends BaseEffectDefinition {
  mode: 'yarg'
  nodes: NodeGraph<YargEventNode, ActionNode>
}

export interface AudioEffectDefinition extends BaseEffectDefinition {
  mode: 'audio'
  nodes: NodeGraph<AudioEventNode, ActionNode>
}

export type EffectDefinition = YargEffectDefinition | AudioEffectDefinition

// Effect file structure (parallel to NodeCueFile)
export interface EffectGroupMeta {
  id: string
  name: string
  description?: string
}

export interface YargEffectFile {
  version: 1
  mode: 'yarg'
  group: EffectGroupMeta
  effects: YargEffectDefinition[]
  bundled?: boolean
}

export interface AudioEffectFile {
  version: 1
  mode: 'audio'
  group: EffectGroupMeta
  effects: AudioEffectDefinition[]
  bundled?: boolean
}

export type EffectFile = YargEffectFile | AudioEffectFile
