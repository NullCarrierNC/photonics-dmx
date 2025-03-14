import { CueData, CueType } from '../cues/cueTypes';
import { cueMenuCircleChase } from '../cues/menuCues';
import { cueSearchlightsChase } from '../cues/searchlightsCues';

import { getEffectCrossFadeColors } from '../effects/effectCrossFadeColors';
import { getEffectFadeInColorFadeOut } from '../effects/effectFadeInColorFadeOut';
import { getEffectFlashColor } from '../effects/effectFlashColor';
import { getEffectSingleColor } from '../effects/effectSingleColor';
import { getColor } from '../helpers/dmxHelpers';
import { randomBetween } from '../helpers/utils';

import { Effect, RGBIP, TrackedLight } from '../types';
import { DmxLightManager } from '../controllers/DmxLightManager';

import { ILightingController } from '../controllers/sequencer/interfaces';

import { AbstractCueHandler } from './AbstractCueHandler';
import { getSweepEffect } from '../effects/sweepEffect';
import { EasingType } from '../easing';

/**
 * Complex style cues intended for YARG.
 * Provides the visual effects you see in game.
 * Some effects rely on game data only available 
 * from YARG. These won't work well with RB3.
 * 
 * Reminder: setEffect clears all running effects, regardless of layer.
 * Layer 0 will maintain its state though.
 * addEffect will not clear other effects unless it's on the same layer.
 * 
 * TODO: Move the actual effects into distinct files and create a wrapper 
 * around them so we can choose between different "sets" of effects.
 */
class YargCueHandler extends AbstractCueHandler {
  private _lastIndex: Number = 0;
  

  /**
   * Creates a new YargCueHandler.
   * 
   * @param lightManager The DmxLightManager to use
   * @param photonicsSequencer The PhotonicsSequencer instance that manages all light effects
   * @param debouncePeriod Minimum time between repeated cues in milliseconds
   */
  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super(lightManager, photonicsSequencer, debouncePeriod);
    
    // If enabled the console will log a table of the active effect layers
    // and light states.
    //this.setDebugMode(true, 1000);

