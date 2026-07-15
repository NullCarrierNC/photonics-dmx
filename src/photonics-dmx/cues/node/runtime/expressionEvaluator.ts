/**
 * A tiny, dependency-free arithmetic expression compiler for the `expression` logic node. Collapses the
 * long math->math node chains authors previously hand-wired (progress `a+(b-a)*t`, geometry, index maths,
 * tempo multiples) into a single readable formula.
 *
 * Grammar (numbers, variables, the five arithmetic operators, parentheses, unary minus, and a fixed set of
 * built-in functions):
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/' | '%') factor)*
 *   factor := '-' factor | primary
 *   primary:= number | ident '(' args ')' | ident | '(' expr ')'
 *
 * Built-ins: min/max (variadic), clamp(v,lo,hi), wrap(n,r) (proper modulo, matches the math node),
 * abs, floor, ceil, round, sign, sqrt, pow(a,b), sin, cos. Constant: `pi`. Any other identifier is a
 * VARIABLE, resolved through the caller's `resolve(name)` (which reads the cue's variable store exactly
 * like every other node, so scoping/typing are identical). Divide and modulus by zero yield 0, matching
 * the `math` node's "absorb bad operands" convention rather than throwing at showtime.
 */

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '%'; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }

export interface CompiledExpression {
  /** Evaluate against a variable resolver. Never throws for math edge cases (div/mod by zero -> 0). */
  evaluate(resolve: (name: string) => number): number
  /** Distinct VARIABLE identifiers referenced (excludes functions and `pi`) — for declared-var checks. */
  variables: string[]
}

const CONSTANTS: Record<string, number> = { pi: Math.PI }

/** arity: -1 = variadic (>=1). */
const FUNCTIONS: Record<string, { arity: number; fn: (a: number[]) => number }> = {
  min: { arity: -1, fn: (a) => Math.min(...a) },
  max: { arity: -1, fn: (a) => Math.max(...a) },
  clamp: { arity: 3, fn: ([v, lo, hi]) => Math.min(Math.max(v, lo), hi) },
  wrap: { arity: 2, fn: ([n, r]) => (r === 0 ? 0 : ((n % r) + r) % r) },
  abs: { arity: 1, fn: ([a]) => Math.abs(a) },
  floor: { arity: 1, fn: ([a]) => Math.floor(a) },
  ceil: { arity: 1, fn: ([a]) => Math.ceil(a) },
  round: { arity: 1, fn: ([a]) => Math.round(a) },
  sign: { arity: 1, fn: ([a]) => Math.sign(a) },
  sqrt: { arity: 1, fn: ([a]) => (a < 0 ? 0 : Math.sqrt(a)) },
  pow: { arity: 2, fn: ([a, b]) => a ** b },
  sin: { arity: 1, fn: ([a]) => Math.sin(a) },
  cos: { arity: 1, fn: ([a]) => Math.cos(a) },
}

export class ExpressionParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionParseError'
  }
}

// --- tokenizer -------------------------------------------------------------
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const num = Number(src.slice(i, j))
      if (!Number.isFinite(num))
        throw new ExpressionParseError(`invalid number '${src.slice(i, j)}'`)
      toks.push({ t: 'num', v: num })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++
      toks.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/%(),'.includes(c)) {
      toks.push({ t: 'op', v: c })
      i++
      continue
    }
    throw new ExpressionParseError(`unexpected character '${c}' in expression`)
  }
  return toks
}

