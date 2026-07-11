'use client';

import { TABS } from '../lib/promptFormatters';

export function PromptTabs({
  activeTab,
  getTabCount,
  onChange,
}: {
  activeTab: string;
  getTabCount: (key: string) => number;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 border-b border-gray-200 pb-0 flex-wrap">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === tab.key
              ? 'bg-white border border-gray-200 border-b-white -mb-[1px] text-blue-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {tab.label}
          <span className="ml-1.5 text-xs text-gray-400">({getTabCount(tab.key)})</span>
        </button>
      ))}
    </div>
  );
}