    console.log('YargCueHandler running');
  }



  /**
   * Set all front to low yellow.
   * @param _parameters 
   */
  protected async handleCueDefault(_parameters: CueData): Promise<void> {
    const color = getColor('yellow', 'low');
    const lights = this.getLights(['front'], 'all');
    const effect: Effect = getEffectSingleColor({
      color,
      duration: 100,
      lights,
    });
    // Intentionally using setEffect to clear anything else
    this._sequencer.setEffect('default', effect);
  }



  /**
   * Alternate blue / green on first/second half.
   * On measure flash red or yellow.
   * @param _parameters 
   */
  protected handleCueDischord = async (_parameters: CueData): Promise<void> => {
    // const cueName
    // console.log(cueName);

    // this.clearPreviousCue(cueName);
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');

    const all = this.getLights(['front'], 'all');
    const even = this.getLights(['front'], 'half-1');
    const odd = this.getLights(['front'], 'half-2');

    const bps = _parameters.beatsPerMinute / 60;
    const duration = (1000 / bps);

    const baseLayer:Effect = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 10,
    })

    const crossFadeEven: Effect = getEffectCrossFadeColors({
      startColor: blue,
      afterStartWait: 70,
      endColor: green,
      afterEndColorWait: 75,
      duration: duration,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd: Effect = getEffectCrossFadeColors({
      startColor: green,
      afterStartWait: 70,
      endColor: blue,
      afterEndColorWait: 75,
      duration: duration,
      lights: odd,
      layer: 2,
    });
    const allLights = this.getLights(['front'], 'all');
    const yellow: RGBIP = getColor('yellow', 'high');
    const red: RGBIP = getColor('red', 'high');
    const rnd = randomBetween(1, 2);
    const flashYellowOnBeat = getEffectFlashColor({
      color: rnd === 1 ? red : yellow,
      startTrigger: 'measure',
      durationIn: 0,
      holdTime: 120,
      durationOut: 150,
      lights: allLights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });

    this._sequencer.setEffect('dischord-all', baseLayer);
    this._sequencer.addEffect('dischord1', crossFadeEven);
    this._sequencer.addEffect('dischord2', crossFadeOdd);
    this._sequencer.addEffect('dischord-flash', flashYellowOnBeat);
  };




  /**
   * Cycle each light individually through a randomly selected colour
   * @param _parameters 
   */
  protected async handleCueChorus(_parameters: CueData): Promise<void> {
    // const cueName = 'chorus';
    // console.log(cueName);

    const amberLow = getColor('amber', 'low');
    const amberMedium = getColor('amber', 'medium');
    const amberHigh = getColor('amber', 'high');

    const purpleLow = getColor('purple', 'low');
    const purpleMedium = getColor('purple', 'medium');
    const purpleHigh = getColor('purple', 'high');

    const set1 = [amberLow, amberMedium, amberHigh, purpleLow, purpleMedium, purpleHigh];

    const yellowLow = getColor('yellow', 'low');
    const yellowMed = getColor('yellow', 'medium');
    const yellowHigh = getColor('yellow', 'high');

    const redLow = getColor('red', 'low');
    const redMed = getColor('red', 'medium');
    const redHigh = getColor('red', 'high');

    const set2 = [yellowLow, yellowMed, yellowHigh, redLow, redMed, redHigh];

    const lights: TrackedLight[] = this.getLights(['front', 'back'], 'all');
    const num = lights.length;

    const flip = randomBetween(0, 1);

    const bps = _parameters.beatsPerMinute / 60;
    const duration = (1000 / bps) + (200 - _parameters.beatsPerMinute);

    for (var i = 0; i < num; i++) {
      const colour = flip === 1 ? set1[randomBetween(0, set1.length - 1)] : set2[randomBetween(0, set2.length - 1)];

      const effect: Effect = getEffectSingleColor({
        color: colour,
        duration: duration,
        lights: [lights[i]],
        layer: i
      });
      this._sequencer.addEffect(`chorus-${i}`, effect);
    }
  }



  /**
   * Cross fade even/odd between green and blue on front only.
   * @param _parameters 
   */
  protected async handleCueCool_Manual(_parameters: CueData): Promise<void> {
    const even = this.getLights(['front'], 'even');
    const odd = this.getLights(['front'], 'odd');
    const all = this.getLights(['front'], 'all');
    const blue: RGBIP = getColor('blue', 'medium');
    const green: RGBIP = getColor('green', 'medium');

    const baseLayer:Effect = getEffectSingleColor({
      lights: all,
      color: green,
      duration: 100,
    })

    const crossFadeEven: Effect = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: green,
      afterEndColorWait: 0,
      duration: 140,
      lights: odd,
      layer: 1,
    });
    const crossFadeOdd: Effect = getEffectCrossFadeColors({
      startColor: green,
      crossFadeTrigger: 'beat',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 140,
      lights: even,
      layer: 2,
    });

    this._sequencer.setEffect('coolManual-base', baseLayer);
    this._sequencer.addEffect('coolManual-e', crossFadeEven);
    this._sequencer.addEffect('coolManual-o', crossFadeOdd);
  }



  /**
   * Bright flash of white that quickly fades out. 
   * Singificantly slower than a strobe.
   * @param _parameters 
   */
  protected async handleCueStomp(_parameters: CueData): Promise<void> {
    // const cueName = 'stomp';
    // console.log(cueName);

    const white: RGBIP = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      durationIn: 10,
      holdTime: 0,
      durationOut: 110,
      lights: lights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });
    this._sequencer.addEffect('stomp', flash);
  }



  /**
   * Randomly cycle each light through different colours 
   * of blue and yellow based on BPM.
   * @param _parameters 
   */
  protected async handleCueVerse(_parameters: CueData): Promise<void> {

    const blueLow = getColor('blue', 'low');
    const blueMed = getColor('blue', 'medium');
    const blueHigh = getColor('blue', 'high');

    const yellowLow = getColor('yellow', 'low');
    const yellowMed = getColor('yellow', 'medium');
    const yellowHigh = getColor('yellow', 'high');


    const set1 = [blueLow, blueMed, blueHigh,];
    const set2 = [yellowLow, yellowMed, yellowHigh,];

    const lights: TrackedLight[] = this.getLights(['front', 'back'], 'all');
    const num = lights.length;

    const flip = randomBetween(0, 1);

    const bps = _parameters.beatsPerMinute / 60;
    const duration = (1000 / bps) + (100 - _parameters.beatsPerMinute);


    for (var i = 0; i < num; i++) {
      const colour = flip === 1 ? set1[randomBetween(0, set1.length - 1)] : set2[randomBetween(0, set2.length - 1)];

      const effect: Effect = getEffectSingleColor({
        color: colour,
        duration: duration,
        lights: [lights[i]],
        layer: i
      });
      this._sequencer.addEffect(`verse-${i}`, effect);
    }


  }


  /**
   * Cross fade red and yellow across even odd
   * @param _parameters 
   */
  protected async handleCueWarm_Manual(_parameters: CueData): Promise<void> {
    // const cueName = 'warm_manual';
    // console.log(cueName);

    const even = this.getLights(['front'], 'even');
    const odd = this.getLights(['front'], 'odd');

    const all = this.getLights(['front'], 'all');

    const red: RGBIP = getColor('red', 'medium');
    const yellow: RGBIP = getColor('yellow', 'medium');

    const bps = _parameters.beatsPerMinute / 60;
    const duration = (1000 / bps);

    const baseLayer:Effect = getEffectSingleColor({
      lights: all,
      color: red,
      duration: 100,
    })

    const crossFadeEven: Effect = getEffectCrossFadeColors({
      startColor: red,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: yellow,
      afterEndColorWait: 0,
      duration: duration,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd: Effect = getEffectCrossFadeColors({
      startColor: yellow,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: duration,
      lights: odd,
      layer: 2,
    });
    this._sequencer.setEffect('warm_manual-base', baseLayer);
    this._sequencer.addEffect('warm_manual-e', crossFadeEven);
    this._sequencer.addEffect('warm_manual-o', crossFadeOdd);
  }



  /**
   * Strobe like flashing of random colours across lights with a random delay.
   * Creates a flash-bulb like effect, similar to Frenzy, but with colours.
   * @param _parameters 
   */
  protected async handleCueBigRockEnding(_parameters: CueData): Promise<void> {
    // const cueName = 'big rock ending';
    // console.log(cueName);

    const red: RGBIP = getColor('red', 'max');
    const green: RGBIP = getColor('green', 'max');
    const blue: RGBIP = getColor('blue', 'max');
    const orange: RGBIP = getColor('orange', 'max');
    const lights = this.getLights(['front', 'back'], 'all');
    const numLights = lights.length;
    try {
      const colors = [red, green, blue, orange];
      for (let i = 0; i < numLights; i++) {
        const color = colors[randomBetween(0, colors.length - 1)];
        const flash = getEffectFlashColor({
          color,
          startTrigger: 'delay',
          startWait: randomBetween(0, 100),
          durationIn: 10,
          holdTime: randomBetween(20, 80),
          durationOut: 60,
          lights: [lights[i]],
          layer: i + 10,
        });
        
        this._sequencer.addEffect(`big-rock-ending${i}`, flash);
      }
    } catch (ex) {
      console.error(ex);
      throw ex;
    }
  }

  protected async handleCueBlackout_Fast(_parameters: CueData): Promise<void> {
  //  console.warn("Blackout_Fast");
    this._sequencer.blackout(0);
  }

  protected async handleCueBlackout_Slow(_parameters: CueData): Promise<void> {
    console.warn("Blackout_Slow");
    this._sequencer.blackout(1000);
  }

  protected async handleCueBlackout_Spotlight(_parameters: CueData): Promise<void> {
    console.warn("\n ** Missing: Blackout_Spotlight ");
    this.handleCueBlackout_Fast(_parameters);
  }


  /**
   * Alternates green blue across front/back on measure.
   * @param _parameters 
   */
  protected async handleCueCool_Automatic(_parameters: CueData): Promise<void> {
    // const cueName = 'cool_auto';
    // console.log(cueName);

    const even = this.getLights(['front'], 'all');
    const odd = this.getLights(['back'], 'all');
    const all = this.getLights(['front', 'back'], 'all');

    const blue: RGBIP = getColor('blue', 'medium');
    const green: RGBIP = getColor('green', 'medium');

    const baseLayer:Effect = getEffectSingleColor({
      lights: all,
      color: blue,
      duration: 100,
    })

    const crossFadeEven: Effect = getEffectCrossFadeColors({
      startColor: blue,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: green,
      afterEndColorWait: 0,
      duration: 200,
      lights: odd,
      layer: 1,
    });
    const crossFadeOdd: Effect = getEffectCrossFadeColors({
      startColor: green,
      crossFadeTrigger: 'measure',
      afterStartWait: 0,
      endColor: blue,
      afterEndColorWait: 0,
      duration: 200,
      lights: even,
      layer: 2,
    });

    this._sequencer.setEffect('cool-auto-base', baseLayer);
    this._sequencer.addEffect('cool-auto-e', crossFadeEven);
    this._sequencer.addEffect('cool-auto-o', crossFadeOdd);
  }




  /**
   * Random flashes of white across all front lights. 
   * Looks similar to flash bulbs in a crowd.
   * @param _parameters 
   */
  protected async handleCueFlare_Fast(_parameters: CueData): Promise<void> {
    // const cueName = 'flare_fast';
    // console.log(cueName);

    const white: RGBIP = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(5, 160),
        durationIn: 10,
        holdTime: randomBetween(10, 40),
        durationOut: 50,
        lights: [lights[i]],
        layer: i + 101,
      });
      this._sequencer.addEffect(`flare-fast${i}`, flash);
    }
  }



  /**
   *  Random flashes of white across all front lights, slower version. 
   *  Looks similar to flash bulbs in a crowd.
   * @param _parameters 
   */
  protected async handleCueFlare_Slow(_parameters: CueData): Promise<void> {
    // const cueName = 'flare_slow';
    // console.log(cueName);

    const white: RGBIP = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(20, 200),
        durationIn: 100,
        holdTime: randomBetween(20, 80),
        durationOut: 200,
        lights: [lights[i]],
        layer: i + 101,
      });
      this._sequencer.addEffect(`flare-slow${i}`, flash);
    }
  }



  /**
   * Cycles through r/g/b/o on all lights quickly.
   * @param _parameters 
   */
  protected async handleCueFrenzy(_parameters: CueData): Promise<void> {
    // const cueName = 'frenzy';
    // console.log(cueName);

    const red: RGBIP = getColor('red', 'high');
    const green: RGBIP = getColor('green', 'high');
    const blue: RGBIP = getColor('blue', 'high');
    const orange: RGBIP = getColor('orange', 'high');
    const lights = this.getLights(['front', 'back'], 'all');
    const colors = [red, green, blue, orange];


    // Ensure startColor is not the same as _lastIndex
    let startColorIndex: number;
    do {
      startColorIndex = randomBetween(0, colors.length - 1);
    } while (startColorIndex === this._lastIndex);


    const startColor = colors[startColorIndex];

    // Ensure endColor is different from startColor
    let endColorIndex: number;
    do {
      endColorIndex = randomBetween(0, colors.length - 1);
    } while (endColorIndex === startColorIndex);

    const endColor = colors[endColorIndex];

    const cross = getEffectCrossFadeColors({
      startColor: startColor,
      afterStartWait: 0,
      endColor: endColor,
      duration: 100,
      afterEndColorWait: 0,
      lights: lights,
      layer: 10,
    });
    // using layer 10 to force it on top of other common effects to take precedence
    this._sequencer.addEffect(`frenzy`, cross);

    this._lastIndex = endColorIndex;

  }


  /**
   * Slow fade in and hold of green
   * @param _parameters 
   */
  protected async handleCueIntro(_parameters: CueData): Promise<void> {
    // const cueName = 'intro';
    // console.log(cueName);

    const lights = this.getLights(['front'], 'all');
    const green: RGBIP = getColor('green', 'low');
    const effect = getEffectSingleColor({
      color: green,
      duration: 1200,
      lights: lights,
    });
    this._sequencer.setEffect('intro', effect);
  }



  /**
   * Cross fade colours determined by the instrument. 
   * Start with drum hit, end with guitar note.
   * @param _parameters 
   */
  protected async handleCueHarmony(_parameters: CueData): Promise<void> {
    // const cueName = 'harmony';
    // console.log(cueName);

    const red: RGBIP = getColor('red', 'high');
    const green: RGBIP = getColor('green', 'high');
    const blue: RGBIP = getColor('blue', 'high');
    const yellow: RGBIP = getColor('yellow', 'high');
    const orange: RGBIP = getColor('orange', 'high');
    const white: RGBIP = getColor('purple', 'high');

    const colors = [red, green, blue, yellow, orange, white];

    //const transparent: RGBIP = getColor('transparent', 'high');
    const lights = this.getLights(['front'], 'all');

    //console.log("Harmony", lights);

    let startColor = red;
    let endColor = blue;

    if (_parameters.drumNotes.length > 0) {
      switch (_parameters.drumNotes[0]) {
        case "None":
          startColor = colors[randomBetween(0, colors.length - 1)];
          break;
        case "Kick":
          startColor = white;
          break;
        case "RedDrum":
          startColor = red;
          break;
        case "YellowDrum":
          startColor = yellow;
          break;
        case "BlueDrum":
          startColor = blue;
          break;
        case "GreenDrum":
          startColor = green;
          break;
        case "YellowCymbal":
          startColor = yellow;
          break;
        case "BlueCymbal":
          startColor = blue;
          break;
        case "GreenCymbal":
          startColor = green;
          break;
      }
    } else {
      startColor = colors[randomBetween(0, colors.length - 1)];
    }

    if (_parameters.guitarNotes.length > 0) {
      switch (_parameters.guitarNotes[0]) {
        case "None":
          endColor = colors[randomBetween(0, colors.length - 1)];
          break;
        case "Open":
          break;
        case "Green":
          endColor = green;
          break;
        case "Red":
          endColor = red;
          break;
        case "Yellow":
          endColor = yellow;
          break;
        case "Blue":
          endColor = blue;
          break;
        case "Orange":
          endColor = orange;
          break;
      }
    } else {
      endColor = colors[randomBetween(0, colors.length - 1)];
    }

    const bps = _parameters.beatsPerMinute / 60;
    const duration = (1000 / bps) / 4;
    //console.log(duration);

    const cross = getEffectCrossFadeColors({
      startColor: startColor,
      afterStartWait: 0,
      //waitFor: 'measure',
      crossFadeTrigger: 'measure',
      endColor: endColor,
      duration: duration,
      afterEndColorWait: 0,
      lights: lights,
      layer: 0,
      easing: EasingType.SIN_OUT,
    });

    this._sequencer.addEffect('harmony', cross);

  }


  /**
   * SLow colour cycle through blues/purples
   * @param _parameters 
   */
  protected async handleCueSilhouettes(_parameters: CueData): Promise<void> {
    // const cueName = 'silhouettes';
    // console.log(cueName);

    const back = this.getLights(['back'], 'all');
    const front = this.getLights(['front'], 'all');
    const green: RGBIP = getColor('green', 'medium');
    const blue: RGBIP = getColor('blue', 'medium');
    const magenta = getColor('magenta', 'medium');
    const teal = getColor('teal', 'medium');

    const colours = [green, blue, magenta, teal];


    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: colours[randomBetween(0, colours.length - 1)],
      duration: 500,
      waitUntil: 'none',
      untilTime: 0,
      lights: back.length > 0 ? back : front,
      layer: 0,
    });
    this._sequencer.setEffect('silhouettes', singleColor);
  }



  /**
   * Hold on blue
   * @param _parameters 
   */
  protected async handleCueSilhouettes_Spotlight(_parameters: CueData): Promise<void> {
    // const cueName = 'silhouettes_spot';
    // console.log(cueName);

    //const front = this.getLights(['front'], 'all');
    //const back = this.getLights(['back'], 'all');
    //const lights: TrackedLight[] = back.length > 0 ? back : front;
    const low: RGBIP = getColor('blue', 'low');

    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: low,
      duration: 100,
      waitUntil: 'none',
      untilTime: 0,
      lights: this.getLights(['front', 'back'], 'all'),
      layer: 0,
    });

    this._sequencer.setEffect('silhouettes_spot', singleColor);

    /* Disabling the blue measure flash
        const blue: RGBIP = getColor('blue', 'max');
        const flash = getEffectFlashColor({
          color: blue,
          startTrigger: 'measure',
          startWait: 0,
          durationIn: 10,
          holdTime: 100,
          durationOut: 150,
          lights: lights,
          layer: 5,
        });
        this._effects.addEffect('silhouettes_spot-flash', flash);
        */
  }


  /**
   * Chase from ltr or rtl using randomly selected colour.
   * @param _parameters 
   */
  protected async handleCueSearchlights(_parameters: CueData): Promise<void> {
    // const cueName = 'searchlights';
    // console.log(cueName);

    cueSearchlightsChase(this._sequencer, this._lightManager);
  }



  /**
   * Fastest strobe (BPM/64)
   * @param _parameters 
   */
  protected async handleCueStrobe_Fastest(_parameters: CueData): Promise<void> {
    // this._isStrobeOn = true;

    const white: RGBIP = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: _parameters.beatsPerMinute / 64,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash);

  }


  /**
   * Fast strobe (BPM/32)
   * @param _parameters 
   */
  protected async handleCueStrobe_Fast(_parameters: CueData): Promise<void> {

    //  this._isStrobeOn = true;

    const white: RGBIP = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: _parameters.beatsPerMinute / 32,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash);

  }



  /**
   * Medium strobe (BPM/16)
   * @param _parameters 
   */
  protected async handleCueStrobe_Medium(_parameters: CueData): Promise<void> {

    //  this._isStrobeOn = true;

    const white: RGBIP = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: _parameters.beatsPerMinute / 16,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash);


  }



  /**
   * Slowest strobe (BMP/8)
   * @param _parameters 
   */
  protected async handleCueStrobe_Slow(_parameters: CueData): Promise<void> {
    //   this._isStrobeOn = true;

    const white: RGBIP = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      startWait: 0,
      durationIn: 0,
      holdTime: 5,
      durationOut: 0,
      endTrigger: 'delay',
      endWait: _parameters.beatsPerMinute / 8,
      lights: strobes,
      layer: 255,
    });

    this._sequencer.addEffectUnblockedName('strobe', flash);

  }


  /**
   * Does nothing: YARG strobes turn off by virtue of not being tured on by a cue call.
   * @param _parameters 
   */
  protected async handleCueStrobe_Off(_parameters: CueData): Promise<void> {

  }


  /**
   * Fast chase with cross-fade across the lights. Random colour 
   * based on venue size. Blue/Green small, Red/Yellow large.
   * Layers on top of existing cues.
   * @param _parameters 
   */
  protected async handleCueSweep(_parameters: CueData): Promise<void> {
    // const cueName = 'sweep';
    // console.log(cueName);

    const transparent: RGBIP = getColor('transparent', 'high');
    const red: RGBIP = getColor('red', 'max');
    const yellow: RGBIP = getColor('yellow', 'max');
    const g: RGBIP = getColor('green', 'max');
    const b: RGBIP = getColor('blue', 'max');


    const lights = this.getLights(['front'], 'all');

    const dir = randomBetween(0, 1);
    if (dir === 1) {
      lights.reverse();
    }

    let color = yellow;
    const rndClr = randomBetween(0, 1);

    if (_parameters.venueSize === 'Small') {
      if (rndClr === 0) {
        color = b;
      } else {
        color = g;
      }
    } else {

      if (rndClr === 0) {
        color = red;
      } else {
        color = yellow;
      }
    }

    const sweep = getSweepEffect({
      lights: lights,
      high: color,
      low: transparent,
      sweepTime: 900,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      layer: 101,
      //  waitFor: "beat",
    })

    this._sequencer.addEffectUnblockedName('sweep', sweep,);

  }




  /**
   * Cross fades front/back between yellow and red on measure.
   * @param _parameters 
   */
  protected async handleCueWarm_Automatic(_parameters: CueData): Promise<void> {
    // const cueName = 'warm_auto';
    // console.log(cueName);


    const even = this.getLights(['front'], 'all');
    const odd = this.getLights(['back'], 'all');
    const all = this.getLights(['front', 'back'], 'all');

    const red: RGBIP = getColor('red', 'medium');
    const yellow: RGBIP = getColor('yellow', 'medium');

    const baseLayer:Effect = getEffectSingleColor({
      lights: all,
      color: red,
      duration: 100,
    })

    const crossFadeEven: Effect = getEffectCrossFadeColors({
      startColor: red,
      crossFadeTrigger: 'measure',

      afterStartWait: 0,
      endColor: yellow,
      afterEndColorWait: 0,
      duration: 400,
      lights: even,
      layer: 1,
    });
    const crossFadeOdd: Effect = getEffectCrossFadeColors({
      startColor: yellow,
      crossFadeTrigger: 'measure',

      afterStartWait: 0,
      endColor: red,
      afterEndColorWait: 0,
      duration: 400,
      lights: odd,
      layer: 2,
    });
    this._sequencer.setEffect('warm_automatic-base', baseLayer);
    this._sequencer.addEffect('warm_automatic-e', crossFadeEven);
    this._sequencer.addEffect('warm_automatic-o', crossFadeOdd);
  }





  protected async handleCueKeyframe_First(_parameters: CueData): Promise<void> {
    console.warn("Keyframe_First");
    this.handleKeyframe();
  }



  protected async handleCueKeyframe_Next(_parameters: CueData): Promise<void> {
    console.warn("Keyframe_Next");
    this.handleKeyframe();
  }



  protected async handleCueKeyframe_Previous(_parameters: CueData): Promise<void> {
    console.warn("********* Keyframe_Previous **************");
    this.handleKeyframe();
  }


  /**
   * Menu cues
   * @param _parameters 
   */
  protected async handleCueMenu(_parameters: CueData): Promise<void> {
    cueMenuCircleChase(this._sequencer, this._lightManager);
  }


  /**
   * Blue with randomly timed yellow fade in.
   * @param _parameters 
   */
  protected async handleCueScore(_parameters: CueData): Promise<void> {
    // const cueName = 'score';
    // console.log(cueName);

    const frontLights = this.getLights(['front'], 'all');
    const blue: RGBIP = getColor('blue', 'low');
    const yellow: RGBIP = getColor('yellow', 'low');
    const fade = getEffectFadeInColorFadeOut({
      startColor: blue,
      waitBeforeFadeIn: randomBetween(100, 1200),
      endColor: yellow,
      fadeInDuration: randomBetween(300, 600),
      holdDuration: randomBetween(200, 800),
      fadeOutDuration: randomBetween(200, 800),
      waitAfterFadeOut: randomBetween(600, 1600),
      lights: frontLights,
      layer: 0,
    });
    this._sequencer.setEffect('score-yellow', fade, 0, true);
  }


  /**
   * Blackout the lights.
   * @param _parameters 
   */
  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    this._sequencer.blackout(0);
  }



}

export { YargCueHandler, CueType };