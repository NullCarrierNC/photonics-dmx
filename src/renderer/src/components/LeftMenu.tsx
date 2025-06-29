import * as React from 'react';
import { FaMoon, FaSun, FaLightbulb, FaPlay } from 'react-icons/fa';
import { FiActivity, FiLayout, FiCpu, FiInfo, FiSliders } from 'react-icons/fi';
import { useAtom, useSetAtom } from 'jotai';
import { Pages } from './../types';
import { currentPageAtom } from './../atoms';

interface LeftMenuProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const LeftMenu: React.FC<LeftMenuProps> = ({ isDarkMode, toggleDarkMode }) => {
  const setCurrentPage = useSetAtom(currentPageAtom);
  const [activeMenu, setActiveMenu] = useAtom(currentPageAtom);

  const handleMenuClick = (page: Pages) => {
    setActiveMenu(page);
    setCurrentPage(page);
  };

  const buttonClasses = (menuName: Pages) =>
    `flex items-center space-x-2 p-2 hover:text-gray-400 ${
      activeMenu === menuName
        ? 'bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-white px-3 py-2 rounded-md'
        : 'text-gray-800 dark:text-gray-300'
    }`;

  return (
    <div className={`flex flex-col w-full h-full ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
      <div className="flex flex-col space-y-4 flex-grow w-full">
        
        {/* Status Button */}
        <button
          onClick={() => handleMenuClick(Pages.Status)}
          className={buttonClasses(Pages.Status)}
        >
          <FiActivity className="text-xl" />
          <span className="text-[12pt]">Status</span>
        </button>

        {/* My Lights Button */}
        <button
          onClick={() => handleMenuClick(Pages.MyLights)}
          className={buttonClasses(Pages.MyLights)}
        >
          <FaLightbulb className="text-xl" />
          <span className="text-[12pt]">My Lights</span>
        </button>

        {/* Light Layout Button */}
        <button
          onClick={() => handleMenuClick(Pages.LightLayout)}
          className={buttonClasses(Pages.LightLayout)}
        >
          <FiLayout className="text-xl" />
          <span className="text-[12pt]">Light Layout</span>
        </button>

        {/* Cue Preview Button */}
        <button
          onClick={() => handleMenuClick(Pages.CuePreview)}
          className={buttonClasses(Pages.CuePreview)}
        >
          <FaPlay className="text-xl" />
          <span className="text-[12pt]">DMX Preview</span>
        </button>



        {/* Network Debug Button */}
        <button
          onClick={() => handleMenuClick(Pages.NetworkDebug)}
          className={buttonClasses(Pages.NetworkDebug)}
        >
          <FiCpu className="text-xl" />
          <span className="text-[12pt]">Network Debug</span>
        </button>

         {/* Preferences */}
         <button
          onClick={() => handleMenuClick(Pages.Preferences)}
          className={buttonClasses(Pages.Preferences)}
        >
          <FiSliders className="text-xl" />
          <span className="text-[12pt]">Preferences</span>
        </button>

         {/* About */}
         <button
          onClick={() => handleMenuClick(Pages.About)}
          className={buttonClasses(Pages.About)}
        >
          <FiInfo className="text-xl" />
          <span className="text-[12pt]">About</span>
        </button>
      </div>

      {/* Light/Dark Mode Switch */}
      <button
        onClick={toggleDarkMode}
        className="flex items-center w-full p-2 hover:text-gray-400"
        aria-label="Toggle Dark Mode"
      >
        {isDarkMode ? <FaMoon className="text-sm" /> : <FaSun className="text-sm" />}
        <span className="text-sm ml-2">
          {isDarkMode ? 'Dark Mode' : 'Light Mode'}
        </span>
      </button>
    </div>
  );
};

export default LeftMenu;