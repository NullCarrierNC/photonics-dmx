import { describe, expect, it } from '@jest/globals'
import { PersistentRunRegistry } from '../../controllers/sequencer/PersistentRunRegistry'
import { Effect, EffectTransition } from '../../types'

const effect: Effect = { id: 'e', description: 'test effect', transitions: [] }

const transitionsFor = (
  layout: Record<number, string[]>,
): Map<number, Map<string, EffectTransition[]>> => {
  const map = new Map<number, Map<string, EffectTransition[]>>()
  for (const [layer, lightIds] of Object.entries(layout)) {
    const layerMap = new Map<string, EffectTransition[]>()
    for (const lightId of lightIds) {
      layerMap.set(lightId, [])
    }
    map.set(Number(layer), layerMap)
  }
  return map
}

describe('PersistentRunRegistry', () => {
  it('registers a run counting every (layer, light) slot', () => {
    const registry = new PersistentRunRegistry()

    const runId = registry.register('pulse', effect, transitionsFor({ 0: ['a', 'b'], 1: ['a'] }))

    expect(runId).toBeDefined()
    const run = registry.get(runId!)
    expect(run).toMatchObject({ name: 'pulse', totalLights: 3, remainingLights: 3 })
    expect(registry.has(runId!)).toBe(true)
  })

  it('returns undefined for an effect that targets no lights', () => {
    const registry = new PersistentRunRegistry()
    expect(registry.register('empty', effect, transitionsFor({}))).toBeUndefined()
  })

  it('assigns distinct ids to repeated registrations of the same name', () => {
    const registry = new PersistentRunRegistry()
    const first = registry.register('pulse', effect, transitionsFor({ 0: ['a'] }))
    const second = registry.register('pulse', effect, transitionsFor({ 0: ['a'] }))

    expect(first).not.toBe(second)
    expect(registry.has(first!)).toBe(true)
    expect(registry.has(second!)).toBe(true)
  })

  it('cancel drops the run and tolerates undefined and unknown ids', () => {
    const registry = new PersistentRunRegistry()
    const runId = registry.register('pulse', effect, transitionsFor({ 0: ['a'] }))

    registry.cancel(undefined)
    registry.cancel('unknown')
    expect(registry.has(runId!)).toBe(true)

    registry.cancel(runId)
    expect(registry.has(runId!)).toBe(false)
    expect(registry.get(runId!)).toBeUndefined()
  })

  it('clear drops every run', () => {
    const registry = new PersistentRunRegistry()
    const a = registry.register('a', effect, transitionsFor({ 0: ['a'] }))
    const b = registry.register('b', effect, transitionsFor({ 0: ['b'] }))

    registry.clear()

    expect(registry.has(a!)).toBe(false)
    expect(registry.has(b!)).toBe(false)
  })
})
