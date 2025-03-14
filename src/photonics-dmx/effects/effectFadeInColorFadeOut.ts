import { Effect, TrackedLight, RGBIP, } from "../types";
import { EasingType } from "../easing";


interface FadeInColorFadeOutEffectParams {
    startColor:RGBIP,
    waitBeforeFadeIn: number,
    endColor:RGBIP,
    fadeInDuration:number,
    holdDuration: number,
    fadeOutDuration: number,
    waitAfterFadeOut: number,
    lights: TrackedLight[];
    layer?: number; 
    easing?: EasingType; 
}


export const getEffectFadeInColorFadeOut = ({
    startColor,
    waitBeforeFadeIn,
    endColor,
    fadeInDuration,
    holdDuration,
    fadeOutDuration,
    waitAfterFadeOut,
    lights,
    layer = 0, 
    easing = EasingType.SIN_OUT, 
}: FadeInColorFadeOutEffectParams): Effect => {
    
    const effect: Effect = {
        id: "cross-fade-colors",
        description: "Cross-fades light from one color to another.",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: 'delay',
                forTime: 0,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: 0,
                },
                waitUntil: 'delay',
                untilTime: waitBeforeFadeIn
            },
            {
                lights: lights,
                layer: layer,
                waitFor: 'delay',
                forTime: 0,
                transform: {
                    color: endColor,
                    easing: easing,
                    duration: fadeInDuration,
                },
                waitUntil: 'delay',
                untilTime: holdDuration
            },
            {
                lights: lights,
                layer: layer,
                waitFor: 'delay',
                forTime: 0,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: fadeOutDuration,
                },
                waitUntil: 'delay',
                untilTime: waitAfterFadeOut
            },
        ]
    };
    
    return effect;
};