import { describe, expect, it } from '@jest/globals'

type TypeEscapes = {
  casts: number
  directives: number
  neverCasts: number
  otherDoubleCasts: number
  castHelpers: Array<{ name: string; line: number }>
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { countTypeEscapes } = require('../../../../tools/typeEscapesCore.cjs') as {
  countTypeEscapes: (text: string, fileName: string) => TypeEscapes
}
/* eslint-enable @typescript-eslint/no-require-imports */

describe('countTypeEscapes', () => {
  it('counts a cast through unknown or any', () => {
    const text = [
      'const a = input as unknown as Target',
      'const b = input as any as Target',
      'const c = (input as unknown) as Target',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 3, directives: 0 })
  })

  it('counts a cast through never', () => {
    const text = [
      'const a = input as never as Target',
      'const b = (input as never) as Target',
      'const c = <Target>(<never>input)',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 3, directives: 0 })
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

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 0, directives: 0 })
  })

  it('reads the words in a comment or a string as nothing', () => {
    const text = [
      '// input as unknown as Target',
      "const a = 'input as unknown as Target'",
      'const b = `',
      '// @ts-expect-error inside a template',
      '`',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 0, directives: 0 })
  })

  it('counts each @ts-expect-error and @ts-ignore directive', () => {
    const text = [
      '// @ts-expect-error the fixture is partial',
      'const a: string = 1',
      '/* @ts-ignore */',
      'const b: string = 1',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 0, directives: 2 })
  })

  it('counts a @ts-nocheck that turns checking off for the file', () => {
    expect(countTypeEscapes('// @ts-nocheck\nconst a: string = 1\n', 'a.ts').directives).toBe(1)
  })
})

describe('countTypeEscapes beyond the budget', () => {
  it('reports a single cast to never apart from the budgeted count', () => {
    const text = ['take(input as never)', 'const b = <never>input', 'run((input) as never)'].join(
      '\n',
    )

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 0, neverCasts: 3 })
  })

  it('leaves a cast to never that another cast takes to the budgeted count', () => {
    const text = [
      'const a = input as never as Target',
      'const b = (input as never) as unknown',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 2, neverCasts: 0 })
  })

  it('reports a double cast through a type other than unknown, any or never', () => {
    const text = [
      'const a = input as {} as Target',
      'const b = input as object as Target',
      'const c = input as Partial<Target> as Target',
      'const d = input as Top as Target',
      'const e = input as unknown[] as Target[]',
      'const f = <Target>(<{}>input)',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 0, otherDoubleCasts: 6 })
  })

  it('leaves out a chain the budget counts, a const assertion and a cast out to unknown', () => {
    const text = [
      'const a = input as unknown as Middle as Target',
      'const b = [1, 2] as const as readonly number[]',
      'const c = input as Target as unknown',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toMatchObject({ casts: 1, otherDoubleCasts: 0 })
  })

  it('names each helper whose body is only a cast of its parameter', () => {
    const text = [
      'function cast<T>(value: unknown): T { return value as T }',
      'const asTarget = (input: Source) => input as unknown as Target',
      'const convert = { toConfig: (fields: Fields) => (fields as Config) }',
      'class Reader { read(raw: unknown) { return raw as Target } }',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts').castHelpers).toEqual([
      { name: 'cast', line: 1 },
      { name: 'asTarget', line: 2 },
      { name: 'toConfig', line: 3 },
      { name: 'read', line: 4 },
    ])
  })

  it('leaves out a helper that builds a value, one that checks first and an inline callback', () => {
    const text = [
      'const make = (id: string) => ({ id }) as Row',
      'const rows = items.map((item) => item as Row)',
      'function read(value: unknown): Target { check(value); return value as Target }',
      'const tuple = (a: number) => a as const',
    ].join('\n')

    expect(countTypeEscapes(text, 'a.ts').castHelpers).toEqual([])
  })

  it('reports nothing beyond the budget for a file of budgeted escapes', () => {
    const text = ['// @ts-ignore', 'const a = input as unknown as Target'].join('\n')

    expect(countTypeEscapes(text, 'a.ts')).toEqual({
      casts: 1,
      directives: 1,
      neverCasts: 0,
      otherDoubleCasts: 0,
      castHelpers: [],
    })
  })
})
