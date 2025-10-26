import { Effect, RGBIO, WaitCondition } from "../types";
import { EasingType } from "../easing";
import { IEffect } from "./interfaces/IEffect";

/**
 * Interface for cross-fade effect parameters, extending the base effect interface
 */
interface CrossFadeColorsEffectParams extends IEffect {
    /** The starting colour for the cross-fade */
    startColor: RGBIO;
    /** The ending colour for the cross-fade */
    endColor: RGBIO;
    /** Time to wait after the start colour is applied */
    afterStartWait: number;
    /** Time to wait after the end colour is applied */
    afterEndColorWait: number;
    /** The condition that triggers the cross-fade */
    crossFadeTrigger?: WaitCondition;
}

export const getEffectCrossFadeColors = ({
    startColor,
    crossFadeTrigger = 'delay',
    waitFor = 'delay',
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
        description: "Cross-fades light from one colour to another.",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitForCondition: waitFor,
                waitForTime: afterStartWait,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntilCondition: crossFadeTrigger,
                waitUntilTime: 0
            },
            {
                lights: lights,
                layer: layer,
                waitForCondition: 'delay',
                waitForTime: afterEndColorWait,
                transform: {
                    color: endColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntilCondition: crossFadeTrigger,
                waitUntilTime: 0
            },
        ]
    };
    
    return effect;
};