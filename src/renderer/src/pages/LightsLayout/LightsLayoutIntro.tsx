import React from 'react'

/**
 * Intro copy and usage notes for the Lights Layout page.
 */
const LightsLayoutIntro: React.FC = () => (
  <>
    <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Lights Layout</h1>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
      The Lights Layout allows you to assign the lights you created in My Lights to specific
      lighting fixture positions and to configure their DMX channels.
    </p>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
      The Master Dimmer channel acts like the light&apos;s index, and all other channels will be
      calculated for you automatically.
    </p>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
      E.g. If you defined your light as MasterDimmer=1, Red=2, Green=3, Blue=4 and here you set
      Front 1 Master Dimmer to 11, your R/G/B channels automatically become 12/13/14.
    </p>
    <p className="mb-1 italic font-bold text-orange-400 text-[9pt]">
      RBE3 requires either 4 or 8 lights in your layout. If you have &gt; 4 but &lt; 8, only the
      first 4 lights will be used.
    </p>
    <p className="mb-3 italic font-bold text-orange-400 text-[9pt]">
      Using 8 lights provides the most Stage Kit like experience. 4 lights is good, but will look
      somewhat different.
    </p>
    <p className="mb-6 italic font-bold text-orange-400 text-[9pt]">
      YARG can scale from 2 lights up, but we recommend and have tested mostly 4 and 8 light
      configurations. A minimum of 4 lights is recommended.
    </p>
    <p className="mb-8 italic font-bold text-yellow-400">
      For the most Stage Kit like experience: assign 4 lights to the front. If you have 8, assign
      the remaining 4 to the back.
    </p>
  </>
)

export default LightsLayoutIntro
