import { describe, expect, it } from '@jest/globals'
import { CUE_DOMAINS, createDefaultCueDomains } from '../cueDomainTypes'

describe('RB3 cue domains', () => {
  it('registers rb3 and rb3Motion alongside the yarg and audio domains', () => {
    expect(CUE_DOMAINS).toContain('rb3')
    expect(CUE_DOMAINS).toContain('rb3Motion')
  })

  it('defaults the rb3 lighting domain like yarg lighting and rb3Motion like the motion domains', () => {
    const domains = createDefaultCueDomains()
    expect(domains.rb3.selectionMode).toBe('withinSong')
    expect(domains.rb3.enabledGroups).toEqual([])
    expect(domains.rb3Motion.selectionMode).toBe('perCueChange')
    expect(domains.rb3Motion.probabilityPercent).toBe(50)
    expect(domains.rb3Motion.minimumHoldMs).toBe(5000)
  })
})
