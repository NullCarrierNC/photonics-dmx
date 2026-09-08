/**
 * Configuration interface for StageKit direct mode
 */
export interface StageKitConfig {
  /** Whether StageKit mode is enabled */
  enabled: boolean

  /** Whether to enable debug logging */
  debug?: boolean
}

/**
 * Default StageKit configuration
 */
export const DEFAULT_STAGEKIT_CONFIG: StageKitConfig = {
  enabled: true,
  debug: false,
}
