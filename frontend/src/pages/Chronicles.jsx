import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import ChroniclesStoriesTab from '../components/chronicles/ChroniclesStoriesTab';
import ChroniclesPuzzlesTab from '../components/chronicles/ChroniclesPuzzlesTab';
import './Chronicles.css';

const CHRONICLES_TABS = [
  { key: 'modules', label: 'Modules' },
  { key: 'stories', label: 'Stories' },
  { key: 'principles', label: 'Principles' },
  { key: 'puzzles', label: 'Puzzles' },
];

const VALID_TAB_KEYS = new Set(CHRONICLES_TABS.map((tab) => tab.key));

function resolveTab(searchParams) {
  const tab = (searchParams.get('tab') || 'modules').toLowerCase();
  return VALID_TAB_KEYS.has(tab) ? tab : 'modules';
}

function ChroniclesPlaceholder({ label }) {
  return (
    <EmptyState
      title={`${label} coming soon`}
      subtitle="This section is empty for now. Content will be added here next."
    />
  );
}

function Chronicles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => resolveTab(searchParams), [searchParams]);

  const setActiveTab = useCallback(
    (tab) => {
      if (!VALID_TAB_KEYS.has(tab) || tab === activeTab) return;
      setSearchParams({ tab }, { replace: true });
    },
    [activeTab, setSearchParams]
  );

  const activeLabel = CHRONICLES_TABS.find((tab) => tab.key === activeTab)?.label || 'Modules';

  return (
    <div className="chronicles-page">
      <header className="chronicles-header">
        <div>
          <h1 className="chronicles-title">Chronicles</h1>
          <p className="chronicles-subtitle">
            Curriculum hub for modules, stories, principles, and puzzles.
          </p>
        </div>
      </header>

      <nav className="chronicles-tabs" aria-label="Chronicles sections">
        {CHRONICLES_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`chronicles-tab${activeTab === tab.key ? ' chronicles-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="chronicles-panel" aria-labelledby="chronicles-panel-title">
        <h2 id="chronicles-panel-title" className="chronicles-panel-title">
          {activeLabel}
        </h2>

        {activeTab === 'stories' && <ChroniclesStoriesTab />}
        {activeTab === 'modules' && <ChroniclesPlaceholder label="Modules" />}
        {activeTab === 'principles' && <ChroniclesPlaceholder label="Principles" />}
        {activeTab === 'puzzles' && <ChroniclesPuzzlesTab />}
      </section>
    </div>
  );
}

export default Chronicles;
