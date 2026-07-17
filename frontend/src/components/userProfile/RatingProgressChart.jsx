import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchChessComRatingHistoryFromDb } from '../../services/chessComDbService';

const TIME_CONTROLS = [
  { key: 'bullet', label: 'Bullet', color: '#f7c631' },
  { key: 'blitz', label: 'Blitz', color: '#e8a317' },
  { key: 'rapid', label: 'Rapid', color: '#81b64c' },
  { key: 'daily', label: 'Daily', color: '#5c8fd4' },
];

const MONTHS_WINDOW = 3;

const CHART_THEMES = {
  dark: {
    grid: '#3a3835',
    axis: '#3a3835',
    tick: '#a8a6a3',
    label: '#7a7875',
    cursor: '#3a3835',
    activeDotStroke: '#f3f2f1',
  },
  light: {
    grid: '#e5e7eb',
    axis: '#e5e7eb',
    tick: '#6b7280',
    label: '#9ca3af',
    cursor: '#d1d5db',
    activeDotStroke: '#ffffff',
  },
};

function formatSinceLabel(sinceDate) {
  if (!sinceDate) return null;
  const d = new Date(sinceDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function computeSinceDate(rangeKey, joiningDate) {
  if (rangeKey === 'joining' && joiningDate) return joiningDate;
  if (rangeKey === 'overall') return null;
  const now = new Date();
  if (rangeKey === '1d') {
    // Yesterday 00:00 local → includes yesterday + today
    now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (rangeKey === '1w') {
    now.setDate(now.getDate() - 7);
    return now.toISOString().slice(0, 10);
  }
  if (rangeKey === '1m') {
    now.setMonth(now.getMonth() - 1);
    return now.toISOString().slice(0, 10);
  }
  return null;
}

function RatingTooltip({ active, payload, theme = 'dark' }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className={`chess-rating-chart-tooltip${theme === 'light' ? ' chess-rating-chart-tooltip--light' : ''}`}>
      <div className="chess-rating-chart-tooltip-title">Game {point.game}</div>
      <div className="chess-rating-chart-tooltip-row">
        <span>Rating</span>
        <strong>{point.rating}</strong>
      </div>
      {point.date && (
        <div className="chess-rating-chart-tooltip-row">
          <span>Date</span>
          <strong>{point.date}</strong>
        </div>
      )}
    </div>
  );
}

const RANGE_FILTERS = [
  { key: 'joining', label: 'From Joining' },
  { key: '1d', label: '1 Day' },
  { key: '1w', label: '1 Week' },
  { key: '1m', label: '1 Month' },
  { key: 'overall', label: 'Overall' },
];

export { RANGE_FILTERS, computeSinceDate };

/**
 * @param {object} props
 * @param {string} props.username
 * @param {string} [props.activeTimeClass]
 * @param {(key: string) => void} [props.onActiveTimeClassChange]
 * @param {boolean} [props.hideTabs] hide time-control tab buttons
 * @param {boolean} [props.compact]
 * @param {string} [props.joiningDate] YYYY-MM-DD student joining date
 * @param {boolean} [props.showRangeFilters] show date-range filter buttons (uncontrolled)
 * @param {string} [props.activeRange] controlled range key
 * @param {(key: string) => void} [props.onActiveRangeChange]
 * @param {'dark'|'light'} [props.theme]
 */
function RatingProgressChart({
  username,
  activeTimeClass: controlledTimeClass,
  onActiveTimeClassChange,
  hideTabs = false,
  compact = false,
  joiningDate = null,
  showRangeFilters = false,
  activeRange: controlledRange,
  onActiveRangeChange,
  theme = 'dark',
}) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalTimeClass, setInternalTimeClass] = useState('blitz');
  const [internalRange, setInternalRange] = useState(joiningDate ? 'joining' : 'overall');
  const initialPickDoneRef = useRef(false);
  const isControlled = controlledTimeClass != null;
  const isRangeControlled = controlledRange != null;
  const activeTimeClass = isControlled ? controlledTimeClass : internalTimeClass;
  const activeRange = isRangeControlled ? controlledRange : internalRange;
  const palette = CHART_THEMES[theme] || CHART_THEMES.dark;

  const effectiveSince = useMemo(
    () =>
      showRangeFilters || isRangeControlled
        ? computeSinceDate(activeRange, joiningDate)
        : joiningDate,
    [showRangeFilters, isRangeControlled, activeRange, joiningDate]
  );

  const sinceLabel = formatSinceLabel(effectiveSince);

  const setActiveTimeClass = (key) => {
    if (onActiveTimeClassChange) onActiveTimeClassChange(key);
    if (!isControlled) setInternalTimeClass(key);
  };

  const setActiveRange = (key) => {
    if (onActiveRangeChange) onActiveRangeChange(key);
    if (!isRangeControlled) setInternalRange(key);
  };

  useEffect(() => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setGames([]);
      setLoading(false);
      return undefined;
    }

    initialPickDoneRef.current = false;
    if (!isControlled) setInternalTimeClass('blitz');

    let cancelled = false;
    setLoading(true);
    setError(null);

    const isOverall = (showRangeFilters || isRangeControlled) && activeRange === 'overall';
    const fetchOpts = effectiveSince
      ? { since: effectiveSince }
      : isOverall
        ? { all: true }
        : { months: MONTHS_WINDOW };

    fetchChessComRatingHistoryFromDb(safeUsername, fetchOpts)
      .then((data) => {
        if (cancelled) return;
        setGames(data.games || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load rating history.');
        setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username, isControlled, effectiveSince]);

  const seriesByTimeClass = useMemo(() => {
    const grouped = Object.fromEntries(TIME_CONTROLS.map((tc) => [tc.key, []]));

    games.forEach((game) => {
      const key = String(game.timeClass || '').toLowerCase();
      if (!grouped[key]) return;
      grouped[key].push(game);
    });

    return Object.fromEntries(
      Object.entries(grouped).map(([key, items]) => [
        key,
        items.map((game, index) => ({
          game: index + 1,
          rating: game.selfRating,
          date: game.date,
        })),
      ])
    );
  }, [games]);

  useEffect(() => {
    if (isControlled || initialPickDoneRef.current || !games.length) return;
    const best = TIME_CONTROLS.map((tc) => ({
      key: tc.key,
      count: seriesByTimeClass[tc.key]?.length || 0,
    }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)[0];
    if (best) {
      setActiveTimeClass(best.key);
      initialPickDoneRef.current = true;
    }
  }, [games, seriesByTimeClass, isControlled]);

  const activeConfig = TIME_CONTROLS.find((tc) => tc.key === activeTimeClass) || TIME_CONTROLS[1];
  const chartData = seriesByTimeClass[activeTimeClass] || [];

  const yDomain = useMemo(() => {
    if (!chartData.length) return [800, 2200];
    const ratings = chartData.map((point) => point.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const padding = Math.max(20, Math.round((max - min) * 0.08) || 40);
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  const xTicks = useMemo(() => {
    if (chartData.length <= 1) return chartData.map((point) => point.game);
    const max = chartData.length;
    const step = max <= 10 ? 1 : max <= 30 ? 5 : max <= 80 ? 10 : 20;
    const ticks = [];
    for (let i = 1; i <= max; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }, [chartData]);

  const chartHeight = compact ? 200 : 220;
  const isOverallRange =
    (showRangeFilters || isRangeControlled) && activeRange === 'overall';
  const rangeLabel = isOverallRange
    ? 'all time'
    : sinceLabel
      ? `since ${sinceLabel}`
      : `last ${MONTHS_WINDOW} months`;
  const emptyRangeLabel = isOverallRange
    ? 'across all time'
    : sinceLabel
      ? `since ${sinceLabel}`
      : `in the last ${MONTHS_WINDOW} months`;

  return (
    <div
      className={`chess-rating-chart${compact ? ' chess-rating-chart--compact' : ''}${
        theme === 'light' ? ' chess-rating-chart--light' : ''
      }`}
    >
      <div className="chess-rating-chart-header">
        <div>
          <h3 className="chess-rating-chart-title">
            {activeConfig.label} · {rangeLabel}
          </h3>
          <p className="chess-rating-chart-subtitle">
            Rated games only · click a rating card above to switch
          </p>
        </div>
        {!hideTabs && !showRangeFilters && (
          <div className="chess-rating-chart-tabs" role="tablist" aria-label="Time control">
            {TIME_CONTROLS.map((tc) => {
              const count = seriesByTimeClass[tc.key]?.length || 0;
              const isActive = activeTimeClass === tc.key;
              return (
                <button
                  key={tc.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`chess-rating-chart-tab${isActive ? ' is-active' : ''}`}
                  style={{ '--tab-accent': tc.color }}
                  onClick={() => {
                    initialPickDoneRef.current = true;
                    setActiveTimeClass(tc.key);
                  }}
                >
                  {tc.label}
                  {count > 0 && <span className="chess-rating-chart-tab-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
        {showRangeFilters && (
          <div className="chess-rating-chart-tabs" role="tablist" aria-label="Time range">
            {RANGE_FILTERS.map((rf) => {
              if (rf.key === 'joining' && !joiningDate) return null;
              const isActive = activeRange === rf.key;
              return (
                <button
                  key={rf.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`chess-rating-chart-tab${isActive ? ' is-active' : ''}`}
                  style={{ '--tab-accent': '#6366f1' }}
                  onClick={() => setActiveRange(rf.key)}
                >
                  {rf.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="chess-rating-chart-body">
        {loading ? (
          <div className="chess-rating-chart-empty">Loading rating history…</div>
        ) : error ? (
          <div className="chess-rating-chart-empty chess-rating-chart-empty--error">{error}</div>
        ) : chartData.length === 0 ? (
          <div className="chess-rating-chart-empty">
            No rated {activeConfig.label.toLowerCase()} games {emptyRangeLabel}.
          </div>
        ) : (
          <>
            <div className="chess-rating-chart-meta">
              <span>
                <strong>{chartData.length}</strong> games
              </span>
              <span>
                Current <strong>{chartData[chartData.length - 1]?.rating}</strong>
              </span>
              {chartData.length > 1 && (
                <span>
                  Change{' '}
                  <strong
                    className={
                      chartData[chartData.length - 1].rating - chartData[0].rating >= 0
                        ? 'chess-rating-chart-delta-up'
                        : 'chess-rating-chart-delta-down'
                    }
                  >
                    {chartData[chartData.length - 1].rating - chartData[0].rating >= 0 ? '+' : ''}
                    {chartData[chartData.length - 1].rating - chartData[0].rating}
                  </strong>
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="game"
                  type="number"
                  domain={[1, chartData.length]}
                  ticks={xTicks}
                  tick={{ fill: palette.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: palette.axis }}
                  label={{
                    value: 'Game #',
                    position: 'insideBottom',
                    offset: -2,
                    fill: palette.label,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: palette.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: palette.axis }}
                  width={44}
                />
                <Tooltip content={<RatingTooltip theme={theme} />} cursor={{ stroke: palette.cursor }} />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke={activeConfig.color}
                  strokeWidth={2.5}
                  dot={chartData.length <= 40 ? { r: 3, fill: activeConfig.color } : false}
                  activeDot={{
                    r: 5,
                    fill: activeConfig.color,
                    stroke: palette.activeDotStroke,
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}

export default RatingProgressChart;
