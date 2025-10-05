
const About = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">About</h1>


      <div className="flex flex-col">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Photonics is a DMX sequencer for YARG & Rock Band 3 Enhanced. It uses the light show data provided by the game 
          to select and configure different lighting effects that are output to DMX lighting fixtures.
        </p>

        <h2 className="text-xl font-bold mb-4 mt-4 text-orange-400">Development Status</h2>
        <p className="mb-4 text-orange-400">
          This is the second Alpha build of Photonics, and as such is not feature complete. We'd appreciate any feedback you can provide!
        </p>

        <h2 className="text-xl font-bold mb-4 mt-4 text-gray-800 dark:text-gray-200">For More Information or Help</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">For more information or to see the Quickstart Guide please visit us at <a href="https://photonics.rocks/" 
          className="text-blue-600 dark:text-blue-500 hover:underline" target="_blank">https://photonics.rocks/</a>.</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">You can also visit our <a href="https://discord.com/invite/2Vyqc2hYcK" className="text-blue-600 dark:text-blue-500 hover:underline" target="_blank">Discord Server</a>.</p>
        
        <h2 className="text-xl font-bold mb-4 mt-8 text-gray-800 dark:text-gray-200">Credits</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Photonics is only made possible by the hard work of others:
          </p> 
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            A thank you to the developers of <a href='https://yarg.in/' target='_blank' 
          className="text-blue-600 dark:text-blue-500 hover:underline" 
          >YARG</a> for building the future of rhythm gaming and The Fat Bastid / <a href="https://github.com/YARC-Official/YALCY" target="_blank" 
          className="text-blue-600 dark:text-blue-500 hover:underline">YALCY</a> specifically for making the lighting integration possible.
        </p>
    
        <p className="mb-8 text-sm text-gray-600 dark:text-gray-400">And a thank you to the developers of 
            of <a href='https://rb3e.rbenhanced.rocks/' target="_blank" className="text-blue-600 dark:text-blue-500 hover:underline">RB3Enhanced</a> which
             makes Rock Band 3 support possible.</p>

            

        <p className="text-sm text-gray-600 dark:text-gray-400">Additional thanks to the creators of various libraries Photonics utilizes under the hood including:</p>
        <ul className="space-y-0 ml-4 mr-4">
          <li className="text-left text-sm text-gray-600 dark:text-gray-400"><a href="https://github.com/node-dmx/dmx-ts" target="_blank" className="text-blue-600 dark:text-blue-500 hover:underline">dmx-ts</a>: provides support for sACN, ArtNet, and Enttec Pro out.</li>
        </ul>

            <p className="mt-10 text-sm text-gray-600 dark:text-gray-400">Photonics is developed by <em>Null Carrier</em>, you can reach me at <a href='https://photonics.rocks/contact' className="text-blue-600 dark:text-blue-500 hover:underline" target="_blank">Photonics.rocks/contact</a>.</p>
      </div>
    </div>
  );
};

export default About; 