import { Effect, RGBIO } from "../types";
import { EasingType } from "../easing";
import { IEffect } from "./interfaces/IEffect";

/**
 * Interface for blackout effect parameters, extending the base effect interface
 */
interface BlackoutEffectParams extends IEffect {
    /** Duration of the blackout transition */
    duration: number;
}

export const getEffectBlackout = ({
    duration,
    lights,
    layer = 0,
    easing = EasingType.SIN_OUT,
}: BlackoutEffectParams): Effect => {
    const black: RGBIO = {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace',
    };

    const blackoutEffect: Effect = {
        id: "blackout",
        description: "Turns off all lights",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: "none",
                forTime: 0,
                transform: {
                    color: black,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: "none",
                untilTime: 0,
            },
        ],
    };

    return blackoutEffect;
};