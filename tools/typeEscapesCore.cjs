/**
 * The type-escape budget's pure core: counting, in one source file, the casts that pass through
 * `unknown`, `any` or `never` and the comment directives that switch type checking off. The CLI in
 * type-escape-budget.mjs owns the filesystem walk and the budget.
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

/**
 * @param {import('typescript').Node} node
 * @returns {boolean} true for a cast whose operand is itself a cast to `unknown`, `any` or `never`
 */
function castsThroughTopType(node) {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false
  let inner = node.expression
  while (ts.isParenthesizedExpression(inner)) inner = inner.expression
  if (!ts.isAsExpression(inner) && !ts.isTypeAssertionExpression(inner)) return false
  return LAUNDERING_TYPES.has(inner.type.kind)
}

/**
 * @param {string} text
 * @param {string} fileName decides how the file is parsed, so a .tsx file reads as JSX
 * @returns {{ casts: number, directives: number }} casts through `unknown`, `any` or `never`, and
 *   the `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck` directives TypeScript honours
 */
function countTypeEscapes(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest)
  let casts = 0
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (castsThroughTopType(node)) casts++
    ts.forEachChild(node, visit)
  }
  visit(source)
  // The parser records every @ts-expect-error and @ts-ignore it honours, and a leading
  // @ts-nocheck as a checkJs directive that turns checking off.
  const directives =
    (source.commentDirectives ?? []).length + (source.checkJsDirective?.enabled === false ? 1 : 0)
  return { casts, directives }
}

module.exports = { countTypeEscapes }
