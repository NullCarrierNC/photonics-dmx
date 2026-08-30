import { describe, it, expect, jest } from '@jest/globals'
import {
  CUE_DOMAIN_BINDINGS,
  cueDomainBinding,
  reconcileAndApplyGroups,
  registerCueDomainBinding,
  type CueDomainRegistryBinding,
} from '../../controllers/cueDomainBindings'
import { CUE_DOMAINS } from '../../../services/configuration/cueDomainTypes'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'

/**
 * The bindings are the single source of truth for reconciling a cue domain's groups. If a new
 * domain is added to CUE_DOMAINS without a matching binding, the reconcile silently skips it, so
 * this pins that every domain is bound exactly once.
 */
describe('cue domain bindings', () => {
  it('covers every cue domain exactly once', () => {
    const bound = CUE_DOMAIN_BINDINGS.map((b) => b.domain).sort()
    expect(bound).toEqual([...CUE_DOMAINS].sort())
    expect(new Set(bound).size).toBe(bound.length)
  })

  it('looks up each domain by name', () => {
    for (const domain of CUE_DOMAINS) {
      expect(cueDomainBinding(domain).domain).toBe(domain)
    }
  })

  it('throws for an unknown domain', () => {
    expect(() => cueDomainBinding('nope' as never)).toThrow(/No cue-domain registry binding/)
  })

  it('gives every lighting and motion domain its startup settings hook', () => {
    for (const binding of CUE_DOMAIN_BINDINGS) {
      expect(typeof binding.applyStartupSettings).toBe('function')
    }
  })

  it('registers a domain contributed from outside the table', () => {
    const added = makeBinding('contributed' as never)
    try {
      registerCueDomainBinding(added)
      expect(cueDomainBinding('contributed' as never)).toBe(added)
    } finally {
      removeBinding('contributed' as never)
    }
  })
})

/** Minimal binding over an in-memory registry and store, for the reconcile behaviours. */
function makeBinding(
  domain: CueDomainRegistryBinding['domain'],
  state: { registered?: string[]; enabled?: string[]; known?: string[] } = {},
): CueDomainRegistryBinding & { applied: { enabled: string[]; disabled: string[] } } {
  const stored = {
    enabledGroups: state.enabled ?? [],
    knownGroups: state.known ?? [],
    disabledCues: {},
  }
  const applied = { enabled: [] as string[], disabled: [] as string[] }
  return {
    domain,
    applied,
    getRegisteredIds: () => state.registered ?? [],
    setEnabled: (ids) => {
      applied.enabled = ids
    },
    setDisabled: () => {
      applied.disabled = Object.keys(stored.disabledCues)
    },
    readStored: () => stored,
    persist: async (_config, patch) => {
      Object.assign(stored, patch)
    },
  }
}

function removeBinding(domain: CueDomainRegistryBinding['domain']): void {
  const list = CUE_DOMAIN_BINDINGS as unknown as CueDomainRegistryBinding[]
  const idx = list.findIndex((b) => b.domain === domain)
  if (idx >= 0) list.splice(idx, 1)
}

describe('reconcileAndApplyGroups', () => {
  const config = {} as ConfigurationManager

  it('auto-enables newly registered groups and drops deregistered ones', async () => {
    const binding = makeBinding('yarg', {
      registered: ['a', 'c'],
      enabled: ['a', 'b'],
      known: ['a', 'b'],
    })

    const reconciled = await reconcileAndApplyGroups(binding, config)

    expect(reconciled.enabled).toEqual(['a', 'c'])
    expect(binding.applied.enabled).toEqual(['a', 'c'])
    expect(binding.readStored(config).knownGroups).toEqual(['a', 'c'])
  })

  it('seeds an extra group into the enabled set', async () => {
    const binding = makeBinding('yarg', {
      registered: ['a', 'b'],
      enabled: ['a'],
      known: ['a', 'b'],
    })

    const reconciled = await reconcileAndApplyGroups(binding, config, ['b'])

    expect(reconciled.enabled).toEqual(['a', 'b'])
  })

  it('skips the write when the stored selection already matches', async () => {
    const binding = makeBinding('yarg', { registered: ['a'], enabled: ['a'], known: ['a'] })
    const persist = jest.fn(binding.persist)
    binding.persist = persist as typeof binding.persist

    await reconcileAndApplyGroups(binding, config)

    expect(persist).not.toHaveBeenCalled()
    expect(binding.applied.enabled).toEqual(['a'])
  })
})
