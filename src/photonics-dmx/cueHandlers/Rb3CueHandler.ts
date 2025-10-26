/**
 * CueHandler for RB3.
 * 
 * This is the cue handler that is used to handle RB3.
 * It's simpler than the YARG one in that it doesn't rely 
 * on as much in game data as YARG.
 * 
 * NOTE: Most of the cues are disabled in favor of using the StageKit LED 
 * values to set the light colours. Eventually this will be expanded to 
 * use cue handling in favour of the LED values.
 * 
 * The challenge with RB3 is that it calls cues *very* rapidly at times.
 * This makes it difficult to smooothly transition between cues.
 * 
 * TODO: Include more state tracking in relation to the effects so we can 
 * decide how to handle the very rapid changes in which cue RB3E is calling.
 * E.g. Rapid calls back and forth between the same two cues could be mapped to
 * a distinct effect v.s. literally toggling between the two cue's effects.
 * 
 */
import { CueData, CueType, StrobeState,  } from '../cues/cueTypes';
import { cueMenuCircleChase } from '../cues/menuCues';
import { cueSearchlightsChase } from '../cues/searchlightsCues';

import { getEffectFadeInColorFadeOut } from '../effects/effectFadeInColorFadeOut';
import { getEffectFlashColor } from '../effects/effectFlashColor';
import { getEffectSingleColor } from '../effects/effectSingleColor';
import { getColor } from '../helpers/dmxHelpers';
import { randomBetween } from '../helpers/utils';

import { Brightness, Color, Effect,  RGBIO, TrackedLight } from '../types';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';


import { AbstractCueHandler } from './AbstractCueHandler';
import { getSweepEffect } from '../effects/sweepEffect';
import { Rb3GameState } from '../listeners/RB3/rb3eTypes';
import { getEffectCrossFadeColors } from '../effects/effectCrossFadeColors';
import { CueGroup } from '../types';



/**
 * Provides the visual effects for RB3. (Simple Cues)
 * These do not rely on as much in game data as 
 * it isn't available w/RB the same was as YARG.
 * YARG can use these, they just won't take advantage
 * of all the data.
 */
class Rb3CueHandler extends AbstractCueHandler {
  private _lastIndex:Number = 0;
  private _currentStrobeState: StrobeState = "Strobe_Off";
  private _currentLedColor: string = '';
  private _currentGameState: Rb3GameState = 'Menus';
  private _targetLights: TrackedLight[] = this.getLights(['front', 'back'], 'all');

  // If true, the LED Color is set directly from the network values.
  // If false, the cues are used.
  // Overlay effects like strobe, stomp, etc. are still applied regardless.
  private _isDirectLedControl: boolean = true;


  /**
   * Creates a new Rb3CueHandler.
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

   // this.setDebugMode(true, 1000);

   console.log('Rb3CueHandler running');
  }
  

  /**
   * Called when the game state changes between Menus and InGame.
   * @param gameState Menus or InGame
   */
  public handleGameState(gameState: Rb3GameState): void {
    // TODO: See if we can figure out why we don't always hear this notification
    console.log('\n ********** handleGameState', gameState);
    this._currentGameState = gameState;
  }


  /**
   * Use RB3 data to decide which lights to set the colour for.
   * @param target The target lights to set.
   */
  public handleTarget(target: string): void {
 
    let lights = this.getLights(['front','back'], 'all');
    switch (target) {
      case 'one':
        lights = this.getLights(['front'], 'half-1');
        break;
      case 'two':
        lights = this.getLights(['front'], 'even');
        break;
      case 'three':
        lights = this.getLights(['front'], 'odd');
        break;
      case 'four':
        lights = this.getLights(['front'], 'half-2');
        break;
    }
    console.log(`Target lights set to: ${target}`);
    this._targetLights = lights;
  }



