import { Effect, RGBIO } from "../types";
import { EasingType } from "../easing";
import { IEffect } from "./interfaces/IEffect";


/**
 * Interface for single color effect parameters, extending the base effect interface
 */
interface SingleColorEffectParams extends IEffect {
    /** The colour to set the lights to */
    color: RGBIO;
    /** Duration of the effect */
    duration: number;
}

/**
 * Creates a single color effect for all specified lights
 * 
 * @param params - The effect parameters including colour, duration, and easing
 * @returns An Effect object that can be applied to lights
 */
export const getEffectSingleColor = ({
    waitFor = 'none',
    forTime = 0,
    color,
    duration,
    waitUntil = 'none',
    untilTime = 0,
    lights,
    layer = 0,
    easing = EasingType.SIN_OUT
}: SingleColorEffectParams): Effect => {
    const effect: Effect = {
        id: "single-color",
        description: "Turns all lights to a single color",
        transitions: [
            {
                lights,
                layer,
                waitForCondition: waitFor,
                waitForTime: forTime,
                transform: {
                    color,
                    easing,
                    duration,
                },
                waitUntilCondition: waitUntil,
                waitUntilTime: untilTime,
            },
        ],
    };

    return effect;
};