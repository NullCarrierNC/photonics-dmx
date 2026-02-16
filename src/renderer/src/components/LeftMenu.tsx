import * as React from 'react';
import { FaMoon, FaSun, FaLightbulb, FaPlay, FaInfinity } from 'react-icons/fa';
import { FiActivity, FiLayout, FiCpu, FiInfo, FiSliders, FiVolume2, FiPenTool, FiChevronLeft, FiChevronRight, FiExternalLink } from 'react-icons/fi';
import { useAtom, useSetAtom } from 'jotai';
import { Pages } from './../types';
import { currentPageAtom } from './../atoms';
import { openCueEditorWindow } from '../ipcApi';

interface LeftMenuProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const LeftMenu: React.FC<LeftMenuProps> = ({ isDarkMode, toggleDarkMode, isCollapsed, onToggleCollapse }) => {
  const setCurrentPage = useSetAtom(currentPageAtom);
  const [activeMenu, setActiveMenu] = useAtom(currentPageAtom);

  const handleMenuClick = (page: Pages) => {
    setActiveMenu(page);
    setCurrentPage(page);
  };

  const handleCueEditorClick = () => {
    openCueEditorWindow();
  };

  const buttonClasses = (menuName: Pages) =>
    `flex items-center ${isCollapsed ? 'justify-center' : 'space-x-2'} p-2 hover:text-gray-400 ${
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
          title={isCollapsed ? 'Status' : undefined}
        >
          <FiActivity className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Status</span>}
        </button>

        {/* My Lights Button */}
        <button
          onClick={() => handleMenuClick(Pages.MyLights)}
          className={buttonClasses(Pages.MyLights)}
          title={isCollapsed ? 'My Lights' : undefined}
        >
          <FaLightbulb className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">My Lights</span>}
        </button>

        {/* Light Layout Button */}
        <button
          onClick={() => handleMenuClick(Pages.LightLayout)}
          className={buttonClasses(Pages.LightLayout)}
          title={isCollapsed ? 'Light Layout' : undefined}
        >
          <FiLayout className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Light Layout</span>}
        </button>

        {/* Cue Preview Button */}
        <button
          onClick={() => handleMenuClick(Pages.CuePreview)}
          className={buttonClasses(Pages.CuePreview)}
          title={isCollapsed ? 'DMX Preview' : undefined}
        >
          <FaPlay className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">DMX Preview</span>}
        </button>

        {/* Cue Simulation Button */}
        <button
          onClick={() => handleMenuClick(Pages.CueSimulation)}
          className={buttonClasses(Pages.CueSimulation)}
          title={isCollapsed ? 'Cue Simulation' : undefined}
        >
          <FaInfinity className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Cue Simulation</span>}
        </button>

        {/* Cue Editor Button */}
        <button
          onClick={handleCueEditorClick}
          className={buttonClasses(Pages.CueEditor)}
          title={isCollapsed ? 'Cue Editor' : undefined}
        >
          <FiPenTool className="text-xl" />
          {!isCollapsed && (
            <span className="text-[12pt] flex items-center gap-1">
              Cue Editor
              <FiExternalLink className="text-[10pt]" />
            </span>
          )}
        </button>

        {/* Network Debug Button */}
        <button
          onClick={() => handleMenuClick(Pages.NetworkDebug)}
          className={buttonClasses(Pages.NetworkDebug)}
          title={isCollapsed ? 'Network Debug' : undefined}
        >
          <FiCpu className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Network Debug</span>}
        </button>

         {/* Preferences */}
         <button
          onClick={() => handleMenuClick(Pages.Preferences)}
          className={buttonClasses(Pages.Preferences)}
          title={isCollapsed ? 'Preferences' : undefined}
        >
          <FiSliders className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Preferences</span>}
        </button>

         {/* Audio Settings */}
         <button
          onClick={() => handleMenuClick(Pages.AudioSettings)}
          className={buttonClasses(Pages.AudioSettings)}
          title={isCollapsed ? 'Audio Settings' : undefined}
        >
          <FiVolume2 className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">Audio Settings</span>}
        </button>

         {/* About */}
         <button
          onClick={() => handleMenuClick(Pages.About)}
          className={buttonClasses(Pages.About)}
          title={isCollapsed ? 'About' : undefined}
        >
          <FiInfo className="text-xl" />
          {!isCollapsed && <span className="text-[12pt]">About</span>}
        </button>
      </div>

      {/* Light/Dark Mode Switch and Collapse Toggle */}
      <div className="flex items-center w-full">
        <button
          onClick={toggleDarkMode}
          className={`flex items-center flex-1 p-2 hover:text-gray-400 ${isCollapsed ? 'justify-center' : ''}`}
          aria-label="Toggle Dark Mode"
          title={isCollapsed ? (isDarkMode ? 'Dark Mode' : 'Light Mode') : undefined}
        >
          {isDarkMode ? <FaMoon className="text-sm" /> : <FaSun className="text-sm" />}
          {!isCollapsed && (
            <span className="text-sm ml-2">
              {isDarkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          )}
        </button>

        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors"
          aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
        >
          {isCollapsed ? (
            <FiChevronRight className="text-xl" />
          ) : (
            <FiChevronLeft className="text-xl" />
          )}
        </button>
      </div>
    </div>
  );
};

export default LeftMenu;