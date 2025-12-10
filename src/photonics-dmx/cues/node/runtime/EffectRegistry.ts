import { CompiledYargEffect, CompiledAudioEffect } from '../compiler/EffectCompiler';

export type CompiledEffect = CompiledYargEffect | CompiledAudioEffect;

/**
 * Runtime registry for managing loaded and compiled effects.
 * Effects are registered when a cue loads its effect dependencies.
 */
export class EffectRegistry {
  private effects: Map<string, CompiledEffect> = new Map();

  /**
   * Register a compiled effect with the registry.
   * @param effectId - Unique identifier for the effect
   * @param effect - Compiled effect
   */
  public registerEffect(effectId: string, effect: CompiledEffect): void {
    this.effects.set(effectId, effect);
  }

  /**
   * Get a compiled effect by ID.
   * @param effectId - Unique identifier for the effect
   * @returns Compiled effect or undefined if not found
   */
  public getEffect(effectId: string): CompiledEffect | undefined {
    return this.effects.get(effectId);
  }

  /**
   * Unregister an effect from the registry.
   * @param effectId - Unique identifier for the effect
   */
  public unregisterEffect(effectId: string): void {
    this.effects.delete(effectId);
  }

  /**
   * Check if an effect is registered.
   * @param effectId - Unique identifier for the effect
   */
  public hasEffect(effectId: string): boolean {
    return this.effects.has(effectId);
  }

  /**
   * Get all registered effect IDs.
   */
  public getEffectIds(): string[] {
    return Array.from(this.effects.keys());
  }

  /**
   * Clear all effects from the registry.
   */
  public clear(): void {
    this.effects.clear();
  }

  /**
   * Get the number of registered effects.
   */
  public size(): number {
    return this.effects.size;
  }
}
