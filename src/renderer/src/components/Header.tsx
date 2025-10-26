import * as React from 'react';
import { useAtom } from 'jotai';
import { currentPageAtom } from './../atoms';
import { Pages } from './../types';

import { FiHelpCircle } from 'react-icons/fi';

const Header: React.FC = () => {
  const [currentPage] = useAtom(currentPageAtom);


  const pageTitles = {
    [Pages.Status]: 'Status',
    [Pages.MyLights]: 'My Lights',
    [Pages.LightLayout]: 'Light Layout',
    [Pages.NetworkDebug]: 'Network Debug',
    [Pages.CuePreview]: 'DMX Preview',
    [Pages.About]: 'About Photonics (ALPHA VERSION)',
  };

  return (
    <div className="flex items-center justify-between p-4 w-full">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{pageTitles[currentPage]}</h1>
      <button
        className="ml-auto flex items-center text-white font-bold hover:text-gray-300 focus:outline-none"
        aria-label="Help"
      >
        
        <a href="https://photonics.rocks/quickstart-guide/" target='_blank'><FiHelpCircle size={32} className="text-white" /></a>
      </button>
    </div>
  );
};

export default Header;