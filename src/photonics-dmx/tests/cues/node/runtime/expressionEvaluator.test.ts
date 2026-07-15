import {
  compileExpression,
  expressionVariables,
  ExpressionParseError,
} from '../../../../cues/node/runtime/expressionEvaluator'

const ev = (src: string, vars: Record<string, number> = {}) =>
  compileExpression(src).evaluate((name) => vars[name] ?? 0)

describe('expressionEvaluator', () => {
  it('evaluates arithmetic with correct precedence and parentheses', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('2 * 3 + 4 / 2')).toBe(8)
    expect(ev('10 - 2 - 3')).toBe(5) // left-associative
  })

  it('handles unary minus and decimals', () => {
    expect(ev('-5 + 2')).toBe(-3)
    expect(ev('-(3 * 2)')).toBe(-6)
    expect(ev('0.5 * 4')).toBe(2)
    expect(ev('.25 + .25')).toBe(0.5)
  })

  it('resolves variables through the resolver', () => {
    expect(ev('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7)
    // the shuffle progress lerp: p = a + (b - a) * t
    expect(ev('a + (b - a) * t', { a: 0.2, b: 0.8, t: 0.5 })).toBeCloseTo(0.5)
    // vsel = pick*2 + dir
    expect(ev('pick * 2 + dir', { pick: 3, dir: 1 })).toBe(7)
  })

  it('divide and modulus by zero yield 0 (math-node parity)', () => {
    expect(ev('5 / 0')).toBe(0)
    expect(ev('5 % 0')).toBe(0)
  })

  it('supports built-in functions and pi', () => {
    expect(ev('min(3, 1, 2)')).toBe(1)
    expect(ev('max(3, 1, 2)')).toBe(3)
    expect(ev('clamp(9, 0, 5)')).toBe(5)
    expect(ev('clamp(-1, 0, 5)')).toBe(0)
    expect(ev('wrap(-1, 4)')).toBe(3) // proper modulo
    expect(ev('floor(2.9)')).toBe(2)
    expect(ev('round(2.5)')).toBe(3)
    expect(ev('abs(-4)')).toBe(4)
    expect(ev('pow(2, 3)')).toBe(8)
    expect(ev('pi')).toBeCloseTo(Math.PI)
    expect(ev('cos(0)')).toBe(1)
  })

  it('reports the referenced variable identifiers (not functions or pi)', () => {
    expect(expressionVariables('a + (b - a) * t').sort()).toEqual(['a', 'b', 't'])
    expect(expressionVariables('clamp(x, 0, pi)').sort()).toEqual(['x'])
    expect(expressionVariables('min(x, y) * 2')).toEqual(expect.arrayContaining(['x', 'y']))
  })

  it('throws a parse error on malformed input and an unknown function', () => {
    expect(() => compileExpression('1 +')).toThrow(ExpressionParseError)
    expect(() => compileExpression('(1 + 2')).toThrow(ExpressionParseError)
    expect(() => compileExpression('1 2')).toThrow(ExpressionParseError)
    expect(() => compileExpression('bogus(1)')).toThrow(/unknown function/)
    expect(() => compileExpression('clamp(1, 2)')).toThrow(/takes 3 arguments/)
    expect(() => compileExpression('2 @ 3')).toThrow(/unexpected character/)
  })

  it('caches compilation (same source returns the same compiled object)', () => {
    const a = compileExpression('x * 2 + 1')
    const b = compileExpression('x * 2 + 1')
    expect(a).toBe(b)
  })
})
