import type { RGBIO, LightingConfiguration } from '../types'
import type { DmxLightManager } from './DmxLightManager'

/** Processed colour for one fixture before DMX encoding. */
export interface ProcessedLightColor {
  r: number
  g: number
  b: number
  intensity: number
}

/** Shared timing and identity for one publish frame. */
export interface PublisherFrameContext {
  /** One timestamp per publish frame so temporal effects advance once. */
  nowMs: number
  rigId: string
}

/**
 * Per-rig view of processed colours for one publish frame. Created fresh each frame; the
 * implementation may run an optional rig-wide pre-pass before per-light lookup.
 */
export interface PublisherFrameRigView {
  /** When false, the publisher uses raw cue colour unchanged. */
  isActive(): boolean
  /**
   * Writes processed colour for one fixture into `out`, which the publisher owns and reuses across
   * every fixture in the frame. Implementations must not retain it.
   */
  colorFor(lightId: string, input: Readonly<RGBIO>, out: ProcessedLightColor): void
}

/**
 * Generic publisher-stage contract: cue-blended RGBIO in, processed RGBIO out. DMX encoding,
 * strobe peak-hold, emitter mixing, brightness scaling, routing, and output governors stay in
 * {@link DmxPublisher}.
 */
export interface PublisherFrameProcessor {
  /** Whether this processor will transform output on the next frame. */
  isFrameProcessingActive(): boolean
  prepareRigFrame(
    config: LightingConfiguration,
    manager: DmxLightManager,
    lights: ReadonlyMap<string, Readonly<RGBIO>>,
    ctx: PublisherFrameContext,
  ): PublisherFrameRigView
  dispose?(): void
}

/**
 * Passthrough view for an inactive processor. Stateless, so every rig and frame shares one instance
 * rather than allocating in the publish loop.
 */
export const PASSTHROUGH_FRAME_RIG_VIEW: PublisherFrameRigView = {
  isActive: () => false,
  colorFor: (_lightId, input, out) => {
    out.r = input.red
    out.g = input.green
    out.b = input.blue
    out.intensity = input.intensity
  },
}
