import { Effect, RGBIO } from "../types";
import { IEffect } from "./interfaces/IEffect";
import { EasingType } from "../easing";

/**
 * Interface for fade in colour fade out effect parameters, extending the base effect interface
 */
interface FadeInColorFadeOutEffectParams extends IEffect {
    /** The starting colour */
    startColor: RGBIO;
    /** The ending colour */
    endColor: RGBIO;
    /** Time to wait before starting the fade in */
    waitBeforeFadeIn: number;
    /** Duration of the fade in */
    fadeInDuration: number;
    /** Time to hold the end colour */
    holdDuration: number;
    /** Duration of the fade out */
    fadeOutDuration: number;
    /** Time to wait after the fade out */
    waitAfterFadeOut: number;
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
    waitFor = 'none',
    waitUntil = 'none',
}: FadeInColorFadeOutEffectParams): Effect => {
    
    const effect: Effect = {
        id: "cross-fade-colors",
        description: "Cross-fades light from one colour to another.",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: waitFor,
                forTime: 0,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: 0,
                },
                waitUntil: waitUntil,
                untilTime: waitBeforeFadeIn
            },
            {
                lights: lights,
                layer: layer,
                waitFor: waitFor,
                forTime: 0,
                transform: {
                    color: endColor,
                    easing: easing,
                    duration: fadeInDuration,
                },
                waitUntil: waitUntil,
                untilTime: holdDuration
            },
            {
                lights: lights,
                layer: layer,
                waitFor: waitFor,
                forTime: 0,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: fadeOutDuration,
                },
                waitUntil: 'none',
                untilTime: waitAfterFadeOut
            },
        ]
    };
    
    return effect;
};