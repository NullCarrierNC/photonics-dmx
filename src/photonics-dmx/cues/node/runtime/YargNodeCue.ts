import { INetCue, CueStyle } from '../../interfaces/INetCue';
import { CueData, CueType } from '../../types/cueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CompiledYargCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';

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
    for (const plan of this.compiledCue.actions) {
      const lights = ActionEffectFactory.resolveLights(lightManager, plan.action.target);
      if (!lights.length) {
        continue;
      }

      const effect = ActionEffectFactory.buildEffect({
        action: plan.action,
        lights,
        waitCondition: plan.event.eventType
      });

      if (effect) {
        const effectName = `${this.id}:${plan.action.id}:${plan.event.id}`;
        sequencer.addEffect(effectName, effect);
      }
    }
  }

  onStop(): void {
    // No persistent state to clear
  }
}

