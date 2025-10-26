/**
 * Event Processors for Photonics DMX
 * 
 * This module provides event-driven processors that can handle RB3E network events
 * in different ways: direct DMX control or cue-based control.
 */

export { Rb3StageKitDirectProcessor as StageKitDirectProcessor } from './Rb3StageKitDirectProcessor';
export { Rb3CueBasedProcessor as CueBasedProcessor  } from './Rb3CueBasedProcessor';
export { ProcessorManager } from './ProcessorManager';

// Export types
export type { ProcessingMode, ProcessorManagerConfig } from './ProcessorManager';
export type { StageKitData  } from './Rb3StageKitDirectProcessor';
export type { 
  Rb3eStageKitEvent as Rb3eStageKitEventTraditional,
  Rb3eGameStateEvent,
  Rb3eScoreEvent,
  Rb3eSongEvent,
  Rb3eBandInfoEvent
} from './Rb3CueBasedProcessor';
