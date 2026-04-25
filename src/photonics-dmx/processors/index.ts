/**
 * Event Processors for Photonics DMX
 *
 * This module provides event-driven processors that handle RB3E StageKit network events
 * through direct DMX control.
 */

export { Rb3StageKitDirectProcessor as StageKitDirectProcessor } from './Rb3StageKitDirectProcessor'
export { ProcessorManager } from './ProcessorManager'

// Export types
export type { ProcessingMode, ProcessorManagerConfig } from './ProcessorManager'
export type { StageKitData } from './Rb3StageKitDirectProcessor'
