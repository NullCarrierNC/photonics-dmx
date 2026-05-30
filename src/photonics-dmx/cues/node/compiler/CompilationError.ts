/**
 * Base error thrown when a node graph fails compilation.
 *
 * The cue and effect compilers each throw a dedicated subclass
 * (`NodeCueCompilationError`, `EffectCompilationError`) so callers and tests can
 * tell which compiler rejected a graph via `instanceof` / `error.name`, while a
 * `catch (e) { if (e instanceof CompilationError) ... }` still handles both.
 */
export class CompilationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompilationError'
  }
}

/**
 * Builds the compiler-specific {@link CompilationError} subclass to throw. Lets the shared
 * compile core in {@link AbstractGraphBuilder} raise the right error type without knowing
 * whether it is compiling a cue or an effect.
 */
export type CompilationErrorFactory = (message: string) => CompilationError
