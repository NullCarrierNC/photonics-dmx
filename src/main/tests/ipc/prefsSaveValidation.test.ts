import { describe, expect, it } from '@jest/globals'
import { validatePreferencesSave } from '../../ipc/validation/prefsSaveValidation'

describe('validatePreferencesSave', () => {
  it('keeps the fields a nested preference object has and drops the rest', () => {
    const result = validatePreferencesSave({
      windowState: { width: 800, height: 600, x: 10, y: 20, payload: 'x'.repeat(100) },
      brightness: { low: 40, medium: 100, high: 180, max: 255, extra: { deep: true } },
      dmxOutputConfig: {
        sacnEnabled: true,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: false,
        smuggled: 1,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.windowState).toEqual({ width: 800, height: 600, x: 10, y: 20 })
    expect(result.value.brightness).toEqual({ low: 40, medium: 100, high: 180, max: 255 })
    expect(result.value.dmxOutputConfig).not.toHaveProperty('smuggled')
  })

  it('drops fields named after what every object inherits', () => {
    const result = validatePreferencesSave(
      JSON.parse(
        '{"dmxOutputConfig":{"sacnEnabled":true,"artNetEnabled":false,"enttecProEnabled":false,"openDmxEnabled":false,"constructor":"x","toString":"y"}}',
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value.dmxOutputConfig ?? {})).toEqual([
      'sacnEnabled',
      'artNetEnabled',
      'enttecProEnabled',
      'openDmxEnabled',
    ])
  })

  it('keeps the sender configs to their own fields', () => {
    const result = validatePreferencesSave({
      sacnConfig: { universe: 1, useUnicast: false, script: 'alert(1)' },
      enttecProConfig: { port: 'COM3', dmxSpeed: 40, extra: [1, 2, 3] },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sacnConfig).not.toHaveProperty('script')
    expect(result.value.enttecProConfig).toEqual({ port: 'COM3', dmxSpeed: 40 })
  })

  it('refuses a payload far larger than any preferences file', () => {
    const result = validatePreferencesSave({
      leftMenuCollapsed: true,
      padding: 'x'.repeat(2_000_000),
    })

    expect(result.ok).toBe(false)
  })

  it('still refuses what the preference validator refuses', () => {
    expect(validatePreferencesSave({ clockRate: 'fast' }).ok).toBe(false)
    expect(validatePreferencesSave({ notAPreference: 1 }).ok).toBe(false)
  })
})
