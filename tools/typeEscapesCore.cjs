/**
 * The type-escape budget's pure core: counting, in one source file, the casts that pass through
 * `unknown`, `any` or `never` and the comment directives that switch type checking off, and finding
 * the reported-only escapes the budget does not hold. type-escape-budget.mjs owns the walk.
 *
 * The file is parsed, so the same words in a comment, a string or a template are not counted.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const ts = require('typescript')

/** The top and bottom types, which any value can be cast to and then out of. */
const LAUNDERING_TYPES = new Set([
  ts.SyntaxKind.UnknownKeyword,
  ts.SyntaxKind.AnyKeyword,
  ts.SyntaxKind.NeverKeyword,
])

/** Targets that only widen, so a chain ending in one hides nothing from the checker. */
const WIDENING_TYPES = new Set([ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.AnyKeyword])

/**
 * @param {import('typescript').Node} node
 * @returns {boolean} true for a cast. A const assertion is not one, as it only narrows a literal
 *   to itself.
 */
function isCast(node) {
  return (
    (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
    !ts.isConstTypeReference(node.type)
  )
}

/** @param {import('typescript').Node} node */
function unwrapParens(node) {
  let inner = node
  while (ts.isParenthesizedExpression(inner)) inner = inner.expression
  return inner
}

/**
 * @param {import('typescript').Node} node
 * @returns {boolean} true for a cast whose operand is itself a cast to `unknown`, `any` or `never`
 */
function castsThroughTopType(node) {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false
  const inner = unwrapParens(node.expression)
  if (!ts.isAsExpression(inner) && !ts.isTypeAssertionExpression(inner)) return false
  return LAUNDERING_TYPES.has(inner.type.kind)
}

/**
 * @param {import('typescript').Node} node a cast
 * @returns {boolean} true when the cast is the operand of another cast
 */
function isCastOperand(node) {
  let parent = node.parent
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent
  return parent !== undefined && isCast(parent)
}

/**
 * @param {import('typescript').Node} top the outermost cast of a chain
 * @returns {Array<import('typescript').AsExpression | import('typescript').TypeAssertion>} the
 *   chain's casts, outermost first
 */
function castChain(top) {
  const links = []
  let link = top
  while (isCast(link)) {
    links.push(link)
    link = unwrapParens(link.expression)
  }
  return links
}

/**
 * @param {import('typescript').Node} fn
 * @returns {string | null} the name a function is declared or assigned under, or null for one
 *   passed inline
 */
function helperName(fn) {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) {
    return fn.name.getText()
  }
  const holder = fn.parent
  if (
    (ts.isVariableDeclaration(holder) ||
      ts.isPropertyAssignment(holder) ||
      ts.isPropertyDeclaration(holder)) &&
    holder.initializer === fn
  ) {
    return holder.name.getText()
  }
  return null
}

/**
 * @param {import('typescript').Node} fn
 * @returns {boolean} true for a function whose whole body returns a cast of one of its parameters
 */
function bodyIsParameterCast(fn) {
  const body = fn.body
  if (!body) return false
  let returned = body
  if (ts.isBlock(body)) {
    const [only, ...rest] = body.statements
    if (!only || rest.length > 0 || !ts.isReturnStatement(only) || !only.expression) return false
    returned = only.expression
  }
  const chain = castChain(unwrapParens(returned))
  if (chain.length === 0) return false
  const operand = unwrapParens(chain[chain.length - 1].expression)
  return (
    ts.isIdentifier(operand) &&
    fn.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === operand.text)
  )
}

/**
 * @typedef {object} TypeEscapes
 * @property {number} casts casts through `unknown`, `any` or `never`, which the budget holds
 * @property {number} directives `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck` directives
 * @property {number} neverCasts single casts to `never`, which fit any typed slot
 * @property {number} otherDoubleCasts chains of casts through a middle type other than `unknown`,
 *   `any` or `never`, such as `{}`, `object`, `Partial<T>` or an alias
 * @property {Array<{ name: string, line: number }>} castHelpers named functions whose body only
 *   casts a parameter
 */

/**
 * @param {string} text
 * @param {string} fileName decides how the file is parsed, so a .tsx file reads as JSX
 * @returns {TypeEscapes}
 */
function countTypeEscapes(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  let casts = 0
  let neverCasts = 0
  let otherDoubleCasts = 0
  /** @type {Array<{ name: string, line: number }>} */
  const castHelpers = []

  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (castsThroughTopType(node)) casts++
    if (isCast(node) && !isCastOperand(node)) {
      const chain = castChain(node)
      if (chain.length === 1) {
        if (node.type.kind === ts.SyntaxKind.NeverKeyword) neverCasts++
      } else if (!chain.some(castsThroughTopType) && !WIDENING_TYPES.has(node.type.kind)) {
        otherDoubleCasts++
      }
    }
    if (ts.isFunctionLike(node) && bodyIsParameterCast(node)) {
      const name = helperName(node)
      if (name !== null) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        castHelpers.push({ name, line })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  // The parser records every @ts-expect-error and @ts-ignore it honours, and a leading
  // @ts-nocheck as a checkJs directive that turns checking off.
  const directives =
    (source.commentDirectives ?? []).length + (source.checkJsDirective?.enabled === false ? 1 : 0)
  return { casts, directives, neverCasts, otherDoubleCasts, castHelpers }
}

module.exports = { countTypeEscapes }
