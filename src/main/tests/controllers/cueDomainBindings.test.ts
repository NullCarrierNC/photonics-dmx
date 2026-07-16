import { describe, it, expect } from '@jest/globals'
import { CUE_DOMAIN_BINDINGS, cueDomainBinding } from '../../controllers/cueDomainBindings'
import { CUE_DOMAINS } from '../../../services/configuration/cueDomainTypes'

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
})
