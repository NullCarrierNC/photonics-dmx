import { describe, expect, it, jest } from '@jest/globals'
import { clearAndBlackOutChains } from '../../controllers/chainBlackout'
import type { RigChain } from '../../controllers/RigChain'

function chain(rigId: string, blackout: (fadeMs: number) => Promise<void> = async () => {}) {
  const sequencer = { removeAllEffects: jest.fn(), blackout: jest.fn(blackout) }
  return { chain: { rigId, sequencer } as unknown as RigChain, sequencer }
}

describe('clearAndBlackOutChains', () => {
  it('clears and blacks out every chain', async () => {
    const a = chain('a')
    const b = chain('b')

    await clearAndBlackOutChains([a.chain, b.chain], 'disabling YARG')

    for (const { sequencer } of [a, b]) {
      expect(sequencer.removeAllEffects).toHaveBeenCalledTimes(1)
      expect(sequencer.blackout).toHaveBeenCalledWith(0)
    }
  })

  it('still blacks out the rest when one chain fails', async () => {
    const failing = chain('a', async () => {
      throw new Error('sender gone')
    })
    const next = chain('b')

    await expect(
      clearAndBlackOutChains([failing.chain, next.chain], 'disabling Audio'),
    ).resolves.toBeUndefined()

    expect(next.sequencer.blackout).toHaveBeenCalledWith(0)
  })
})
