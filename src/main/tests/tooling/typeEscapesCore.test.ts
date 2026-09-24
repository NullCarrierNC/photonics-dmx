import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { countTypeEscapes } = require('../../../../tools/typeEscapesCore.cjs') as {
  countTypeEscapes: (text: string, fileName: string) => { casts: number; directives: number }
}
/* eslint-enable @typescript-eslint/no-require-imports */

describe('countTypeEscapes', () => {
  it('counts a cast through unknown or any', () => {
    const text = [
      'const a = input as unknown as Target',
      'const b = input as any as Target',
      'const c = (input as unknown) as Target',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({ casts: 3, directives: 0 })
  })

  it('counts a cast through never', () => {
    const text = [
      'const a = input as never as Target',
      'const b = (input as never) as Target',
      'const c = <Target>(<never>input)',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({ casts: 3, directives: 0 })
  })

  it('leaves out a cast whose operand is a call returning never', () => {
    expect(countTypeEscapes('const a = compile(input as never) as never', 'a.ts').casts).toBe(0)
  })

  it('counts the angle-bracket form in a .ts file', () => {
    expect(countTypeEscapes('const a = <Target>(<unknown>input)', 'a.ts').casts).toBe(1)
  })

  it('counts a cast inside JSX in a .tsx file', () => {
    const text = 'const el = <Row value={input as unknown as string} />'

    expect(countTypeEscapes(text, 'a.tsx').casts).toBe(1)
  })

  it('counts a chain of casts once per step through unknown', () => {
    expect(countTypeEscapes('const a = input as unknown as Middle as Target', 'a.ts').casts).toBe(1)
  })

  it('leaves out a single cast, and one to unknown alone', () => {
    const text = ['const a = input as Target', 'const b = input as unknown'].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({ casts: 0, directives: 0 })
  })

  it('reads the words in a comment or a string as nothing', () => {
    const text = [
      '// input as unknown as Target',
      "const a = 'input as unknown as Target'",
      'const b = `',
      '// @ts-expect-error inside a template',
      '`',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({ casts: 0, directives: 0 })
  })

  it('counts each @ts-expect-error and @ts-ignore directive', () => {
    const text = [
      '// @ts-expect-error the fixture is partial',
      'const a: string = 1',
      '/* @ts-ignore */',
      'const b: string = 1',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({ casts: 0, directives: 2 })
  })

  it('counts a @ts-nocheck that turns checking off for the file', () => {
    expect(countTypeEscapes('// @ts-nocheck\nconst a: string = 1\n', 'a.ts').directives).toBe(1)
  })
})
