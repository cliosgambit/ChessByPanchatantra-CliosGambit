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

function RatingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="chess-rating-chart-tooltip">
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

/**
 * @param {object} props
 * @param {string} props.username
 * @param {string} [props.activeTimeClass] controlled time class (bullet|blitz|rapid|daily)
 * @param {(key: string) => void} [props.onActiveTimeClassChange]
 * @param {boolean} [props.hideTabs] hide internal tab buttons (when rating cards drive selection)
 * @param {boolean} [props.compact] denser layout for profile header
 */
function RatingProgressChart({
  username,
  activeTimeClass: controlledTimeClass,
  onActiveTimeClassChange,
  hideTabs = false,
  compact = false,
}) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalTimeClass, setInternalTimeClass] = useState('blitz');
  const initialPickDoneRef = useRef(false);
  const isControlled = controlledTimeClass != null;
  const activeTimeClass = isControlled ? controlledTimeClass : internalTimeClass;

  const setActiveTimeClass = (key) => {
    if (onActiveTimeClassChange) onActiveTimeClassChange(key);
    if (!isControlled) setInternalTimeClass(key);
  };

  useEffect(() => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setGames([]);
      setLoading(false);
      return;
    }

    initialPickDoneRef.current = false;
    if (!isControlled) setInternalTimeClass('blitz');

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChessComRatingHistoryFromDb(safeUsername, { months: MONTHS_WINDOW })
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
  }, [username, isControlled]);

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

  const chartHeight = compact ? 180 : 220;

  return (
    <div className={`chess-rating-chart${compact ? ' chess-rating-chart--compact' : ''}`}>
      <div className="chess-rating-chart-header">
        <div>
          <h3 className="chess-rating-chart-title">
            {activeConfig.label} · last {MONTHS_WINDOW} months
          </h3>
          <p className="chess-rating-chart-subtitle">
            {hideTabs
              ? 'Rated games only · click a rating box above to switch'
              : `Last ${MONTHS_WINDOW} months · rated games only`}
          </p>
        </div>
        {!hideTabs && (
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
      </div>

      <div className="chess-rating-chart-body">
        {loading ? (
          <div className="chess-rating-chart-empty">Loading rating history…</div>
        ) : error ? (
          <div className="chess-rating-chart-empty chess-rating-chart-empty--error">{error}</div>
        ) : chartData.length === 0 ? (
          <div className="chess-rating-chart-empty">
            No rated {activeConfig.label.toLowerCase()} games in the last {MONTHS_WINDOW} months.
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
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" vertical={false} />
                <XAxis
                  dataKey="game"
                  type="number"
                  domain={[1, chartData.length]}
                  ticks={xTicks}
                  tick={{ fill: '#a8a6a3', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#3a3835' }}
                  label={{
                    value: 'Game #',
                    position: 'insideBottom',
                    offset: -2,
                    fill: '#7a7875',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: '#a8a6a3', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#3a3835' }}
                  width={44}
                />
                <Tooltip content={<RatingTooltip />} cursor={{ stroke: '#3a3835' }} />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke={activeConfig.color}
                  strokeWidth={2.5}
                  dot={chartData.length <= 40 ? { r: 3, fill: activeConfig.color } : false}
                  activeDot={{ r: 5, fill: activeConfig.color, stroke: '#f3f2f1', strokeWidth: 2 }}
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
