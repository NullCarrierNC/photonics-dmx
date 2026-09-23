/** @jest-environment jsdom */
/**
 * The editor reads a verdict off whatever the validators answer with, so a refusal has to arrive
 * as a verdict too rather than as an error the editor would read fields off.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'
import type { EffectFile, NodeCueFile } from '../../../shared/ipcTypes'

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>()
installWindowApi(invoke)

import { validateEffect, validateNodeCue } from './cueAuthoring'

const cue = {} as NodeCueFile
const effect = {} as EffectFile

describe('cue validation', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('reports a refused cue validation as a cue that cannot be used', async () => {
    invoke.mockResolvedValue({ success: false, error: 'no cue loader' })

    const result = await validateNodeCue({ content: cue })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['no cue loader'])
  })

  it('reports a refused effect validation the same way', async () => {
    invoke.mockResolvedValue({ success: false, error: 'no effect loader' })

    const result = await validateEffect({ content: effect })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['no effect loader'])
  })

  it('passes a verdict through untouched', async () => {
    invoke.mockResolvedValue({ valid: false, errors: ['no cues'], mode: 'yarg' })

    const result = await validateNodeCue({ content: cue })

    expect(result).toEqual({ valid: false, errors: ['no cues'], mode: 'yarg' })
    expect(invoke).toHaveBeenCalledWith(NODE_CUES.VALIDATE, { content: cue })
  })

  it('asks the effect channel for an effect verdict', async () => {
    invoke.mockResolvedValue({ valid: true, errors: [] })

    await validateEffect({ content: effect })

    expect(invoke).toHaveBeenCalledWith(EFFECTS.VALIDATE, { content: effect })
  })
})
