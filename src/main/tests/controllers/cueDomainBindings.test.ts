import { describe, it, expect, jest } from '@jest/globals'
import {
  CUE_DOMAIN_BINDINGS,
  applyAllEnabledGroupsFromConfig,
  cueDomainBinding,
  reconcileAndApplyGroups,
  registerCueDomainBinding,
  serializeCueDomainOp,
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

  it('auto-enables newly registered groups and applies only the registered ones', async () => {
    const binding = makeBinding('yarg', {
      registered: ['a', 'c'],
      enabled: ['a', 'b'],
      known: ['a', 'b'],
    })

    const reconciled = await reconcileAndApplyGroups(binding, config)

    expect(reconciled.enabled).toEqual(['a', 'b', 'c'])
    expect(binding.applied.enabled).toEqual(['a', 'c'])
    expect(binding.readStored(config).knownGroups).toEqual(['a', 'b', 'c'])
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

describe('applyAllEnabledGroupsFromConfig', () => {
  const config = {} as ConfigurationManager

  /** Runs the startup reconcile over these bindings alone, restoring the real table after. */
  async function applyAllOver(
    only: CueDomainRegistryBinding[],
    refresh: () => void,
  ): Promise<void> {
    const list = CUE_DOMAIN_BINDINGS as unknown as CueDomainRegistryBinding[]
    const real = list.splice(0, list.length, ...only)
    try {
      await applyAllEnabledGroupsFromConfig(config, refresh)
    } finally {
      list.splice(0, list.length, ...real)
    }
  }

  it('applies every domain and finishes when a domain cannot save its selection', async () => {
    const refused = makeBinding('yarg', { registered: ['a', 'b'] })
    refused.persist = async () => {
      throw new Error('Failed to save configuration')
    }
    const later = makeBinding('audio', { registered: ['c'] })
    const refresh = jest.fn()

    await applyAllOver([refused, later], refresh)

    expect(refused.applied.enabled).toEqual(['a', 'b'])
    expect(later.applied.enabled).toEqual(['c'])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reconciles after a group selection save already queued for the domain', async () => {
    const binding = makeBinding('yarg', {
      registered: ['a', 'b', 'c'],
      enabled: ['a', 'b'],
      known: ['a', 'b'],
    })
    const stored = binding.readStored(config)
    // Writes land in order and only once the store has saved them, as ConfigFile's do.
    let release!: () => void
    const saving = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes: Promise<void> = Promise.resolve()
    binding.persist = (_config, patch) => {
      writes = writes.then(async () => {
        await saving
        Object.assign(stored, patch)
      })
      return writes
    }

    const userDisablesB = serializeCueDomainOp('yarg', async () => {
      await binding.persist(config, { enabledGroups: ['a'] })
      binding.setEnabled(['a'])
    })
    await new Promise((resolve) => setImmediate(resolve))
    const startup = applyAllOver([binding], () => {})
    release()
    await Promise.all([userDisablesB, startup])

    expect(stored.enabledGroups).toEqual(['a', 'c'])
    expect(binding.applied.enabled).toEqual(['a', 'c'])
  })
})
