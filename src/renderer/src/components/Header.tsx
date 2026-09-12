import * as React from 'react'
import { useAtom } from 'jotai'
import { currentPageAtom } from './../atoms'
import { Pages } from './../types'

import { FiHelpCircle } from 'react-icons/fi'
import { MASTER_OUTPUT_SIDEBAR_WIDTH_PX } from './MasterOutputSidebar'

const Header: React.FC = () => {
  const [currentPage] = useAtom(currentPageAtom)

  // Total over Pages, so a new page cannot reach the header with no title. CueSequencer routes to
  // the Cue Editor (see AppPageRouter), so it carries that page's title.
  const pageTitles: Record<Pages, string> = {
    [Pages.Status]: 'Status',
    [Pages.MyLights]: 'My Lights',
    [Pages.LightLayout]: 'Light Layout',
    [Pages.DmxConsole]: 'DMX Console',
    [Pages.NetworkDebug]: 'Network Debug',
    [Pages.CuePreview]: 'DMX Preview',
    [Pages.CueSimulation]: 'Cue Simulation',
    [Pages.CueSequencer]: 'Cue Editor',
    [Pages.CueEditor]: 'Cue Editor',
    [Pages.Preferences]: 'Preferences',
    [Pages.About]: 'About Photonics (ALPHA VERSION)',
  }

  return (
    <div className="flex items-center justify-between py-4 pl-4 w-full">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
        {pageTitles[currentPage] || currentPage}
      </h1>
      {/* As wide as the master output sidebar below it, so the icon centres over that column. */}
      <button
        className="ml-auto flex items-center justify-center shrink-0 text-white font-bold hover:text-gray-300 focus:outline-none"
        style={{ width: MASTER_OUTPUT_SIDEBAR_WIDTH_PX }}
        aria-label="Help">
        <a href="https://photonics.rocks/quickstart-guide/" target="_blank">
          <FiHelpCircle size={32} className="text-white" />
        </a>
      </button>
    </div>
  )
}

export default Header
