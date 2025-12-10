import { CueType } from './cueTypes';
import {
  WaitCondition,
  LocationGroup,
  LightTarget,
  Color,
  Brightness,
  BlendMode
} from '../../types';

export type NodeCueMode = 'yarg' | 'audio';

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

export type LogicNode = VariableLogicNode | MathLogicNode | ConditionalLogicNode;

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

export interface NodeGraph<TEvent extends BaseEventNode, TAction extends ActionNode> {
  events: TEvent[];
  actions: TAction[];
  logic?: LogicNode[];
  eventRaisers?: EventRaiserNode[];
  eventListeners?: EventListenerNode[];
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
  groups: LocationGroup[];
  filter: LightTarget;
}

export interface NodeColorSetting {
  name: Color;
  brightness: Brightness;
  blendMode?: BlendMode;
}

export interface ActionTimingConfig {
  waitForCondition: WaitCondition;
  waitForTime: number;
  waitForConditionCount?: number;
  duration: number;
  waitUntilCondition: WaitCondition;
  waitUntilTime: number;
  waitUntilConditionCount?: number;
  easing?: string;
  level?: number;
}

export interface SweepActionConfig {
  duration?: number;
  fadeIn?: number;
  fadeOut?: number;
  overlap?: number;
  betweenDelay?: number;
  lowColor?: NodeColorSetting;
}

export interface CycleActionConfig {
  baseColor?: NodeColorSetting;
  transitionDuration?: number;
  trigger?: WaitCondition;
}

export interface BlackoutActionConfig {
  duration?: number;
}

export interface NodeActionConfig {
  sweep?: SweepActionConfig;
  cycle?: CycleActionConfig;
  blackout?: BlackoutActionConfig;
  custom?: Record<string, unknown>;
}

export const createDefaultActionTiming = (): ActionTimingConfig => ({
  waitForCondition: 'none',
  waitForTime: 0,
  duration: 200,
  waitUntilCondition: 'none',
  waitUntilTime: 0,
  easing: 'sinInOut',
  level: 1
});

export interface ActionNode {
  id: string;
  type: 'action';
  effectType: NodeEffectType;
  target: NodeActionTarget;
  color: NodeColorSetting;
  secondaryColor?: NodeColorSetting;
  timing: ActionTimingConfig;
  layer?: number;
  label?: string;
  inputs?: string[];
  outputs?: string[];
  config?: NodeActionConfig;
}

