/**
 * Configuration interface for StageKit direct mode
 */
export interface StageKitConfig {
  /** Whether StageKit mode is enabled */
  enabled: boolean

  /** Whether to enable debug logging */
  debug?: boolean

  /**
   * How long a strobe may keep running after the last StageKit packet before it is cut, in ms.
   * RB3E signals a strobe once and leaves it running until an explicit stop, so this bound is
   * what ends one whose console has crashed or dropped off the network.
   */
  strobeWatchdogMs?: number
}

/**
 * RB3 strobe silence window. A song can hold a strobe for several seconds with no StageKit
 * traffic, so the window outlasts those stretches.
 */
export const RB3_STROBE_WATCHDOG_MS = 12_500

/**
 * Default StageKit configuration
 */
export const DEFAULT_STAGEKIT_CONFIG: StageKitConfig = {
  enabled: true,
  debug: false,
  strobeWatchdogMs: RB3_STROBE_WATCHDOG_MS,
}
