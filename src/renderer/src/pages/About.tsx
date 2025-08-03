
const About = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">About</h1>


      <div className="flex flex-col">
        <p className="mb-4">
          Photonics is a DMX sequencer for YARG & Rock Band 3 Enhanced. It uses the light show data provided by the game 
          to select and configure different lighting effects that are output to DMX lighting fixtures.
        </p>

        <h2 className="text-xl font-bold mb-4 mt-4 text-orange-400">Development Status</h2>
        <p className="mb-4 text-orange-400">
          This is an early preview build of Photonics, and as such is not feature complete. You should consider this more a proof-of-concept 
          than a finished app. Some features are incomplete and the current lighting cue library quite limited. 
        </p>

        <h2 className="text-xl font-bold mb-4 mt-4">For More Information or Help</h2>
        <p>For more information or to see the Quickstart Guide please visit us a <a href="https://photonics.rocks/" 
          className="text-blue-600 dark:text-blue-500 hover:underline" target="_blank">https://photonics.rocks/</a>.</p>
        <p>You can also visit our Discord Server - see the website for an invite link.</p>
        
        <h2 className="text-xl font-bold mb-4 mt-8">Credits</h2>
        <p className="mb-4">
          Photonics is only made possible by the hard work of others:
          </p> 
          <p className="mb-4">
            A thank you to the developers of <a href='https://yarg.in/' target='_blank' 
          className="text-blue-600 dark:text-blue-500 hover:underline" 
          >YARG</a> for building the future of rhythm gaming and <a href="https://github.com/YARC-Official/YALCY" target="_blank" 
          className="text-blue-600 dark:text-blue-500 hover:underline">YALCY</a> specifically for making the lighting integration possible.
        </p>
    
        <p className="mb-8">And a thank you to the developers of 
            of <a href='https://rb3e.rbenhanced.rocks/' target="_blank" className="text-blue-600 dark:text-blue-500 hover:underline">RB3Enhanced</a> which
             makes RB support possible.</p>

            

        <p>Additional thanks to the creators of various libraries Photonics utilizes under the hood including:</p>
        <ul className="space-y-0 ml-4 mr-4">
          <li className="text-left"><a href="https://github.com/node-dmx/dmx-ts" target="_blank" className="text-blue-600 dark:text-blue-500 hover:underline">dmx-ts</a>: provides support for Enttec Pro out.</li>
        </ul>

            <p className="mt-10">Photonics is developed by <em>Null Carrier</em>, you can reach me at <a href='https://photonics.rocks/contact' className="text-blue-600 dark:text-blue-500 hover:underline" target="_blank">Photonics.rocks/contact</a>.</p>
      </div>
    </div>
  );
};

export default About; 