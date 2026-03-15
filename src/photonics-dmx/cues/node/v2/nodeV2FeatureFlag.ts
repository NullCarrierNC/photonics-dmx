/**
 * Feature flag for Node System V2.
 * When true, the loader creates YargNodeCueV2 (GraphExecutionEngine path); when false, it creates YargNodeCue (legacy path).
 *
 * Default: V2 (new engine). Set PHOTONICS_NODE_V2=0 to use the legacy V1 engine.
 * Override in tests via setNodeV2Enabled().
 */
let override: boolean | null = null

export function isNodeV2Enabled(): boolean {
  if (override !== null) return override
  return process.env['PHOTONICS_NODE_V2'] !== '0'
}

/**
 * Set the V2 flag for tests. Call with null to reset to env-based behaviour.
 */
export function setNodeV2Enabled(value: boolean | null): void {
  override = value
}
