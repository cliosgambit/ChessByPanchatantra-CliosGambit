import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchChessComPlayerGamesByDayFromDb } from '../../services/chessComDbService';

const RESULT_COLORS = {
  win: '#81b64c',
  loss: '#c95541',
  draw: '#8b8986',
  neutral: '#6b9b4d',
};

function resultLabel(resultType) {
  if (resultType === 'win') return 'Win';
  if (resultType === 'loss') return 'Loss';
  if (resultType === 'draw') return 'Draw';
  return '—';
}

function YesterdayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="chess-rating-chart-tooltip">
      <div className="chess-rating-chart-tooltip-title">Game {point.game}</div>
      {point.rating != null && (
        <div className="chess-rating-chart-tooltip-row">
          <span>Rating</span>
          <strong>{point.rating}</strong>
        </div>
      )}
      {point.opponent && (
        <div className="chess-rating-chart-tooltip-row">
          <span>Opponent</span>
          <strong>{point.opponent}</strong>
        </div>
      )}
      <div className="chess-rating-chart-tooltip-row">
        <span>Result</span>
        <strong>{point.result}</strong>
      </div>
      {point.timeClass && (
        <div className="chess-rating-chart-tooltip-row">
          <span>Type</span>
          <strong>{point.timeClass}</strong>
        </div>
      )}
      {point.playedAtLabel && (
        <div className="chess-rating-chart-tooltip-row">
          <span>Time</span>
          <strong>{point.playedAtLabel}</strong>
        </div>
      )}
    </div>
  );
}

function ResultDot({ cx, cy, payload }) {
  if (cx == null || cy == null || !payload) return null;
  const color = RESULT_COLORS[payload.resultType] || RESULT_COLORS.neutral;

  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#f3f2f1" strokeWidth={1.5} />;
}

function YesterdayGamesChart({ username }) {
  const [games, setGames] = useState([]);
  const [dayLabel, setDayLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setGames([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChessComPlayerGamesByDayFromDb(safeUsername, { day: 'yesterday' })
      .then((data) => {
        if (cancelled) return;
        setGames(data.games || []);
        setDayLabel(data.label || 'Yesterday');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load yesterday games.');
        setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const summary = useMemo(() => {
    const counts = { win: 0, loss: 0, draw: 0 };
    games.forEach((game) => {
      if (game.resultType === 'win') counts.win += 1;
      else if (game.resultType === 'loss') counts.loss += 1;
      else if (game.resultType === 'draw') counts.draw += 1;
    });
    return counts;
  }, [games]);

  const chartData = useMemo(
    () =>
      games
        .filter((game) => game.selfRating != null)
        .map((game, index) => ({
          game: index + 1,
          rating: game.selfRating,
          resultType: game.resultType,
          result: resultLabel(game.resultType),
          opponent: game.opponent,
          timeClass: game.timeClass,
          playedAtLabel: game.playedAtLabel,
        })),
    [games]
  );

  const resultsBarData = useMemo(
    () => [
      { name: 'Wins', key: 'win', value: summary.win, fill: RESULT_COLORS.win },
      { name: 'Draws', key: 'draw', value: summary.draw, fill: RESULT_COLORS.draw },
      { name: 'Losses', key: 'loss', value: summary.loss, fill: RESULT_COLORS.loss },
    ],
    [summary]
  );

  const yDomain = useMemo(() => {
    if (!chartData.length) return [800, 2200];
    const ratings = chartData.map((point) => point.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const padding = Math.max(20, Math.round((max - min) * 0.12) || 40);
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  const ratingChange =
    chartData.length > 1 ? chartData[chartData.length - 1].rating - chartData[0].rating : 0;

  return (
    <div className="chess-rating-chart chess-yesterday-games-chart">
      <div className="chess-rating-chart-header">
        <div>
          <h3 className="chess-rating-chart-title">Yesterday&apos;s Games</h3>
          <p className="chess-rating-chart-subtitle">{dayLabel || 'Yesterday'}</p>
        </div>
      </div>

      <div className="chess-rating-chart-body">
        {loading ? (
          <div className="chess-rating-chart-empty">Loading yesterday&apos;s games…</div>
        ) : error ? (
          <div className="chess-rating-chart-empty chess-rating-chart-empty--error">{error}</div>
        ) : !games.length ? (
          <div className="chess-rating-chart-empty">No games played yesterday.</div>
        ) : (
          <>
            <div className="chess-rating-chart-meta">
              <span>
                <strong>{games.length}</strong> games
              </span>
              <span>
                <strong className="chess-yesterday-result-win">{summary.win}</strong> W
              </span>
              <span>
                <strong className="chess-yesterday-result-draw">{summary.draw}</strong> D
              </span>
              <span>
                <strong className="chess-yesterday-result-loss">{summary.loss}</strong> L
              </span>
              {chartData.length > 1 && (
                <span>
                  Rating{' '}
                  <strong
                    className={
                      ratingChange >= 0 ? 'chess-rating-chart-delta-up' : 'chess-rating-chart-delta-down'
                    }
                  >
                    {ratingChange >= 0 ? '+' : ''}
                    {ratingChange}
                  </strong>
                </span>
              )}
            </div>

            {chartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" vertical={false} />
                    <XAxis
                      dataKey="game"
                      type="number"
                      domain={[1, chartData.length]}
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
                    <Tooltip content={<YesterdayTooltip />} cursor={{ stroke: '#3a3835' }} />
                    <Line
                      type="monotone"
                      dataKey="rating"
                      stroke="#6b9b4d"
                      strokeWidth={2.5}
                      dot={<ResultDot />}
                      activeDot={{ r: 6, stroke: '#f3f2f1', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="chess-yesterday-chart-legend">
                  <span>
                    <i className="chess-yesterday-legend-dot chess-yesterday-legend-dot--win" />
                    Win
                  </span>
                  <span>
                    <i className="chess-yesterday-legend-dot chess-yesterday-legend-dot--draw" />
                    Draw
                  </span>
                  <span>
                    <i className="chess-yesterday-legend-dot chess-yesterday-legend-dot--loss" />
                    Loss
                  </span>
                </div>
              </>
            ) : (
              <div className="chess-yesterday-results-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={resultsBarData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#a8a6a3', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#3a3835' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#a8a6a3', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#3a3835' }}
                      width={32}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0]?.payload;
                        return (
                          <div className="chess-rating-chart-tooltip">
                            <div className="chess-rating-chart-tooltip-title">{item?.name}</div>
                            <div className="chess-rating-chart-tooltip-row">
                              <span>Games</span>
                              <strong>{item?.value ?? 0}</strong>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={72}>
                      {resultsBarData.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default YesterdayGamesChart;