  /**
   * Handles strobe light effects
   * @param cueData The cue data containing strobe state information
   */
  public handleStrobe(cueData: CueData): void {
    const strobeState = cueData.strobeState || "Strobe_Off";
    if (this._currentStrobeState === strobeState) return;
    
    this._currentStrobeState = strobeState;
    console.warn(`Strobe set to: ${strobeState}`);

    switch (strobeState) {
      case "Strobe_Off":
        this.handleCueStrobe_Off(cueData);
        break;
      case "Strobe_Slow":
        this.handleCueStrobe_Slow(cueData);
        break;
      case "Strobe_Medium":
        this.handleCueStrobe_Medium(cueData);
        break;
      case "Strobe_Fast":
        this.handleCueStrobe_Fast(cueData);
        break;
      case "Strobe_Fastest":
        this.handleCueStrobe_Fastest(cueData);
        break;
    }
  }

  /**
   * Handles LED colour changes from the StageKit
   * @param Color The colour to set (red, green, blue, yellow) with the brightness: "color:Brightness"
   */
  public handleLedColor(ledColorBrightness: string): void {
    if(!this._isDirectLedControl){
      return;
    }
    // We should only get this in-game. 
    // There is an in0game notification, but it doesn't seem to always fire.
    // TODO: Investigate in-game notification issue.
    this._currentGameState = 'InGame';

    const [colorName, brightness] = ledColorBrightness.split(":");
    
    // If current Color is the same and there's no Brightness change, don't update
    if (this._currentLedColor === colorName && !brightness) return;
    
    this._currentLedColor = colorName;
    console.log(`LED colour set to: ${ledColorBrightness}`);
    
    // Default to 'medium' Brightness if not specified
    const actualBrightness = brightness as Brightness;
    const actualColor = colorName as Color;

    let color:RGBIO;
    color = getColor(actualColor, actualBrightness); 
   
    this._sequencer.setState(this._targetLights,color, 100);
  }

  /**
   * Handles disabling all effects
   */
  public handleDisableAll(): void {
    console.log("Disabling all effects");
    this._currentStrobeState = "Strobe_Off";
    this._currentLedColor = '';
    this._sequencer.blackout(0);
  }



  /**
   * Randomly set yellow or red and varying Brightness.
   * Longer duration transition time prevents it being too chaotic.
   * Random delay before changing again.
   * Note: quite different from YARG version of the cue as it's
   * more reflective of the RB3 menu animations which use default.
   * YARG uses the Menu cue in those cases.
   * @param _parameters 
   */
  protected async handleCueDefault(_parameters: CueData): Promise<void> {
   // console.log('handleCueDefault', this._currentGameState);
    if (this._currentGameState === 'InGame') {
      // In game is using the LED Color set by the StageKit packet.
      return;
    }

    const yellowLow = getColor('yellow', 'low');
    const yellowMed = getColor('yellow', 'medium');
    const yellowHigh = getColor('yellow', 'high');

    const redLow = getColor('red', 'low');
    const redMed = getColor('red', 'medium');
    const redHigh = getColor('red', 'high');

    const colors = [yellowHigh, yellowMed, yellowLow, redHigh, redMed, redLow];
    const numColors = colors.length;

    const lights:TrackedLight[] = this.getLights(['front','back'], 'all');
    const num = lights.length;

    const baseLayer:Effect = getEffectSingleColor({
      lights: lights,
      color: redLow,
      duration: 10,
    })
    
    this._sequencer.addEffect('default-base', baseLayer);

    // RB3 doesn't call this as frequently as YARG.
    // So we're making the effect last longer to cover the gap. 
    // Without that the light will blink off as the effect ends and the other isn't called. 
    for(var i=0;i<num;i++){
      const rndIdx = randomBetween(0, numColors-1)
      const effect: Effect = getEffectSingleColor({
        color: colors[rndIdx],
        duration: 800,
        waitUntil: 'delay',
        untilTime: randomBetween(1000, 3000),
        lights: [lights[i]],
        layer: 1+i
      });

     
      this._sequencer.addEffect(`default-${i}`, effect);
    }

  }



