import React from 'react';
import type { ConfigLightLayoutType } from '../../../../photonics-dmx/types';
import { ConfigStrobeType } from '../../../../photonics-dmx/types';

const LIGHT_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface AssignedToBackOption {
  value: string;
  label: string;
}

interface LightsLayoutFormProps {
  selectedCount: number | null;
  setSelectedCount: (n: number | null) => void;
  selectedLayout: string;
  setSelectedLayout: (id: string) => void;
  assignedToBack: number | 'None';
  setAssignedToBack: (v: number | 'None') => void;
  assignedToBackOptions: AssignedToBackOption[];
  availableLayouts: ConfigLightLayoutType[];
  allPrimaryLightsCountBack: number;
  selectedStrobe: ConfigStrobeType;
  setSelectedStrobe: (v: ConfigStrobeType) => void;
  dedicatedStrobeCount: number;
  setDedicatedStrobeCount: (n: number) => void;
  hasPhysicalStrobe: boolean;
}

const LightsLayoutForm: React.FC<LightsLayoutFormProps> = ({
  selectedCount,
  setSelectedCount,
  selectedLayout,
  setSelectedLayout,
  assignedToBack,
  setAssignedToBack,
  assignedToBackOptions,
  availableLayouts,
  allPrimaryLightsCountBack,
  selectedStrobe,
  setSelectedStrobe,
  dedicatedStrobeCount,
  setDedicatedStrobeCount,
  hasPhysicalStrobe
}) => (
  <form className="space-y-6 max-w-full">
    <div className="flex flex-wrap gap-4">
      <label className="flex flex-col items-start flex-1 min-w-[200px]">
        <span className="mb-2 text-gray-700 dark:text-gray-300">Number of Primary Lights</span>
        <select
          value={selectedCount ?? ''}
          onChange={(e) => {
            const newCount = e.target.value ? Number(e.target.value) : null;
            setSelectedCount(newCount);
            if (newCount && assignedToBack !== 'None' && assignedToBack >= newCount) {
              setAssignedToBack('None');
            }
          }}
          className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
        >
          {!selectedCount && <option value="">Select</option>}
          {LIGHT_COUNT_OPTIONS.map((cnt) => (
            <option key={cnt} value={cnt}>
              {cnt} Light{cnt > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col items-start flex-1 min-w-[200px]">
        <span className="mb-2 text-gray-700 dark:text-gray-300">Primary Light Layout</span>
        <select
          value={selectedLayout}
          onChange={(e) => {
            setSelectedLayout(e.target.value);
            if (e.target.value !== 'front-back') {
              setAssignedToBack('None');
            } else {
              setAssignedToBack(allPrimaryLightsCountBack || 'None');
            }
          }}
          className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
        >
          {availableLayouts.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.label}
            </option>
          ))}
        </select>
      </label>

      {selectedLayout === 'front-back' && (
        <label className="flex flex-col items-start flex-1 min-w-[200px]">
          <span className="mb-2 text-gray-700 dark:text-gray-300">Assigned to Back</span>
          <select
            value={assignedToBack}
            onChange={(e) => {
              const val = e.target.value;
              setAssignedToBack(val === 'None' ? 'None' : Number(val));
            }}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
          >
            {assignedToBackOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col items-start flex-1 min-w-[200px]">
        <span className="mb-2 text-gray-700 dark:text-gray-300">Strobe Effects</span>
        <select
          value={selectedStrobe}
          onChange={(e) => {
            const value = e.target.value as ConfigStrobeType;
            setSelectedStrobe(value);
            if (value === ConfigStrobeType.Dedicated) {
              setDedicatedStrobeCount(dedicatedStrobeCount === 0 ? 1 : dedicatedStrobeCount);
            } else {
              setDedicatedStrobeCount(0);
            }
          }}
          className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
        >
          <option value={ConfigStrobeType.None}>None</option>
          {hasPhysicalStrobe && (
            <option value={ConfigStrobeType.Dedicated}>Dedicated Strobe Lights</option>
          )}
          <option value={ConfigStrobeType.AllCapable}>Strobe Enabled Lights</option>
        </select>
      </label>

      {selectedStrobe === ConfigStrobeType.Dedicated && (
        <label className="flex flex-col items-start flex-1 min-w-[200px]">
          <span className="mb-2 text-gray-700 dark:text-gray-300">Number of Strobes</span>
          <select
            value={dedicatedStrobeCount}
            onChange={(e) => setDedicatedStrobeCount(Number(e.target.value))}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded w-full text-black dark:text-white dark:bg-gray-700"
          >
            {[1, 2, 3, 4].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  </form>
);

export default LightsLayoutForm;