// --- recursive-descent parser ---------------------------------------------
function parse(src: string): { ast: Node; variables: string[] } {
  const toks = tokenize(src)
  const vars = new Set<string>()
  let pos = 0
  const peek = (): Tok | undefined => toks[pos]
  const eat = (v?: string): Tok => {
    const tk = toks[pos]
    if (!tk) throw new ExpressionParseError('unexpected end of expression')
    if (v !== undefined && !(tk.t === 'op' && tk.v === v)) {
      throw new ExpressionParseError(`expected '${v}'`)
    }
    pos++
    return tk
  }

  const parseExpr = (): Node => {
    let node = parseTerm()
    for (let tk = peek(); tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-'); tk = peek()) {
      eat()
      node = { k: 'bin', op: tk.v as '+' | '-', a: node, b: parseTerm() }
    }
    return node
  }
  const parseTerm = (): Node => {
    let node = parseFactor()
    for (
      let tk = peek();
      tk && tk.t === 'op' && (tk.v === '*' || tk.v === '/' || tk.v === '%');
      tk = peek()
    ) {
      eat()
      node = { k: 'bin', op: tk.v as '*' | '/' | '%', a: node, b: parseFactor() }
    }
    return node
  }
  const parseFactor = (): Node => {
    const tk = peek()
    if (tk && tk.t === 'op' && tk.v === '-') {
      eat()
      return { k: 'neg', a: parseFactor() }
    }
    return parsePrimary()
  }
  const parsePrimary = (): Node => {
    const tk = peek()
    if (!tk) throw new ExpressionParseError('unexpected end of expression')
    if (tk.t === 'num') {
      eat()
      return { k: 'num', v: tk.v }
    }
    if (tk.t === 'op' && tk.v === '(') {
      eat('(')
      const node = parseExpr()
      eat(')')
      return node
    }
    if (tk.t === 'id') {
      eat()
      const next = peek()
      if (next && next.t === 'op' && next.v === '(') {
        // function call
        const fn = FUNCTIONS[tk.v]
        if (!fn) throw new ExpressionParseError(`unknown function '${tk.v}'`)
        eat('(')
        const args: Node[] = []
        if (!(peek()?.t === 'op' && peek()?.v === ')')) {
          args.push(parseExpr())
          while (peek()?.t === 'op' && peek()?.v === ',') {
            eat(',')
            args.push(parseExpr())
          }
        }
        eat(')')
        if (fn.arity === -1) {
          if (args.length < 1)
            throw new ExpressionParseError(`${tk.v}() needs at least one argument`)
        } else if (args.length !== fn.arity) {
          throw new ExpressionParseError(
            `${tk.v}() takes ${fn.arity} arguments, got ${args.length}`,
          )
        }
        return { k: 'call', name: tk.v, args }
      }
      if (tk.v in CONSTANTS) return { k: 'num', v: CONSTANTS[tk.v] }
      vars.add(tk.v)
      return { k: 'var', name: tk.v }
    }
    throw new ExpressionParseError(`unexpected token '${tk.v}'`)
  }

  const ast = parseExpr()
  if (pos !== toks.length) throw new ExpressionParseError('trailing characters in expression')
  return { ast, variables: [...vars] }
}

function evalNode(node: Node, resolve: (name: string) => number): number {
  switch (node.k) {
    case 'num':
      return node.v
    case 'var': {
      const v = resolve(node.name)
      return Number.isFinite(v) ? v : 0
    }
    case 'neg':
      return -evalNode(node.a, resolve)
    case 'bin': {
      const a = evalNode(node.a, resolve)
      const b = evalNode(node.b, resolve)
      switch (node.op) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return b === 0 ? 0 : a / b
        case '%':
          return b === 0 ? 0 : a % b
      }
      return 0
    }
    case 'call':
      return FUNCTIONS[node.name].fn(node.args.map((a) => evalNode(a, resolve)))
  }
}

// Parse cache keyed by source text, so identical expressions across nodes share one AST and reparse never
// happens on the per-frame path. Failures are cached too (thrown on every access) so a bad expression
// doesn't reparse each frame.
const cache = new Map<string, CompiledExpression | ExpressionParseError>()

/** Compile (memoized) an expression source into an evaluatable form. Throws {@link ExpressionParseError}. */
export function compileExpression(src: string): CompiledExpression {
  const hit = cache.get(src)
  if (hit) {
    if (hit instanceof ExpressionParseError) throw hit
    return hit
  }
  try {
    const { ast, variables } = parse(src)
    const compiled: CompiledExpression = {
      evaluate: (resolve) => evalNode(ast, resolve),
      variables,
    }
    cache.set(src, compiled)
    return compiled
  } catch (err) {
    const e = err instanceof ExpressionParseError ? err : new ExpressionParseError(String(err))
    cache.set(src, e)
    throw e
  }
}

/** Parse-only: the distinct variable identifiers an expression references (for validation). Returns [] on
 *  a parse error (the schema/validator reports the parse failure separately). */
export function expressionVariables(src: string): string[] {
  try {
    return compileExpression(src).variables
  } catch {
    return []
  }
}
