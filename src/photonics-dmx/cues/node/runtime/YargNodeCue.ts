import { INetCue, CueStyle } from '../../interfaces/INetCue';
import { CueData, CueType } from '../../types/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CompiledActionChain, CompiledYargCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import { YargEventNode } from '../../types/nodeCueTypes';
import { Effect } from '../../../types';

export class YargNodeCue implements INetCue {
  public readonly cueId: CueType;
  public readonly id: string;
  public readonly description?: string;
  public readonly style: CueStyle;

  constructor(groupId: string, private readonly compiledCue: CompiledYargCue) {
    const definition = compiledCue.definition;
    this.cueId = definition.cueType;
    this.id = `${groupId}:${definition.id}`;
    this.description = definition.description;
    this.style = definition.style === 'secondary' ? CueStyle.Secondary : CueStyle.Primary;
  }

  async execute(_parameters: CueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    for (const chain of this.compiledCue.chains) {
      const effect = this.buildChainEffect(chain, lightManager);
      if (!effect) {
        continue;
      }

      const effectName = `${this.id}:${chain.chainId}`;
        sequencer.addEffect(effectName, effect);
    }
  }

  onStop(): void {
    // No persistent state to clear
  }

  private buildChainEffect(chain: CompiledActionChain<YargEventNode>, lightManager: DmxLightManager): Effect | null {
    let combinedEffect: Effect | null = null;
   
    for (const step of chain.actions) {
      const lights = ActionEffectFactory.resolveLights(lightManager, step.action.target);
      if (!lights.length) {
        continue;
      }

      const effect = ActionEffectFactory.buildEffect({
        action: step.action,
        lights,
        // Let actions use their own waitFor; delayMs carries the chain offset.
        waitCondition: undefined,
        waitTime: step.delayMs
      });

      if (!effect) {
        continue;
      }

      if (!combinedEffect) {
        combinedEffect = {
          ...effect,
          transitions: [...effect.transitions]
        };
      } else {
        combinedEffect.transitions.push(...effect.transitions);
      }
    }

    return combinedEffect;
  }
}

