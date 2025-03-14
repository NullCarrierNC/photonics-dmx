import { Effect } from "../types";
import { EffectInterface } from "./ieffect";
import { EasingType } from "../easing";

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
}: EffectInterface): Effect => {
    const effect: Effect = {
        id: "single-color",
        description: "Turns all lights to a single color",
        transitions: [
            {
                lights,
                layer,
                waitFor,
                forTime,
                transform: {
                    color,
                    easing,
                    duration,
                },
                waitUntil,
                untilTime,
            },
        ],
    };

    return effect;
};