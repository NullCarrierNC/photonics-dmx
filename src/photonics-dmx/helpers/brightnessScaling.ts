import {
  DEFAULT_BRIGHTNESS_SCALE_PERCENT,
  isValidDmxChannel,
  type DmxFixture,
  type LightingConfiguration,
} from '../types'

/**
 * Per-colour-channel brightness trim for fixtures whose emitters differ in brightness. Turning the
 * stronger channels down rebalances the fixture without touching the cue's RGB intent.
 *
 * Wire only: the publisher's IPC buffer keeps unscaled intent and the preview re-applies scaling
 * itself, through the shared {@link scaleDmxValueByPercent}. Colour channels only, so master
 * dimmer, pan/tilt, strobe speed and `fixed` never appear in a scale map.
 */

/** Scales an already-clamped DMX byte. Shared, so wire and preview round identically. */
export function scaleDmxValueByPercent(value: number, percent: number): number {
  return Math.round((value * percent) / 100)
}

/** True for a storable scale: an integer percent 0–100. */
export function isValidBrightnessScalePercent(percent: unknown): percent is number {
  return Number.isInteger(percent) && (percent as number) >= 0 && (percent as number) <= 100
}

/** True for a scale worth persisting. 100 is never stored, since absence already means it. */
export function isStorableBrightnessScale(percent: unknown): percent is number {
  return isValidBrightnessScalePercent(percent) && percent !== DEFAULT_BRIGHTNESS_SCALE_PERCENT
}

/**
 * A fixture's DMX channel → scale percent map, or `null` when nothing is scaled. Unassigned and
 * unscaled channels are omitted, and the later entry wins on a shared address. The publisher
 * memoises this per fixture object.
 */
export function buildBrightnessScaleMap(fixture: DmxFixture): Map<number, number> | null {
  const map = new Map<number, number>()

  const named = fixture.channels as unknown as Record<string, number>
  const scaling = fixture.brightnessScaling
  if (scaling) {
    for (const key of ['red', 'green', 'blue'] as const) {
      const percent = scaling[key]
      if (isStorableBrightnessScale(percent) && isValidDmxChannel(named[key])) {
        map.set(named[key], percent)
      }
    }
  }

  for (const extra of fixture.extraChannels ?? []) {
    // `fixed` channels are pinned constants (mode/macro values, not light), so they never scale.
    if (extra.type === 'fixed') continue
    if (isStorableBrightnessScale(extra.scale) && isValidDmxChannel(extra.channel)) {
      map.set(extra.channel, extra.scale)
    }
  }

  return map.size > 0 ? map : null
}

/** True when any of this fixture's colour channels is scaled below 100%. */
export function fixtureHasBrightnessScaling(fixture: DmxFixture): boolean {
  return buildBrightnessScaleMap(fixture) !== null
}

/** Every light in a rig; the three arrays are equivalent here. */
function allLights(config: LightingConfiguration): DmxFixture[] {
  return [...config.frontLights, ...config.backLights, ...config.strobeLights]
}

/** Same ordering the publisher uses when multiple fixtures write the same DMX address. */
function lightsInPublishOrder(config: LightingConfiguration): DmxFixture[] {
  return allLights(config).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
}

/** True when the fixture maps a DMX address through a base or extra channel. */
function fixtureMapsChannel(fixture: DmxFixture, channel: number): boolean {
  const named = fixture.channels as unknown as Record<string, number>
  for (const value of Object.values(named)) {
    if (value === channel) return true
  }
  for (const extra of fixture.extraChannels ?? []) {
    if (extra.channel === channel) return true
  }
  return false
}

/** True when any light in the rig is scaled. Gates the preview's scaling toggle. */
export function configHasBrightnessScaling(config: LightingConfiguration): boolean {
  return allLights(config).some(fixtureHasBrightnessScaling)
}

/**
 * A copy of a preview snapshot with each light's scaling applied, matching the wire. The preview's
 * opt-in view: uniform preview emitters bias the shift differently from real ones, so it shows the
 * trim is working rather than what the fixture will actually look like.
 */
export function applyBrightnessScalingToDmxValues(
  config: LightingConfiguration,
  dmxValues: Record<number, number>,
): Record<number, number> {
  const scaled = { ...dmxValues }
  const lights = lightsInPublishOrder(config)

  for (const channelKey of Object.keys(dmxValues)) {
    const channel = Number(channelKey)
    if (!Number.isInteger(channel)) continue

    // Shared addresses are allowed; the publisher's last sorted write wins on the wire.
    let owner: DmxFixture | undefined
    for (const light of lights) {
      if (fixtureMapsChannel(light, channel)) owner = light
    }
    if (!owner) continue

    const percent = buildBrightnessScaleMap(owner)?.get(channel)
    const value = dmxValues[channel]
    if (percent !== undefined && typeof value === 'number') {
      scaled[channel] = scaleDmxValueByPercent(value, percent)
    }
  }
  return scaled
}
