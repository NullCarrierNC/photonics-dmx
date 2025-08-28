import CuePreview from '@renderer/components/CuePreview';
import DmxSettingsAccordion from '@renderer/components/DmxSettingAccordion';

const Status = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Status</h1>

      <DmxSettingsAccordion startOpen={true} />

  
      <hr className="mt-8 mb-8" />

      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">DMX Output</h2>
        <p className="mb-4">
          sACN support is enabled by default. Visit preferences to enable other output methods.
        </p>
        <p className="mb-4">
          You will need to configure your lights in My Lights and Light Layout before they will be available for use.
        </p>
      </div>
      
      <hr className="mt-8 mb-8" />

      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">A Note About Custom Songs</h2>
        <p className="mb-4">
          If you are using custom or converted songs the venue track for driving the
          lightshow may be missing. If you are using YARG it will automatically generate
          a light show if this data isn't available. These shows tend to be slower paced
          than original RB show data.
        </p>
        <p className="mb-4">
          YARG's automatically generated shows will not include any strobe effects.
        </p>
      </div>

      <hr className="mt-8 mb-8" />
      
      

      {/*     Debounce is hidden as it shouldn't be needed. I'm not removing it yet in case it's 
        useful for testing down the road.

        <h2 className="text-xl font-bold mb-4">Simple/Complex Cues</h2>
        <p className="mb-4">
          Complex cues are best with YARG, while simple cues work best for RB3E. Complex cues may required data 
          not available in RB3 and/or different timing/pacing that may not play as nicely with RB3.
        </p>

        <h2 className="text-xl font-bold mb-4 mt-4">Debounce Period</h2>

        <p className="mb-4 ">
          Normally this should be 0. <br/>
        </p><p className="mb-4 ">
          Debounce will ignore cue events that come in faster than the time specified. 
          If you find the effects seem to stutter/flicker or change too rapidly, increase this value. If effects seem "stuck" 
          during fast-paced songs, lower this value. (Some songs may have the same effect remain on for extended periods by design)
        </p>
       
        <p className="mb-4">
          If the debounce period is set too high, more cues will be dropped, causing the light
          show to change infrequently and not necessarily reflect the mood of the music.
        </p>
        <p className="mb-4">
          If the debounce period is set too low, cues will change far more frequently,
          potentially causing conflicts between them.
        </p>
       
        <p className="mb-4 mt-3 italic font-bold text-orange-400">
          Light show effects are preliminary in this version.
        </p>
              */}
    </div>


  );
};

export default Status;