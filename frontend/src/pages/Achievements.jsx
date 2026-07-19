import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { FiActivity, FiZap } from 'react-icons/fi';
import { GiBroadsword, GiSparkles } from 'react-icons/gi';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import { getStreakBadgeForLength } from '../components/userProfile/WinStreakBadges';
import { fetchAchievementsFeedFromDb } from '../services/chessComDbService';
import { openChessComGame } from '../utils/chessComGameNavigation';
import {
  buildFilterLabels,
  DAY_FILTER_OPTIONS,
  dayFilterButtonLabel,
  filterLabelForKey,
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './Achievements.css';

const ACHIEVEMENT_FILTER_OPTIONS = DAY_FILTER_OPTIONS.map((filter) => ({
  ...filter,
  labelPrefix:
    filter.key === 'today'
      ? 'Today'
      : filter.key === 'yesterday'
        ? 'Yesterday'
        : filter.key === 'day_before'
          ? 'Day Before'
          : 'All',
}));

function displayName(row) {
  return row?.playerName || row?.playerUsername || row?.chessComId || 'Student';
}

function opponentLabel(row) {
  if (row?.type === 'win_streak' || row?.type === 'pioneer_win') {
    if (row.opponentUsername) return row.opponentUsername;
  }
  const username = (row?.playerUsername || row?.chessComId || '').toLowerCase();
  if (!username) return null;
  if ((row?.whiteUsername || '').toLowerCase() === username) {
    return row?.blackName || row?.blackUsername || null;
  }
  if ((row?.blackUsername || '').toLowerCase() === username) {
    return row?.whiteName || row?.whiteUsername || null;
  }
  return null;
}

function formatPlayedTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function dayKeyFromPlayedAt(iso) {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function achievementHeadline(row) {
  if (row?.type === 'win_streak') {
    return `${row.badgeName || 'Win Streak'} · ${
      row.streakLabel || `${row.streakLength} wins in a row`
    }`;
  }
  if (row?.type === 'pioneer_win') {
    const piece = row.pieceLostLabel || 'Piece';
    const move =
      row.lossMoveNumber != null ? ` · m${row.lossMoveNumber}` : '';
    const san = row.lossSan ? ` · ${row.lossSan}` : '';
    return `Pioneer win · ${piece}${move}${san}`;
  }
  const score =
    row?.brillianceScore != null ? ` · ${Number(row.brillianceScore).toFixed(1)}` : '';
  return `Brilliant move ${row?.sanMove || '—'}${score}`;
}

/** Theme key matching the right-side badge (purple, teal, …). */
function achievementThemeKey(row) {
  if (row?.type === 'win_streak') {
    return getStreakBadgeForLength(row.streakLength).theme || 'bronze';
  }
  if (row?.type === 'pioneer_win') {
    return 'bronze';
  }
  return 'teal';
}

function achievementLineIcon(row) {
  if (row?.type === 'win_streak') return FiActivity;
  if (row?.type === 'pioneer_win') return GiBroadsword;
  return FiZap;
}

function groupTone(achievements) {
  const brilliantCount = achievements.filter((a) => a.type === 'brilliant').length;
  const streakCount = achievements.filter((a) => a.type === 'win_streak').length;
  const pioneerCount = achievements.filter((a) => a.type === 'pioneer_win').length;
  const kinds = [brilliantCount > 0, streakCount > 0, pioneerCount > 0].filter(Boolean).length;
  if (kinds > 1) return 'mixed';
  if (brilliantCount) return 'brilliant';
  if (pioneerCount) return 'pioneer';
  return 'win_streak';
}

function achievementMetaParts(row) {
  const parts = [];
  const opponent = opponentLabel(row);
  if (opponent) parts.push(`vs ${opponent}`);
  if (row.timeClass) parts.push(row.timeClass);
  if (row.timeControl && row.timeControl !== '—') parts.push(row.timeControl);
  const time = formatPlayedTime(row.playedAt);
  if (time) parts.push(time);
  if (row.playedDate && row.playedDate !== '—') parts.push(row.playedDate);
  return parts;
}

/** One box per student per calendar day — keeps every achievement, no duplicates across cards. */
function groupAchievementsByStudentDay(rows, dayFilter) {
  const map = new Map();

  for (const row of rows || []) {
    const username = (row.playerUsername || row.chessComId || '').toLowerCase();
    if (!username) continue;
    const dayKey = dayFilter === 'all' ? dayKeyFromPlayedAt(row.playedAt) : dayFilter;
    const key = `${username}::${dayKey}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        username,
        dayKey,
        playerName: displayName(row),
        avatarUrl: row.avatarUrl || null,
        achievements: [],
        latestPlayedAt: row.playedAt || null,
      });
    }

    const group = map.get(key);
    group.achievements.push(row);
    if (!group.avatarUrl && row.avatarUrl) group.avatarUrl = row.avatarUrl;
    if (row.playerName) group.playerName = displayName(row);

    const rowTime = row.playedAt ? new Date(row.playedAt).getTime() : 0;
    const latestTime = group.latestPlayedAt ? new Date(group.latestPlayedAt).getTime() : 0;
    if (rowTime > latestTime) group.latestPlayedAt = row.playedAt;
  }

  const groups = Array.from(map.values());
  for (const group of groups) {
    group.achievements.sort((a, b) => {
      const aTime = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const bTime = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return bTime - aTime;
    });
    group.brilliantCount = group.achievements.filter((a) => a.type === 'brilliant').length;
    group.streakCount = group.achievements.filter((a) => a.type === 'win_streak').length;
    group.pioneerCount = group.achievements.filter((a) => a.type === 'pioneer_win').length;
    group.tone = groupTone(group.achievements);
  }

  groups.sort((a, b) => {
    const aTime = a.latestPlayedAt ? new Date(a.latestPlayedAt).getTime() : 0;
    const bTime = b.latestPlayedAt ? new Date(b.latestPlayedAt).getTime() : 0;
    return bTime - aTime;
  });

  return groups;
}

function AchievementAvatar({ name, avatarUrl, tone }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`achievements-avatar achievements-avatar--${tone || 'mixed'}`}
      aria-hidden="true"
    >
      {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : <span>{initial}</span>}
    </div>
  );
}

function AchievementSideBadge({ row, onActivate }) {
  const clickable = Boolean(onActivate);

  if (row?.type === 'win_streak') {
    const badge = getStreakBadgeForLength(row.streakLength);
    const BadgeIcon = badge.Icon;
    const className = `chess-ach-milestone chess-ach-milestone--${badge.theme} is-unlocked achievements-side-badge${
      clickable ? ' achievements-side-badge--clickable' : ''
    }`;
    const title = `${badge.name} · ${badge.length} wins in a row`;
    const inner = (
      <>
        <div className="chess-ach-milestone-aura" />
        <div className="chess-ach-milestone-icon">
          <BadgeIcon />
        </div>
        <div className="chess-ach-milestone-plaque">
          <div className="chess-ach-milestone-name">{badge.name}</div>
          <div className="chess-ach-milestone-label">
            <span className="chess-ach-milestone-num">{badge.length}</span>
            <span className="chess-ach-milestone-unit">straight wins</span>
          </div>
        </div>
      </>
    );

    if (clickable) {
      return (
        <button type="button" className={className} title={title} onClick={onActivate}>
          {inner}
        </button>
      );
    }
    return (
      <div className={className} aria-hidden="true" title={title}>
        {inner}
      </div>
    );
  }

  if (row?.type === 'pioneer_win') {
    const piece = row.pieceLostLabel || 'Piece';
    const moveLabel =
      row.lossMoveNumber != null ? `move ${row.lossMoveNumber}` : 'early giveaway';
    const className = `chess-ach-milestone chess-ach-milestone--bronze is-unlocked achievements-side-badge achievements-side-badge--pioneer${
      clickable ? ' achievements-side-badge--clickable' : ''
    }`;
    const title = row.lossSan
      ? `Pioneer Win · ${piece} · ${row.lossSan}`
      : `Pioneer Win · ${piece}`;
    const inner = (
      <>
        <div className="chess-ach-milestone-aura" />
        <div className="chess-ach-milestone-icon">
          <GiBroadsword />
        </div>
        <div className="chess-ach-milestone-plaque">
          <div className="chess-ach-milestone-name">Pioneer Win</div>
          <div className="chess-ach-milestone-label">
            <span className="chess-ach-milestone-num achievements-side-badge-san">
              {row.lossSan || piece}
            </span>
            <span className="chess-ach-milestone-unit">{moveLabel}</span>
          </div>
        </div>
      </>
    );

    if (clickable) {
      return (
        <button type="button" className={className} title={title} onClick={onActivate}>
          {inner}
        </button>
      );
    }
    return (
      <div className={className} aria-hidden="true" title={title}>
        {inner}
      </div>
    );
  }

  const score =
    row?.brillianceScore != null ? Number(row.brillianceScore).toFixed(1) : null;
  const className = `chess-ach-milestone chess-ach-milestone--teal is-unlocked achievements-side-badge achievements-side-badge--brilliant${
    clickable ? ' achievements-side-badge--clickable' : ''
  }`;
  const title = row?.sanMove ? `Brilliant · ${row.sanMove}` : 'Brilliant Move';
  const inner = (
    <>
      <div className="chess-ach-milestone-aura" />
      <div className="chess-ach-milestone-icon">
        <GiSparkles />
      </div>
      <div className="chess-ach-milestone-plaque">
        <div className="chess-ach-milestone-name">Brilliant Mind</div>
        <div className="chess-ach-milestone-label">
          <span className="chess-ach-milestone-num achievements-side-badge-san">
            {row?.sanMove || '★'}
          </span>
          <span className="chess-ach-milestone-unit">
            {score != null ? `score ${score}` : 'brilliant move'}
          </span>
        </div>
      </div>
    </>
  );

  if (clickable) {
    return (
      <button type="button" className={className} title={title} onClick={onActivate}>
        {inner}
      </button>
    );
  }
  return (
    <div className={className} aria-hidden="true" title={title}>
      {inner}
    </div>
  );
}

function Achievements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = resolveDayFilter(searchParams);
  const filterLabels = useMemo(() => buildFilterLabels(), []);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({
    brilliantCount: 0,
    streakCount: 0,
    pioneerCount: 0,
    studentsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const groups = useMemo(
    () => groupAchievementsByStudentDay(rows, activeFilter),
    [rows, activeFilter]
  );

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const panelTitle = useMemo(() => {
    const match =
      ACHIEVEMENT_FILTER_OPTIONS.find((filter) => filter.key === activeFilter) ||
      ACHIEVEMENT_FILTER_OPTIONS[0];
    return `${dayFilterButtonLabel(match, filterLabels)} achievements`;
  }, [activeFilter, filterLabels]);

  const setActiveFilter = useCallback(
    (day) => {
      if (!VALID_DAY_FILTER_KEYS.has(day) || day === activeFilterRef.current) return;
      setSearchParams(day === 'today' ? {} : { day }, { replace: true });
    },
    [setSearchParams]
  );

  const openAchievement = useCallback(
    (row, username) => {
      if (row?.type === 'brilliant' && row.moveId != null) {
        navigate(`/brilliant-moves/${row.moveId}`);
        return;
      }
      if (row?.type === 'pioneer_win' && username && row.uuid) {
        openChessComGame(navigate, username, { uuid: row.uuid, chessComUuid: row.uuid }, {
          viewOnly: true,
          focusPly: row.lossPly,
          focusSan: row.lossSan || row.lossUci || null,
          focusPiece: row.pieceLostLabel || row.pieceLost || null,
          focusMoveNumber: row.lossMoveNumber ?? null,
        });
        return;
      }
      if (username) {
        navigate(`/players/${encodeURIComponent(username)}`);
      }
    },
    [navigate]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAchievementsFeedFromDb({ day: activeFilter });
        if (cancelled) return;
        setRows(data.rows || []);
        setMeta({
          brilliantCount: data.brilliantCount ?? 0,
          streakCount: data.streakCount ?? 0,
          pioneerCount: data.pioneerCount ?? 0,
          studentsCount: data.studentsCount ?? 0,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load achievements.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeFilter]);

  return (
    <Box className="chess-profile-page achievements-page">
      <div className="achievements-shell">
        <header className="achievements-header">
          <h1 className="achievements-title">Achievements</h1>

          <div className="achievements-metrics" aria-label="Achievement summary">
            <div className="achievements-metric">
              <span className="achievements-metric-value">
                {loading ? '…' : rows.length}
              </span>
              <span className="achievements-metric-label">Total</span>
            </div>
            <div className="achievements-metric achievements-metric--brilliant">
              <span className="achievements-metric-value">
                <FiZap aria-hidden="true" />
                {loading ? '…' : meta.brilliantCount}
              </span>
              <span className="achievements-metric-label">Brilliant</span>
            </div>
            <div className="achievements-metric achievements-metric--pioneer">
              <span className="achievements-metric-value">
                <GiBroadsword aria-hidden="true" />
                {loading ? '…' : meta.pioneerCount}
              </span>
              <span className="achievements-metric-label">Pioneer</span>
            </div>
            <div className="achievements-metric achievements-metric--streak">
              <span className="achievements-metric-value">
                <FiActivity aria-hidden="true" />
                {loading ? '…' : meta.streakCount}
              </span>
              <span className="achievements-metric-label">Win streaks</span>
            </div>
            <div className="achievements-metric">
              <span className="achievements-metric-value">
                {loading ? '…' : groups.length}
              </span>
              <span className="achievements-metric-label">Students</span>
            </div>
          </div>

          <div className="achievements-filters" role="tablist" aria-label="Achievement day filters">
            {ACHIEVEMENT_FILTER_OPTIONS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.key}
                className={`achievements-filter${
                  activeFilter === filter.key ? ' achievements-filter--active' : ''
                }`}
                onClick={() => setActiveFilter(filter.key)}
              >
                {dayFilterButtonLabel(filter, filterLabels)}
              </button>
            ))}
          </div>
        </header>

        <section className="achievements-board" aria-label={panelTitle}>
          <div className="achievements-board-head">
            <h2>{panelTitle}</h2>
            <span>
              {loading
                ? '…'
                : `${rows.length} earned · ${groups.length} student${groups.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="achievements-board-body">
            {loading ? (
              <LoadingPanel message="Loading achievements…" />
            ) : error ? (
              <ErrorPanel title="Unable to load achievements" message={error} />
            ) : groups.length === 0 ? (
              <EmptyState
                title="No achievements for this filter."
                subtitle={`No brilliant moves, pioneer wins, or win streaks found for ${dateLabel}.`}
              />
            ) : (
              <ul className="achievements-grid">
                {groups.map((group, index) => {
                  const { username, playerName, avatarUrl, achievements, tone } = group;

                  return (
                    <li
                      key={group.key}
                      className={`achievements-item achievements-item--${tone}`}
                      style={{ '--ach-delay': `${Math.min(index, 16) * 28}ms` }}
                    >
                      <div className="achievements-item-main">
                        <AchievementAvatar
                          name={playerName}
                          avatarUrl={avatarUrl}
                          tone={tone}
                        />

                        <div className="achievements-item-copy">
                          <div className="achievements-item-who">
                            <span className="achievements-item-name">{playerName}</span>
                            {username ? (
                              <span className="achievements-item-user">@{username}</span>
                            ) : null}
                          </div>

                          <p className="achievements-item-count">
                            {achievements.length} achievement
                            {achievements.length === 1 ? '' : 's'} earned
                          </p>

                          <ul className="achievements-item-list">
                            {achievements.map((row) => {
                              const metaParts = achievementMetaParts(row);
                              const theme = achievementThemeKey(row);
                              const LineIcon = achievementLineIcon(row);
                              return (
                                <li key={row.id} className="achievements-item-line">
                                  <button
                                    type="button"
                                    className={`achievements-item-line-btn achievements-item-line-btn--theme-${theme}`}
                                    onClick={() => openAchievement(row, username)}
                                  >
                                    <span className="achievements-item-line-title">
                                      <LineIcon aria-hidden="true" />
                                      {achievementHeadline(row)}
                                    </span>
                                    {metaParts.length ? (
                                      <span className="achievements-item-line-meta">
                                        {metaParts.join(' · ')}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>

                          {username ? (
                            <Link
                              to={`/players/${encodeURIComponent(username)}`}
                              className="achievements-item-link"
                            >
                              Profile
                            </Link>
                          ) : null}
                        </div>

                        <div
                          className="achievements-badge-rail"
                          aria-label={`${achievements.length} achievement badges`}
                        >
                          {achievements.map((row) => (
                            <AchievementSideBadge
                              key={row.id}
                              row={row}
                              onActivate={() => openAchievement(row, username)}
                            />
                          ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Box>
  );
}

export default Achievements;