  /**
   * Alternate blue / green on first/second half. Front only.
   * Slower than YARG version, no flash for beat/measure.
   * @param _parameters 
   */
  protected async handleCueDischord(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    const blue = getColor('blue', 'medium');
    const green = getColor('green', 'medium');
    const red = getColor('red', 'medium');
    const yellow = getColor('yellow', 'medium');

    const colors = [blue, green, red, yellow];


    const even = this.getLights(['front'], 'half-1');
    const odd = this.getLights(['front'], 'half-2');
   
    
    const oddEffect:Effect = getEffectSingleColor({
      lights: odd,
      color: colors[randomBetween(0, colors.length-1)],
      duration: 10,
    });
    const evenEffect:Effect = getEffectSingleColor({
      lights: even,
      color: colors[randomBetween(0, colors.length-1)],
      duration: 10,
      layer: 1,
    });

    this._sequencer.setEffect('dischord-odd', oddEffect);
    this._sequencer.addEffect('dischord-even', evenEffect);
    
  }


  /**
   * Automatically cycles through blue yellow randomly across lights
   * @param _parameters 
   */
  protected async handleCueVerse(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

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

    const duration = 100;


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
   * Randomly cross fade between blue and green
   * @param _parameters 
   */
  protected async handleCueCool_Automatic(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    
    const blueLow = getColor('blue', 'low');
    const blueMed = getColor('blue', 'medium');
  //  const blueHigh = getColor('blue', 'high');

    const greenLow = getColor('green', 'low');
    const greenMed = getColor('green', 'medium');
  //  const greenHigh = getColor('green', 'high');

    const colors = [blueLow, blueMed,  greenLow, greenMed, ];
    const numColors = colors.length;

    const lights:TrackedLight[] = this.getLights(['front','back'], 'all');
    const num = lights.length;
    
    for(var i=0;i<num;i++){
      const rndIdx = randomBetween(0, numColors-1)
      const effect: Effect = getEffectSingleColor({
        color: colors[rndIdx],
        duration: 10,
        lights: [lights[i]],
        layer: i
      });
      
      this._sequencer.addEffect(`cool-auto-${i}`, effect);
  
    }
  }
  


  /**
   * Cross fade blue/green on even/odd. Front only.
   * No beat notification on RB3. 
   * @param _parameters 
   */
  protected async handleCueCool_Manual(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

  //  console.error("Cool Manual needs Beat, is it working correctly?");
    const even = this.getLights(['front'], 'even');
    const odd = this.getLights(['front'], 'odd');
    //const all = this.getLights(['front'], 'all');
    const blue: RGBIO = getColor('blue', 'medium');
    const green: RGBIO = getColor('green', 'medium');
    

    const oddEffect:Effect = getEffectSingleColor({
      lights: odd,
      color: green,
      duration: 10,
      layer: 0,
    });

    const evenEffect:Effect = getEffectSingleColor({
      lights: even,
      color: blue,
      duration: 10,
      layer: 1,
    });

    this._sequencer.setEffect('cool_manual-odd', oddEffect);
    this._sequencer.addEffect('cool_manual-even', evenEffect);

  }


  /**
   * Flash all front lights white briefly.
   * @param _parameters 
   */
  protected async handleCueStomp(_parameters: CueData): Promise<void> {
    console.warn("Stomp");
    const white: RGBIO = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      durationIn: 10,
      holdTime: 100,
      durationOut: 200,
      lights: lights,
      easing:"sinosoidal.out",
      layer: 101,
    });
    this._sequencer.addEffect('stomp', flash);
  }


  /**
   * Randomly cross fade lights across amber/yellow/purple/red
   * @param _parameters 
   */
  protected async handleCueChorus(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

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

    const duration = 100;


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
   * Randomly set all light red or white. Slightly faster at 400ms.
   * @param _parameters 
   */
  protected async handleCueWarm_Automatic(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

    const redLow = getColor('red', 'low');
    const redMed = getColor('red', 'medium');
   // const redHigh = getColor('red', 'high');

    const orangeLow = getColor('white', 'low');
    const orangeMed = getColor('white', 'medium');
   // const orangeHigh = getColor('white', 'high');

    const colors = [orangeLow, orangeMed,  redLow, redMed, ];
    const numColors = colors.length;

    const lights:TrackedLight[] = this.getLights(['front','back'], 'all');
    const num = lights.length;
    

    for(var i=0;i<num;i++){
      const rndIdx = randomBetween(0, numColors-1)
      const effect: Effect = getEffectSingleColor({
        color: colors[rndIdx],
        duration: 10,
        lights: [lights[i]],
        layer: i
      });
      this._sequencer.addEffect(`warm-auto-${i}`, effect);
    }
    
  }


  /**
   * Alternate front/back lights red/yellow
   * No Beat detect on RB3
   * @param _parameters 
   */
  protected async handleCueWarm_Manual(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
  
    const even = this.getLights(['front'], 'all');
    const odd = this.getLights(['back'], 'all');
  //  const all = this.getLights(['front', 'back'], 'all');
    const red: RGBIO = getColor('red', 'medium');
    const yellow: RGBIO = getColor('yellow', 'medium');
    

    
    const oddEffect:Effect = getEffectSingleColor({
      lights: odd,
      color: yellow,
      duration: 10,
      layer: 0,
    });
    

    const evenEffect:Effect = getEffectSingleColor({
      lights: even,
      color: red,
      duration: 10,
      layer: 1,
    });

  
    this._sequencer.setEffect('warm_manual-e', oddEffect);
    this._sequencer.addEffect('warm_manual-o', evenEffect);

  }


  /**
   * Randomly flash each light a random colour
   * @param _parameters 
   */
  protected async handleCueBigRockEnding(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

    const red: RGBIO = getColor('red', 'max');
    const green: RGBIO = getColor('green', 'max');
    const blue: RGBIO = getColor('blue', 'max');
    const orange: RGBIO = getColor('orange', 'max');
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
          holdTime: randomBetween(10, 40),
          durationOut: 50,
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
    // RB3 calls this frequently in songs, but it doesn't fit well with the effects.
    console.warn("Blackout_Fast ");
    //this._effects.blackout(50);
  //  const black:RGBIP = getColor('black', 'max');
  //  const lights = this.getLights(['front'], 'all');
   // this._effects.setState(lights, black, 100);
  }

  protected async handleCueBlackout_Slow(_parameters: CueData): Promise<void> {
   console.warn("Blackout_Slow");
    this._sequencer.blackout(200);
  }

  protected async handleCueBlackout_Spotlight(_parameters: CueData): Promise<void> {
    console.warn("\n ** Missing: Blackout_Spotlight ");
    this.handleCueBlackout_Fast(_parameters);
  }

 
  /**
   * White flashbulb like effect
   * @param _parameters 
   */
  protected async handleCueFlare_Fast(_parameters: CueData): Promise<void> {

    const white: RGBIO = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(5, 100),
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
   * Slower flashbulbs effect
   * NOTE: Not sure how well this works on RB3, needs testing.
   * @param _parameters 
   */
  protected async handleCueFlare_Slow(_parameters: CueData): Promise<void> {
    const white: RGBIO = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const numLights = lights.length;
    for (let i = 0; i < numLights; i++) {
      const flash = getEffectFlashColor({
        color: white,
        startTrigger: 'delay',
        startWait: randomBetween(20, 200),
        durationIn: 100,
        holdTime: randomBetween(20, 50),
        durationOut: 200,
        lights: [lights[i]],
        layer: i + 101,
      });
      this._sequencer.addEffect(`flare-slow${i}`, flash);
    }
  }

  /**
   * Rapid colour cycle across all lights
   * @param _parameters 
   */
  protected async handleCueFrenzy(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    // const cueName = 'frenzy';
     // console.log(cueName);
   
     const red: RGBIO = getColor('red', 'high');
     const green: RGBIO = getColor('green', 'high');
     const blue: RGBIO = getColor('blue', 'high');
     const orange: RGBIO = getColor('orange', 'high');
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
       duration: 10,
       afterEndColorWait: 0,
       lights: lights,
       layer: 0,
     });
   
     this._sequencer.addEffect(`frenzy`, cross);

     this._lastIndex = endColorIndex;
     
  }

  
  /**
   * Sets all front ligths a low green.
   * NOTE: I don't think RB3 uses this?... here just in case.
   * @param _parameters 
   */
  protected async handleCueIntro(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    const lights = this.getLights(['front'], 'all');
    const green: RGBIO = getColor('green', 'low');
    const effect = getEffectSingleColor({
      color: green,
      duration: 500,
      lights: lights,
    });

    // Intentionally using set to clear any higher layers
    this._sequencer.setEffect('intro', effect);
  
  }
  

  
  /**
   * Quick fade in/out of red
   * @param _parameters 
   */
  protected async handleCueHarmony(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    const green: RGBIO = getColor('green', 'high');
    const blue: RGBIO = getColor('blue', 'high');
   
    const lights = this.getLights(['front'], 'all');

    const blueEffect:Effect = getEffectSingleColor({
      lights: lights,
      color: blue,
      duration: 10,
      layer: 0,
    });

    const greenEffect:Effect = getEffectSingleColor({
      lights: this.getLights(['front'], 'random-1'),
      color: green,
      duration: 10,
      layer: 1,
    });
    

    this._sequencer.setEffect('harmony', blueEffect);
    this._sequencer.addEffect('harmony', greenEffect);
    
  }


  /**
   * Slow cycle through blues/greens/teals
   * @param _parameters 
   */
  protected async handleCueSilhouettes(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }

    const back = this.getLights(['back'], 'all');
    const front = this.getLights(['front'], 'all');
    const green: RGBIO = getColor('green', 'medium');
    const blue: RGBIO = getColor('blue', 'medium');
    const magenta = getColor('magenta', 'medium');
    const teal = getColor('teal', 'medium');
    
    const colours = [green, blue, magenta, teal];


    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: colours[randomBetween(0, colours.length-1)],
      duration: 10,
      waitUntil: 'none',
      untilTime: 0,
      lights: back.length > 0 ? back : front,
      layer: 0,
    });
    this._sequencer.setEffect('silhouettes', singleColor);
  }




  /**
   * Solid low blue
   * @param _parameters 
   */
  protected async handleCueSilhouettes_Spotlight(_parameters: CueData): Promise<void> {
    if(this._isDirectLedControl){
      return;
    }
    const low: RGBIO = getColor('blue', 'low');
    const singleColor = getEffectSingleColor({
      waitFor: 'none',
      forTime: 0,
      color: low,
      duration: 10,
      waitUntil: 'none',
      untilTime: 0,
      lights: this.getLights(['front', 'back'], 'all'),
      layer: 0,
    });
    this._sequencer.setEffect('silhouettes_spot', singleColor);

  }




  /**
   * Random colour selected overlay, wipes to the left.
   * @param _parameters 
   */
  protected async handleCueSearchlights(_parameters: CueData): Promise<void> {
    cueSearchlightsChase(this._sequencer, this._lightManager);
  }



  protected async handleCueStrobe_Fastest(_parameters: CueData): Promise<void> {
    
    const white: RGBIO = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');


    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'delay',
      startWait: 0,
      durationIn: 0,
      holdTime: 10,
      durationOut: 0,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash, true);
    
  }

  protected async handleCueStrobe_Fast(_parameters: CueData): Promise<void> {
    
    const white: RGBIO = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'delay',
      startWait: 0,
      durationIn: 5,
      holdTime: 20,
      durationOut: 10,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash, true);
    
  }

  
  protected async handleCueStrobe_Medium(_parameters: CueData): Promise<void> {
    
    const white: RGBIO = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'delay',
      startWait: 0,
      durationIn: 5,
      holdTime: 30,
      durationOut: 10,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash, true);
    
  }

  protected async handleCueStrobe_Slow(_parameters: CueData): Promise<void> {
    
    const white: RGBIO = getColor('white', 'max');
    const strobes = this.getLights(['strobe'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'delay',
      startWait: 0,
      durationIn: 5,
      holdTime: 50,
      durationOut: 10,
      lights: strobes,
      layer: 255,
    });
    this._sequencer.addEffectUnblockedName('strobe', flash, true);
    
  }

  protected async handleCueStrobe_Off(_parameters: CueData): Promise<void> {
    // Implementation for turning off strobe effects.
    this._sequencer.removeEffect('strobe', 255);
  }



  protected async handleCueSweep(_parameters: CueData): Promise<void> {
    
        const transparent: RGBIO = getColor('transparent', 'high');
        const red: RGBIO = getColor('red', 'max');
        const yellow: RGBIO = getColor('yellow', 'max');
        const g: RGBIO = getColor('green', 'max');
        const b: RGBIO = getColor('blue', 'max');
    
    
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
        // Use unblocked to prevent replacement, throwing the timing off
        this._sequencer.addEffectUnblockedName('sweep', sweep,);
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
   * RB3 uses Default in a menu. We're not currently checking the 
   * game state to see if we're in a menu, so this cue is currently not used.
   * @param _parameters 
   */
  protected async handleCueMenu(_parameters: CueData): Promise<void> {
    cueMenuCircleChase( this._sequencer, this._lightManager);
  }

   protected async handleCueScore(_parameters: CueData): Promise<void> {
    // const cueName = 'score';
     // console.log(cueName);
     
    const frontLights = this.getLights(['front'], 'all');
    const blue: RGBIO = getColor('blue', 'low');
    const yellow: RGBIO = getColor('yellow', 'low');
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
    this._sequencer.setEffect('score-yellow', fade, true);
  }

  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    // RB3 calls this A LOT, which borks any running effects.
    // ... so we're just going to ignore it. For now anyway.
  }




  /**
   * Handles sustain events
   * NOTE: Not sure this is a valid cue? Haven't seen it fire...
   * @param ms The duration of the sustain in milliseconds
   */
  public handleSustain(ms: number): void {
    console.log(`Sustain effect for ${ms}ms`);

    const lights = this.getLights(['front', 'back'], 'all');
    
    // Map the current LED Color to a valid Color for getColor or use white
    let ColorName: 'red' | 'blue' | 'yellow' | 'green' | 'white' = 'white';
    if (this._currentLedColor) {
      switch (this._currentLedColor.toLowerCase()) {
        case 'red': ColorName = 'red'; break;
        case 'blue': ColorName = 'blue'; break;
        case 'yellow': ColorName = 'yellow'; break;
        case 'green': ColorName = 'green'; break;
        default: ColorName = 'white';
      }
    }
    
    const color = getColor(ColorName, 'high');
    
    const effect: Effect = getEffectFlashColor({
      lights: lights,
      color: color,
      durationIn: ms * 0.1, 
      holdTime: ms * 0.8,   
      durationOut: ms * 0.1, 
      startTrigger: 'none',
      endTrigger: 'none',
      layer: 101 
    });
    
    this._sequencer.addEffect('sustain', effect);
  }

  public getAvailableCueGroups(): CueGroup[] {
    return [];
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    // RB3 direct LED control is handled separately, cue logic will be expanded later.
    console.log(`RB3 Cue received: ${cueType}`, parameters);
    
    // Emit events for network debugging
    this.emit('cueHandled', parameters);
    
    return Promise.resolve();
  }

}

export { Rb3CueHandler, CueType };