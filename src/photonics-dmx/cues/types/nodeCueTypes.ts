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

export interface NodeGraph<TEvent extends BaseEventNode, TAction extends ActionNode> {
  events: TEvent[];
  actions: TAction[];
}

export interface BaseCueDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: NodeGraph<BaseEventNode, ActionNode>;
  connections: Connection[];
  layout?: NodeLayoutMetadata;
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
  | 'cross-fade'
  | 'flash'
  | 'fade-in-out'
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

export interface EnvelopeConfig {
  attack: number;
  decay: number;
  sustainLevel: number;
  sustainTime: number;
  release: number;
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

export interface ActionNode {
  id: string;
  type: 'action';
  effectType: NodeEffectType;
  target: NodeActionTarget;
  color: NodeColorSetting;
  secondaryColor?: NodeColorSetting;
  envelope: EnvelopeConfig;
  layer?: number;
  label?: string;
  inputs?: string[];
  outputs?: string[];
  config?: NodeActionConfig;
}

