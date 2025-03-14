import { Effect, TrackedLight, RGBIP, WaitCondition } from "../types";
import { EasingType } from "../easing";


interface CrossFadeColorsEffectParams {
    startColor: RGBIP;
    waitFor?:WaitCondition;
    crossFadeTrigger?: WaitCondition;
    afterStartWait: number;
    endColor: RGBIP;
    afterEndColorWait: number;
    duration: number;
    lights: TrackedLight[];
    layer?: number; 
    easing?: EasingType; 
}


export const getEffectCrossFadeColors = ({
    startColor,
    crossFadeTrigger = 'delay',
    waitFor='delay',
    afterStartWait = 0,
    endColor,
    afterEndColorWait = 0,
    duration = 1000,
    lights,
    layer = 0, 
    easing = EasingType.SIN_OUT, 
}: CrossFadeColorsEffectParams): Effect => {
    
    const effect: Effect = {
        id: "cross-fade-colors",
        description: "Cross-fades light from one color to another.",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: waitFor,
                forTime: afterStartWait,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: crossFadeTrigger,
                untilTime: 0
            },
            {
                lights: lights,
                layer: layer,
                waitFor: 'delay',
                forTime: afterEndColorWait,
                transform: {
                    color: endColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: crossFadeTrigger,
                untilTime: 0
            },
        ]
    };
    
    return effect;
};