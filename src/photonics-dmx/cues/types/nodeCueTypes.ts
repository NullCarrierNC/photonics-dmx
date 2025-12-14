import { CueType } from './cueTypes';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type {
  WaitCondition,
} from '../../types';

export type NodeCueMode = 'yarg' | 'audio';

// Effect mode - typed like cues
export type EffectMode = 'yarg' | 'audio';

export interface NodeCueGroupMeta {
  id: string;
  name: string;
  description?: string;
  variables?: VariableDefinition[];
}

export interface NodeLayoutMetadata {
  nodePositions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface Connection {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export type VariableType = 'number' | 'boolean' | 'string';

export type ValueSource =
  | { source: 'literal'; value: number | boolean | string }
  | { source: 'variable'; name: string; fallback?: number | boolean | string };

export interface VariableDefinition {
  name: string;
  type: VariableType;
  scope: 'cue' | 'cue-group';
  initialValue: number | boolean | string;
  description?: string;
  isParameter?: boolean; 
}

export interface EventDefinition {
  name: string;
  description?: string;
}

export type LogicComparator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type MathOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulus';

export interface BaseLogicNode {
  id: string;
  type: 'logic';
  label?: string;
  outputs?: string[];
}

export interface VariableLogicNode extends BaseLogicNode {
  logicType: 'variable';
  mode: 'set' | 'get' | 'init';
  varName: string;
  valueType: VariableType;
  value?: ValueSource;
}

export interface MathLogicNode extends BaseLogicNode {
  logicType: 'math';
  operator: MathOperator;
  left: ValueSource;
  right: ValueSource;
  assignTo?: string;
}

export interface ConditionalLogicNode extends BaseLogicNode {
  logicType: 'conditional';
  comparator: LogicComparator;
  left: ValueSource;
  right: ValueSource;
}

// YARG Cue Data Properties
export type YargCueDataProperty = 
  | 'cue-name'              // Current cue name (string)
  | 'cue-type'              // Current CueType (string)
  | 'execution-count'       // How many times this cue has executed (number)
  | 'bpm'                   // Beats per minute (number)
  | 'song-section'          // Chorus/Verse/etc (string)
  | 'current-scene'         // Menu/Gameplay/Score (string)
  | 'beat-type'             // Measure/Strong/Weak (string)
  | 'keyframe'              // Current keyframe value (string)
  | 'guitar-note-count'     // Number of guitar notes pressed (number)
  | 'bass-note-count'       // Number of bass notes pressed (number)
  | 'drum-note-count'       // Number of drum notes pressed (number)
  | 'keys-note-count'       // Number of keys notes pressed (number)
  | 'total-score'           // Total band score (number)
  | 'performer'             // Performer index (number)
  | 'bonus-effect'          // Whether bonus effect active (boolean)
  | 'fog-state'             // Fog on/off (boolean)
  | 'time-since-cue-start'  // Milliseconds since cue started (number)
  | 'time-since-last-cue';  // Milliseconds since previous cue (number)

// Audio Cue Data Properties
export type AudioCueDataProperty =
  | 'cue-name'              // Current cue name (string)
  | 'cue-type-id'           // Current cue type ID (string)
  | 'execution-count'       // Execution count (number)
  | 'timestamp'             // Current timestamp (number)
  | 'overall-level'         // Audio level 0.0-1.0 (number)
  | 'bpm'                   // Detected BPM or null (number)
  | 'beat-detected'         // Beat detected this frame (boolean)
  | 'energy'                // Audio energy 0.0-1.0 (number)
  | 'freq-range1'           // Bass frequencies 0.0-1.0 (number)
  | 'freq-range2'           // Low-mids 0.0-1.0 (number)
  | 'freq-range3'           // Mids 0.0-1.0 (number)
  | 'freq-range4'           // Upper-mids 0.0-1.0 (number)
  | 'freq-range5'           // Highs 0.0-1.0 (number)
  | 'enabled-band-count';   // Number of enabled bands (number)

export type CueDataProperty = YargCueDataProperty | AudioCueDataProperty;

// Config Data Properties
export type ConfigDataProperty =
  | 'total-lights'          // Total number of all lights (number)
  | 'front-lights-count'    // Number of front lights (number)
  | 'back-lights-count'     // Number of back lights (number)
  | 'strobe-lights-count';  // Number of strobe lights (number)

export interface CueDataLogicNode extends BaseLogicNode {
  logicType: 'cue-data';
  dataProperty: CueDataProperty;
  assignTo?: string;
}

export interface ConfigDataLogicNode extends BaseLogicNode {
  logicType: 'config-data';
  dataProperty: ConfigDataProperty;
  assignTo?: string;
}

export type LogicNode = 
  | VariableLogicNode 
  | MathLogicNode 
  | ConditionalLogicNode
  | CueDataLogicNode
  | ConfigDataLogicNode;

export interface EventRaiserNode {
  id: string;
  type: 'event-raiser';
  eventName: string;
  label?: string;
  inputs?: string[];
  outputs?: string[];
}

export interface EventListenerNode {
  id: string;
  type: 'event-listener';
  eventName: string;
  label?: string;
  outputs?: string[];
}

// Effect Event Listener node
export interface EffectEventListenerNode {
  id: string;
  type: 'effect-listener';
  label?: string;
  outputs?: string[];
  // parameterMappings removed - auto-mapped from effect variables with isParameter=true
}

// Effect Raiser node
export interface EffectRaiserNode {
  id: string;
  type: 'effect-raiser';
  effectId: string;  // References effect definition
  label?: string;
  inputs?: string[];
  outputs?: string[];
  parameterValues?: Record<string, ValueSource>;  // Parameter name -> value
}

export interface NodeGraph<TEvent extends BaseEventNode, TAction extends ActionNode> {
  events: TEvent[];
  actions: TAction[];
  logic?: LogicNode[];
  eventRaisers?: EventRaiserNode[];
  eventListeners?: EventListenerNode[];
  effectRaisers?: EffectRaiserNode[];
  effectListeners?: EffectEventListenerNode[];
}

export interface BaseCueDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: NodeGraph<BaseEventNode, ActionNode>;
  connections: Connection[];
  layout?: NodeLayoutMetadata;
  variables?: VariableDefinition[];
  events?: EventDefinition[];
  effects?: EffectReference[];  // NEW: registered effects
}

// Effect reference in cue
export interface EffectReference {
  effectId: string;  // ID of the effect
  effectFileId: string;  // ID of the effect file/group
  name: string;  // Display name (cached for UI)
}

export interface YargNodeCueDefinition extends BaseCueDefinition {
  cueType: CueType;
  style: 'primary' | 'secondary';
  nodes: NodeGraph<YargEventNode, ActionNode>;
}

export interface AudioNodeCueDefinition extends BaseCueDefinition {
  cueTypeId: string;
  nodes: NodeGraph<AudioEventNode, ActionNode>;
}

export interface YargNodeCueFile {
  version: 1;
  mode: 'yarg';
  group: NodeCueGroupMeta;
  cues: YargNodeCueDefinition[];
}

export interface AudioNodeCueFile {
  version: 1;
  mode: 'audio';
  group: NodeCueGroupMeta;
  cues: AudioNodeCueDefinition[];
}

export type NodeCueFile = YargNodeCueFile | AudioNodeCueFile;

export interface BaseEventNode {
  id: string;
  type: 'event';
  label?: string;
  outputs?: string[];
}

export interface YargEventNode extends BaseEventNode {
  eventType: WaitCondition;
}

export type AudioEventType =
  | 'none'
  | 'delay'
  | 'audio-beat'
  | 'audio-range1'
  | 'audio-range2'
  | 'audio-range3'
  | 'audio-range4'
  | 'audio-range5'
  | 'audio-energy';

export interface AudioEventNode extends BaseEventNode {
  eventType: AudioEventType;
  threshold?: number;
  triggerMode: 'edge' | 'level';
}

export type NodeEffectType =
  | 'single-color'
  | 'sweep'
  | 'cycle'
  | 'blackout';

export interface NodeActionTarget {
  groups: ValueSource;  // Can reference a string variable containing comma-separated groups
  filter: ValueSource;  // Can reference a string variable with filter name
}

export interface NodeColorSetting {
  name: ValueSource;        // Can reference a string variable with color name
  brightness: ValueSource;  // Can reference a string variable with brightness level
  blendMode?: ValueSource;  // Can reference a string variable with blend mode
}

export interface ActionTimingConfig {
  waitForCondition: WaitCondition;
  waitForTime: ValueSource;
  waitForConditionCount?: ValueSource;
  duration: ValueSource;
  waitUntilCondition: WaitCondition;
  waitUntilTime: ValueSource;
  waitUntilConditionCount?: ValueSource;
  easing?: string;
  level?: ValueSource;
}

export interface SweepActionConfig {
  duration?: ValueSource;
  fadeIn?: ValueSource;
  fadeOut?: ValueSource;
  overlap?: ValueSource;
  betweenDelay?: ValueSource;
  lowColor?: NodeColorSetting;
}

export interface CycleActionConfig {
  baseColor?: NodeColorSetting;
  transitionDuration?: ValueSource;
  trigger?: WaitCondition;
}

export interface BlackoutActionConfig {
  duration?: ValueSource;
}

export interface NodeActionConfig {
  sweep?: SweepActionConfig;
  cycle?: CycleActionConfig;
  blackout?: BlackoutActionConfig;
  custom?: Record<string, unknown>;
}

export const createDefaultActionTiming = (): ActionTimingConfig => ({
  waitForCondition: 'none',
  waitForTime: { source: 'literal', value: 0 },
  duration: { source: 'literal', value: 200 },
  waitUntilCondition: 'none',
  waitUntilTime: { source: 'literal', value: 0 },
  easing: 'sinInOut',
  level: { source: 'literal', value: 1 }
});

export interface ActionNode {
  id: string;
  type: 'action';
  effectType: NodeEffectType;
  target: NodeActionTarget;
  color: NodeColorSetting;
  secondaryColor?: NodeColorSetting;
  timing: ActionTimingConfig;
  layer?: ValueSource;
  label?: string;
  inputs?: string[];
  outputs?: string[];
  config?: NodeActionConfig;
}

// ============================================================================
// Effect Definitions
// ============================================================================

// Effect definition (like CueDefinition but for effects)
export interface BaseEffectDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: NodeGraph<BaseEventNode, ActionNode>;
  connections: Connection[];
  layout?: NodeLayoutMetadata;
  variables?: VariableDefinition[];  // Effect-local variables (some may be parameters with isParameter: true)
  events?: EventDefinition[];  // Effect-scoped runtime events
}

export interface YargEffectDefinition extends BaseEffectDefinition {
  mode: 'yarg';
  nodes: NodeGraph<YargEventNode, ActionNode>;
}

export interface AudioEffectDefinition extends BaseEffectDefinition {
  mode: 'audio';
  nodes: NodeGraph<AudioEventNode, ActionNode>;
}

export type EffectDefinition = YargEffectDefinition | AudioEffectDefinition;

// Effect file structure (parallel to NodeCueFile)
export interface EffectGroupMeta {
  id: string;
  name: string;
  description?: string;
}

export interface YargEffectFile {
  version: 1;
  mode: 'yarg';
  group: EffectGroupMeta;
  effects: YargEffectDefinition[];
}

export interface AudioEffectFile {
  version: 1;
  mode: 'audio';
  group: EffectGroupMeta;
  effects: AudioEffectDefinition[];
}

export type EffectFile = YargEffectFile | AudioEffectFile;

