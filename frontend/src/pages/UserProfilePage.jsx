import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Link } from '@chakra-ui/react';
import {
  FiAward,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiActivity,
  FiGrid,
  FiLayers,
  FiMapPin,
  FiMinus,
  FiRefreshCw,
  FiStar,
  FiTarget,
  FiTrendingUp,
  FiTwitch,
  FiUsers,
  FiVideo,
  FiX,
  FiZap,
} from 'react-icons/fi';
import ErrorPanel from '../components/common/ErrorPanel';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { useChessComUserData } from '../hooks/useChessComUserData';
import { openChessComGame } from '../utils/chessComGameNavigation';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import PlayerWinStreakReport from '../components/userProfile/PlayerWinStreakReport';
import YesterdayGamesChart from '../components/userProfile/YesterdayGamesChart';
import YesterdayGamesList from '../components/userProfile/YesterdayGamesList';
import RatingProgressChart, {
  RANGE_FILTERS,
  computeSinceDate,
} from '../components/userProfile/RatingProgressChart';
import {
  fetchChessComAchievements,
  fetchChessComGameStatsForRange,
  fetchChessComGamesForRange,
  fetchChessComRatingImprovementFromDb,
} from '../services/chessComDbService';
import { fetchStudents } from '../services/studentService';
import '../components/userProfile/ChessComProfilePage.css';

const MAIN_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'games', label: 'Games' },
  { id: 'stats', label: 'Stats' },
  { id: 'archives', label: 'Archives' },
  { id: 'report', label: 'Report' },
];

const QUICK_STAT_ITEMS = [
  {
    key: 'wins',
    label: 'Wins',
    icon: FiCheck,
    variant: 'wins',
    getValue: (stats) => stats.totals.wins,
  },
  {
    key: 'losses',
    label: 'Losses',
    icon: FiX,
    variant: 'losses',
    getValue: (stats) => stats.totals.losses,
  },
  {
    key: 'draws',
    label: 'Draws',
    icon: FiMinus,
    variant: 'draws',
    getValue: (stats) => stats.totals.draws,
  },
  {
    key: 'winPct',
    label: 'Win Rate',
    icon: FiTrendingUp,
    variant: 'winrate',
    getValue: (stats) => `${stats.winPercentage}%`,
  },
];

const STAT_OVERVIEW_ITEMS = [
  ...QUICK_STAT_ITEMS,
  {
    key: 'totalGames',
    label: 'Total Games',
    icon: FiGrid,
    variant: 'games',
    getValue: (stats) => stats.totalGames,
  },
  {
    key: 'puzzleRush',
    label: 'Puzzle Rush',
    icon: FiZap,
    variant: 'puzzle',
    getValue: (stats) => stats.puzzleRush,
  },
  {
    key: 'puzzleScore',
    label: 'Puzzle Score',
    icon: FiTarget,
    variant: 'puzzle-score',
    getValue: (stats) => stats.puzzleScore,
  },
  {
    key: 'bestRapid',
    label: 'Best Rapid',
    icon: FiTrendingUp,
    variant: 'rapid',
    getValue: (stats) => stats.achievements.highestRapid,
  },
  {
    key: 'bestBlitz',
    label: 'Best Blitz',
    icon: FiClock,
    variant: 'blitz',
    getValue: (stats) => stats.achievements.highestBlitz,
  },
  {
    key: 'bestBullet',
    label: 'Best Bullet',
    icon: FiZap,
    variant: 'bullet',
    getValue: (stats) => stats.achievements.highestBullet,
  },
];

const CHESS_COM_TIME_ICONS = {
  bullet: '/chess-icons/bullet.svg',
  blitz: '/chess-icons/blitz.svg',
  rapid: '/chess-icons/rapid.svg',
  daily: '/chess-icons/daily.svg',
};

const RATING_CARDS = [
  { key: 'bullet', label: 'Bullet', iconUrl: CHESS_COM_TIME_ICONS.bullet, className: 'chess-rating-card-bullet' },
  { key: 'blitz', label: 'Blitz', iconUrl: CHESS_COM_TIME_ICONS.blitz, className: 'chess-rating-card-blitz' },
  { key: 'rapid', label: 'Rapid', iconUrl: CHESS_COM_TIME_ICONS.rapid, className: 'chess-rating-card-rapid' },
  { key: 'daily', label: 'Daily', iconUrl: CHESS_COM_TIME_ICONS.daily, className: 'chess-rating-card-daily' },
];

function resultClassName(resultType) {
  if (resultType === 'win') return 'chess-result-win';
  if (resultType === 'loss') return 'chess-result-loss';
  if (resultType === 'draw') return 'chess-result-draw';
  return 'chess-result-neutral';
}

function formatNumber(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString();
}

function formatBasicDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toIsoDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function preciseWinRate(totals) {
  const wins = Number(totals?.wins) || 0;
  const losses = Number(totals?.losses) || 0;
  const draws = Number(totals?.draws) || 0;
  const total = wins + losses + draws;
  if (!total) return '0';
  const pct = (wins / total) * 100;
  return (Math.round(pct * 10) / 10).toString();
}

function formatRatingDelta(current, baseline) {
  if (current == null || baseline == null) return null;
  const delta = Number(current) - Number(baseline);
  if (!Number.isFinite(delta)) return null;
  if (delta === 0) return { text: '0', tone: 'neutral' };
  if (delta > 0) return { text: `+${delta}`, tone: 'up' };
  return { text: String(delta), tone: 'down' };
}

function DetailItem({ label, value, children }) {
  return (
    <div className="chess-basic-detail-item">
      <span className="chess-basic-detail-label">{label}</span>
      <span className="chess-basic-detail-value">{children || value || '—'}</span>
    </div>
  );
}

function RatingCard({ label, iconUrl, className, current, best, selected = false, onSelect }) {
  const hasRating = current != null;

  return (
    <button
      type="button"
      className={`chess-rating-card ${className}${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={`Show ${label} rating graph (last 3 months)`}
    >
      <div className="chess-rating-card-body">
        <div className="chess-rating-card-text">
          <div className="chess-rating-card-label">{label}</div>
          <div className={`chess-rating-card-value ${hasRating ? '' : 'is-empty'}`}>
            {current ?? '—'}
          </div>
          {best != null && <div className="chess-rating-card-best">Best {best}</div>}
        </div>
        <div className="chess-rating-card-icon-wrap">
          <img src={iconUrl} alt="" className="chess-rating-card-icon-img" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

function StatTile({ label, value, icon: Icon, variant = 'default', large = false }) {
  return (
    <div className={`chess-stat-tile chess-stat-tile--${variant} ${large ? 'chess-stat-tile--large' : ''}`}>
      {Icon && (
        <div className="chess-stat-tile-icon-wrap">
          <Icon className="chess-stat-tile-icon" aria-hidden="true" />
        </div>
      )}
      <div className="chess-stat-tile-label">{label}</div>
      <div className="chess-stat-tile-value">{value ?? '—'}</div>
    </div>
  );
}

function GameResultsBar({ stats }) {
  const wins = stats?.totals?.wins ?? 0;
  const losses = stats?.totals?.losses ?? 0;
  const draws = stats?.totals?.draws ?? 0;
  const total = wins + losses + draws;
  const winPct = total ? Math.round((wins / total) * 100) : 0;
  const lossPct = total ? Math.round((losses / total) * 100) : 0;
  const drawPct = total ? Math.max(0, 100 - winPct - lossPct) : 0;

  return (
    <div className="chess-results-bar-chart">
      <div className="chess-results-bar-top">
        <span className="chess-results-bar-title">Game Results</span>
      </div>

      <div
        className="chess-results-bar-track"
        role="img"
        aria-label={`Wins ${wins}, Draws ${draws}, Losses ${losses}`}
      >
        {total > 0 ? (
          <>
            <div
              className="chess-results-bar-segment chess-results-bar-segment--wins"
              style={{ width: `${winPct}%` }}
              title={`Wins: ${wins} (${winPct}%)`}
            />
            <div
              className="chess-results-bar-segment chess-results-bar-segment--draws"
              style={{ width: `${drawPct}%` }}
              title={`Draws: ${draws} (${drawPct}%)`}
            />
            <div
              className="chess-results-bar-segment chess-results-bar-segment--losses"
              style={{ width: `${lossPct}%` }}
              title={`Losses: ${losses} (${lossPct}%)`}
            />
          </>
        ) : (
          <div className="chess-results-bar-segment chess-results-bar-segment--empty" />
        )}
      </div>

      <div className="chess-results-bar-legend">
        <div className="chess-results-bar-legend-item chess-results-bar-legend-item--wins">
          <FiCheck className="chess-icon chess-icon-sm" aria-hidden="true" />
          <span>Wins</span>
          <strong>{wins}</strong>
        </div>
        <div className="chess-results-bar-legend-item chess-results-bar-legend-item--draws">
          <FiMinus className="chess-icon chess-icon-sm" aria-hidden="true" />
          <span>Draws</span>
          <strong>{draws}</strong>
        </div>
        <div className="chess-results-bar-legend-item chess-results-bar-legend-item--losses">
          <FiX className="chess-icon chess-icon-sm" aria-hidden="true" />
          <span>Losses</span>
          <strong>{losses}</strong>
        </div>
      </div>
    </div>
  );
}

function StatTileGrid({ items, stats, large = false, className = '' }) {
  return (
    <div className={`chess-stats-grid ${className}`.trim()}>
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <StatTile
            key={item.key}
            label={item.label}
            value={item.getValue(stats)}
            icon={ItemIcon}
            variant={item.variant}
            large={large}
          />
        );
      })}
    </div>
  );
}

function SidebarWidgets({ profile, stats, clubs, totalGames }) {
  const awardTotal =
    (stats?.totals?.wins ?? 0) + (stats?.puzzleRush ?? 0) + (stats?.puzzleScore ?? 0);

  return (
    <>
      <div className="chess-sidebar-widget">
        <h3>
          <FiTrendingUp className="chess-icon chess-icon-md" aria-hidden="true" />
          Activity Streak
        </h3>
        <p>Keep playing to build your streak on Chess.com.</p>
      </div>

      {profile?.statusLabel && (
        <div className="chess-sidebar-widget">
          <h3>
            <FiStar className="chess-icon chess-icon-md" aria-hidden="true" />
            Membership
          </h3>
          <p>
            {profile.statusLabel}
            {profile.joinedDate ? ` since ${profile.joinedDate}` : ''}
          </p>
        </div>
      )}

      {profile?.league && (
        <div className="chess-sidebar-widget">
          <h3>
            <FiAward className="chess-icon chess-icon-md" aria-hidden="true" />
            {profile.league} League
          </h3>
          <p>
            {profile.username} competes in the {profile.league} league on Chess.com.
          </p>
        </div>
      )}

      <div className="chess-sidebar-widget">
        <h3>
          <FiLayers className="chess-icon chess-icon-md" aria-hidden="true" />
          Game History
        </h3>
        <p>{formatNumber(totalGames)} games tracked across archives.</p>
      </div>

      {clubs.length > 0 && (
        <div className="chess-profile-panel">
          <div className="chess-profile-panel-header">
            Clubs <span>{clubs.length}</span>
          </div>
          <div className="chess-profile-panel-body">
            {clubs.slice(0, 5).map((club) => (
              <a
                key={club.url}
                href={club.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chess-club-item"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {club.icon ? (
                  <img src={club.icon} alt="" className="chess-club-icon" />
                ) : (
                  <div className="chess-club-icon chess-club-icon-fallback">
                    <FiUsers className="chess-icon chess-icon-sm" aria-hidden="true" />
                  </div>
                )}
                <div className="chess-club-name">{club.name}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="chess-sidebar-widget">
        <h3>
          <FiAward className="chess-icon chess-icon-md" aria-hidden="true" />
          Awards
        </h3>
        <p>{formatNumber(awardTotal)} combined wins and puzzle achievements.</p>
      </div>
    </>
  );
}

function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const chessUsername = decodeURIComponent(userId || '');
  const backPath = location.state?.from || '/students';
  const fromStudents = backPath === '/students' || String(backPath).startsWith('/students');
  const initialTab = location.state?.tab || 'report';
  const profileView = location.pathname.includes('/legacy') ? 'legacy' : 'rebuild';
  const { profile, stats, archives, monthlyGames, recentGames, totalGames, clubs, profileLoading, gamesLoading, syncing, monthlyLoading, backgroundSync, pending, error, refetch, syncFromChessCom, loadMonthlyGames, lastSyncedAt } =
    useChessComUserData(chessUsername);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeRatingClass, setActiveRatingClass] = useState('blitz');
  const [studentRecord, setStudentRecord] = useState(null);
  const [studentRecordLoading, setStudentRecordLoading] = useState(true);
  const [ratingImprovement, setRatingImprovement] = useState(null);
  const [ratingImprovementLoading, setRatingImprovementLoading] = useState(false);
  const [statsRange, setStatsRange] = useState('joining');
  const [rangeStats, setRangeStats] = useState(null);
  const [rangeStatsLoading, setRangeStatsLoading] = useState(false);
  const [rangeGames, setRangeGames] = useState([]);
  const [rangeGamesTotal, setRangeGamesTotal] = useState(0);
  const [rangeGamesLoading, setRangeGamesLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [rebuildTab, setRebuildTab] = useState('history');
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const ratingPickDoneRef = React.useRef(false);
  const HISTORY_PAGE_SIZE = 25;
  const effectiveJoiningDate =
    toIsoDateOnly(studentRecord?.joining_date) ||
    toIsoDateOnly(profile?.joinedAt) ||
    toIsoDateOnly(profile?.joinedDate);

  useEffect(() => {
    ratingPickDoneRef.current = false;
    setActiveRatingClass('blitz');
  }, [chessUsername]);

  useEffect(() => {
    if (!stats || ratingPickDoneRef.current) return;
    const preferred =
      RATING_CARDS.find((card) => stats[card.key]?.current != null) ||
      RATING_CARDS.find((card) => card.key === 'blitz');
    if (preferred) {
      setActiveRatingClass(preferred.key);
      ratingPickDoneRef.current = true;
    }
  }, [stats]);

  useEffect(() => {
    if (activeTab === 'games') {
      loadMonthlyGames();
    }
  }, [activeTab, loadMonthlyGames]);

  useEffect(() => {
    let cancelled = false;
    async function loadStudentRecord() {
      const safeUsername = String(chessUsername || '').trim();
      if (!safeUsername) {
        setStudentRecord(null);
        setStudentRecordLoading(false);
        return;
      }

      setStudentRecordLoading(true);
      try {
        const data = await fetchStudents({ q: safeUsername });
        const exact =
          (data.students || []).find(
            (s) => String(s.chess_com_id || '').toLowerCase() === safeUsername.toLowerCase()
          ) || null;
        if (!cancelled) setStudentRecord(exact);
      } catch {
        if (!cancelled) setStudentRecord(null);
      } finally {
        if (!cancelled) setStudentRecordLoading(false);
      }
    }

    loadStudentRecord();
    return () => {
      cancelled = true;
    };
  }, [chessUsername]);

  useEffect(() => {
    let cancelled = false;
    const safeUsername = String(chessUsername || '').trim();

    if (!safeUsername) {
      setRatingImprovement(null);
      setRatingImprovementLoading(false);
      return undefined;
    }

    if (statsRange === 'joining' && !effectiveJoiningDate) {
      setRatingImprovement(null);
      setRatingImprovementLoading(false);
      return undefined;
    }

    const since =
      statsRange === 'overall' ? null : computeSinceDate(statsRange, effectiveJoiningDate);

    setRatingImprovementLoading(true);
    fetchChessComRatingImprovementFromDb(safeUsername, {
      since: since || undefined,
      all: statsRange === 'overall' || !since,
    })
      .then((data) => {
        if (!cancelled) setRatingImprovement(data?.improvements || null);
      })
      .catch(() => {
        if (!cancelled) setRatingImprovement(null);
      })
      .finally(() => {
        if (!cancelled) setRatingImprovementLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chessUsername, statsRange, effectiveJoiningDate, lastSyncedAt]);

  useEffect(() => {
    if (!effectiveJoiningDate) {
      setStatsRange((prev) => (prev === 'joining' ? '1d' : prev));
    }
  }, [effectiveJoiningDate]);

  useEffect(() => {
    let cancelled = false;
    const safeUsername = String(chessUsername || '').trim();
    if (!safeUsername) {
      setRangeStats(null);
      setRangeStatsLoading(false);
      return undefined;
    }

    const since =
      statsRange === 'overall' ? null : computeSinceDate(statsRange, effectiveJoiningDate);
    if (statsRange === 'joining' && !effectiveJoiningDate) {
      setRangeStats(null);
      setRangeStatsLoading(false);
      return undefined;
    }

    setRangeStatsLoading(true);
    fetchChessComGameStatsForRange(safeUsername, {
      since: since || undefined,
      all: statsRange === 'overall' || !since,
    })
      .then((data) => {
        if (!cancelled) setRangeStats(data);
      })
      .catch(() => {
        if (!cancelled) setRangeStats(null);
      })
      .finally(() => {
        if (!cancelled) setRangeStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chessUsername, statsRange, effectiveJoiningDate, lastSyncedAt]);

  useEffect(() => {
    setHistoryPage(1);
  }, [chessUsername, statsRange, effectiveJoiningDate]);

  useEffect(() => {
    let cancelled = false;
    const safeUsername = String(chessUsername || '').trim();
    if (!safeUsername) {
      setRangeGames([]);
      setRangeGamesTotal(0);
      setRangeGamesLoading(false);
      return undefined;
    }

    const since =
      statsRange === 'overall' ? null : computeSinceDate(statsRange, effectiveJoiningDate);
    if (statsRange === 'joining' && !effectiveJoiningDate) {
      setRangeGames([]);
      setRangeGamesTotal(0);
      setRangeGamesLoading(false);
      return undefined;
    }

    setRangeGamesLoading(true);
    fetchChessComGamesForRange(safeUsername, {
      since: since || undefined,
      all: statsRange === 'overall' || !since,
      limit: HISTORY_PAGE_SIZE,
      offset: (historyPage - 1) * HISTORY_PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        setRangeGames(data.games || []);
        setRangeGamesTotal(data.total ?? (data.games || []).length);
      })
      .catch(() => {
        if (cancelled) return;
        setRangeGames([]);
        setRangeGamesTotal(0);
      })
      .finally(() => {
        if (!cancelled) setRangeGamesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chessUsername, statsRange, effectiveJoiningDate, lastSyncedAt, historyPage]);

  useEffect(() => {
    let cancelled = false;
    const safeUsername = String(chessUsername || '').trim();
    if (!safeUsername) {
      setAchievements(null);
      setAchievementsLoading(false);
      return undefined;
    }

    const since =
      statsRange === 'overall' ? null : computeSinceDate(statsRange, effectiveJoiningDate);
    if (statsRange === 'joining' && !effectiveJoiningDate) {
      setAchievements(null);
      setAchievementsLoading(false);
      return undefined;
    }

    setAchievementsLoading(true);
    fetchChessComAchievements(safeUsername, {
      since: since || undefined,
      all: statsRange === 'overall' || !since,
    })
      .then((data) => {
        if (!cancelled) setAchievements(data);
      })
      .catch(() => {
        if (!cancelled) setAchievements(null);
      })
      .finally(() => {
        if (!cancelled) setAchievementsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chessUsername, statsRange, effectiveJoiningDate, lastSyncedAt]);

  const handleGameSelect = (game) => {
    openChessComGame(navigate, chessUsername, game);
  };

  const flagUrl = profile?.countryCode
    ? `https://flagcdn.com/w40/${profile.countryCode.toLowerCase()}.png`
    : null;

  const visibleGames = useMemo(
    () => (activeTab === 'games' ? recentGames : recentGames.slice(0, 12)),
    [recentGames, activeTab]
  );

  const displayName = profile?.username || chessUsername;
  const pageTitle = studentRecord?.player_name || displayName || chessUsername || 'Profile';
  const profileBasePath = `/players/${encodeURIComponent(chessUsername)}`;
  const historyTotalPages = Math.max(1, Math.ceil(rangeGamesTotal / HISTORY_PAGE_SIZE));
  const historyFrom =
    rangeGamesTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyTo = Math.min(historyPage * HISTORY_PAGE_SIZE, rangeGamesTotal);

  const openProfileView = (view) => {
    navigate(`${profileBasePath}/${view === 'legacy' ? 'legacy' : 'new'}`, {
      replace: true,
      state: location.state,
    });
  };

  return (
    <Box
      className={`chess-profile-page${
        profileView === 'rebuild' ? ' chess-profile-page--blank' : ''
      }`}
    >
      <div className="chess-profile-view-switch">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', to: '/dashboard' },
            ...(fromStudents ? [{ label: 'Students', to: '/students' }] : []),
            { label: pageTitle },
          ]}
        />
        <div className="chess-profile-view-tabs" role="tablist" aria-label="Profile layout">
          <button
            type="button"
            role="tab"
            aria-selected={profileView === 'rebuild'}
            className={`chess-profile-view-tab${profileView === 'rebuild' ? ' is-active' : ''}`}
            onClick={() => openProfileView('new')}
          >
            New profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={profileView === 'legacy'}
            className={`chess-profile-view-tab${profileView === 'legacy' ? ' is-active' : ''}`}
            onClick={() => openProfileView('legacy')}
          >
            Old version
          </button>
        </div>
      </div>

      {profileView === 'rebuild' ? (
      <div className="chess-basic-profile">
        <section className="chess-basic-card">
          <div className="chess-basic-card-header">
            <div className="chess-basic-identity">
              <div className="chess-basic-avatar">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="" />
                ) : (
                  <span>{(studentRecord?.player_name || displayName || '?').slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="chess-basic-identity-text">
                <div className="chess-basic-identity-row">
                  <h1>{studentRecord?.player_name || profile?.name || displayName}</h1>
                  <span className="chess-basic-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="chess-basic-meta chess-basic-meta--username">
                    {profile?.title ? `${profile.title} ` : ''}
                    {chessUsername}
                  </span>
                  {studentRecord?.joining_date ? (
                    <>
                      <span className="chess-basic-meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <span className="chess-basic-meta">
                        Joined {formatBasicDate(studentRecord.joining_date)}
                      </span>
                    </>
                  ) : null}
                  <span className="chess-basic-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="chess-basic-meta chess-basic-meta--batches">
                    {(studentRecord?.batches || []).length ? (
                      <span className="chess-basic-chips chess-basic-chips--inline">
                        {studentRecord.batches.map((batch) => (
                          <button
                            key={batch.id}
                            type="button"
                            className="chess-basic-chip"
                            onClick={() => navigate(`/students/batches/${batch.id}`)}
                          >
                            {batch.name}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="chess-basic-meta-muted">No batch</span>
                    )}
                  </span>
                </div>

                {(profile?.statusLabel ||
                  profile?.joinedDate ||
                  profile?.followers != null ||
                  profile?.lastOnline ||
                  profile?.isOnline ||
                  profile?.league) && (
                  <div className="chess-basic-profile-meta">
                    {profile?.statusLabel ? (
                      <span className="chess-basic-profile-meta-item">{profile.statusLabel}</span>
                    ) : null}
                    {profile?.joinedDate ? (
                      <span className="chess-basic-profile-meta-item">
                        Joined {profile.joinedDate}
                      </span>
                    ) : null}
                    {profile?.followers != null ? (
                      <span className="chess-basic-profile-meta-item">
                        <strong>{formatNumber(profile.followers)}</strong> followers
                      </span>
                    ) : null}
                    {profile?.isOnline ? (
                      <span className="chess-basic-profile-meta-item chess-basic-profile-meta-item--online">
                        Online now
                      </span>
                    ) : profile?.lastOnline ? (
                      <span className="chess-basic-profile-meta-item">
                        Last online {profile.lastOnline}
                      </span>
                    ) : null}
                    {profile?.league ? (
                      <span className="chess-basic-profile-meta-item">
                        <strong>{profile.league}</strong> League
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className="chess-basic-actions">
              <button
                type="button"
                className="chess-basic-btn"
                onClick={syncFromChessCom}
                disabled={syncing}
              >
                <FiRefreshCw className={syncing ? 'chess-icon-spin' : ''} aria-hidden />
                {syncing ? 'Syncing' : 'Sync'}
              </button>
              {profile?.profileUrl ? (
                <a
                  href={profile.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chess-basic-btn chess-basic-btn--primary"
                >
                  Chess.com
                  <FiExternalLink aria-hidden />
                </a>
              ) : null}
            </div>
          </div>

          <div className="chess-basic-sticky-filters">
            <div className="chess-basic-section-title">Live Stats</div>
            <div className="chess-live-range-filters" role="tablist" aria-label="Stats time range">
              {RANGE_FILTERS.map((rf) => {
                const isActive = statsRange === rf.key;
                return (
                  <button
                    key={rf.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`chess-live-range-filter${isActive ? ' is-active' : ''}`}
                    onClick={() => setStatsRange(rf.key)}
                    disabled={rf.key === 'joining' && !effectiveJoiningDate}
                    title={
                      rf.key === 'joining' && !effectiveJoiningDate
                        ? 'No joining date available'
                        : undefined
                    }
                  >
                    {rf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {profileLoading || studentRecordLoading ? (
            <div className="chess-basic-loading">Loading basic details…</div>
          ) : null}

          <div className="chess-basic-section">
            {stats ? (
              <>
                <div className="chess-live-ratings">
                  {RATING_CARDS.map((card) => {
                    const block = stats[card.key];
                    const current = block?.current;
                    const baseline = ratingImprovement?.[card.key]?.baseline ?? null;
                    const delta = formatRatingDelta(current, baseline);
                    const isSelected = activeRatingClass === card.key;
                    const rangeTitle =
                      statsRange === 'joining'
                        ? 'Since joining'
                        : statsRange === '1d'
                          ? 'Yesterday + today'
                          : statsRange === '1w'
                            ? 'Since 1 week ago'
                            : statsRange === '1m'
                              ? 'Since 1 month ago'
                              : 'All time';
                    return (
                      <button
                        key={card.key}
                        type="button"
                        className={`chess-live-rating-card chess-live-rating-card--${card.key}${
                          isSelected ? ' is-selected' : ''
                        }`}
                        onClick={() => setActiveRatingClass(card.key)}
                        aria-pressed={isSelected}
                        title={`Show ${card.label} rating graph · ${rangeTitle}`}
                      >
                        <img
                          src={card.iconUrl}
                          alt=""
                          className="chess-live-rating-icon"
                          aria-hidden="true"
                        />
                        <div className="chess-live-rating-text">
                          <div className="chess-live-rating-head">
                            <span className="chess-live-rating-label">{card.label}</span>
                            {ratingImprovementLoading ? (
                              <span className="chess-live-rating-delta chess-live-rating-delta--loading">
                                …
                              </span>
                            ) : delta ? (
                              <span
                                className={`chess-live-rating-delta chess-live-rating-delta--${delta.tone}`}
                                title={
                                  baseline != null
                                    ? `${rangeTitle}: ${baseline} → ${current ?? '—'}`
                                    : rangeTitle
                                }
                              >
                                {delta.text}
                              </span>
                            ) : (
                              <span className="chess-live-rating-delta chess-live-rating-delta--na">—</span>
                            )}
                          </div>
                          <span className={`chess-live-rating-value${current == null ? ' is-empty' : ''}`}>
                            {current ?? '—'}
                          </span>
                          {block?.best != null ? (
                            <span className="chess-live-rating-best">Best {block.best}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const displayTotals = rangeStats?.totals || { wins: 0, losses: 0, draws: 0 };
                  const displayRecords = rangeStats?.records || {
                    rapid: { wins: 0, losses: 0, draws: 0 },
                    blitz: { wins: 0, losses: 0, draws: 0 },
                    bullet: { wins: 0, losses: 0, draws: 0 },
                  };
                  const displayTotalGames = rangeStats?.totalGames ?? 0;
                  const wins = displayTotals.wins ?? 0;
                  const losses = displayTotals.losses ?? 0;
                  const draws = displayTotals.draws ?? 0;
                  const total = wins + losses + draws;
                  const winPct = total ? Math.round((wins / total) * 100) : 0;
                  const lossPct = total ? Math.round((losses / total) * 100) : 0;
                  const drawPct = total ? Math.max(0, 100 - winPct - lossPct) : 0;

                  return (
                    <>
                <div className="chess-live-results">
                  <div className="chess-live-results-head">
                    <span>Game Results</span>
                    <span className="chess-live-results-total">
                      {rangeStatsLoading
                        ? 'Loading…'
                        : `${formatNumber(displayTotalGames)} games · ${preciseWinRate(displayTotals)}% win`}
                    </span>
                  </div>
                        <div
                          className="chess-live-results-track"
                          role="img"
                          aria-label={`Wins ${wins}, Draws ${draws}, Losses ${losses}`}
                        >
                          {total > 0 ? (
                            <>
                              <span
                                className="chess-live-results-seg chess-live-results-seg--win"
                                style={{ width: `${winPct}%` }}
                                title={`Wins: ${wins} (${winPct}%)`}
                              />
                              <span
                                className="chess-live-results-seg chess-live-results-seg--draw"
                                style={{ width: `${drawPct}%` }}
                                title={`Draws: ${draws} (${drawPct}%)`}
                              />
                              <span
                                className="chess-live-results-seg chess-live-results-seg--loss"
                                style={{ width: `${lossPct}%` }}
                                title={`Losses: ${losses} (${lossPct}%)`}
                              />
                            </>
                          ) : (
                            <span className="chess-live-results-seg chess-live-results-seg--empty" />
                          )}
                        </div>
                        <div className="chess-live-results-legend">
                          <span className="chess-live-legend chess-live-legend--win">
                            <FiCheck aria-hidden /> Wins <strong>{wins}</strong>
                          </span>
                          <span className="chess-live-legend chess-live-legend--draw">
                            <FiMinus aria-hidden /> Draws <strong>{draws}</strong>
                          </span>
                          <span className="chess-live-legend chess-live-legend--loss">
                            <FiX aria-hidden /> Losses <strong>{losses}</strong>
                          </span>
                        </div>
                </div>

                <div className="chess-live-rating-chart">
                  <RatingProgressChart
                    key={`${chessUsername}-${effectiveJoiningDate || 'none'}-${lastSyncedAt || '0'}`}
                    username={chessUsername}
                    activeTimeClass={activeRatingClass}
                    onActiveTimeClassChange={setActiveRatingClass}
                    joiningDate={effectiveJoiningDate}
                    activeRange={statsRange}
                    onActiveRangeChange={setStatsRange}
                    hideTabs
                    theme="light"
                    compact
                  />
                </div>

                <div className="chess-live-tiles">
                  <div className="chess-live-tile">
                    <FiGrid className="chess-live-tile-icon" aria-hidden />
                    <span className="chess-live-tile-label">Total Games</span>
                    <span className="chess-live-tile-value">
                      {rangeStatsLoading ? '…' : formatNumber(displayTotalGames)}
                    </span>
                  </div>
                  <div className="chess-live-tile">
                    <FiTrendingUp className="chess-live-tile-icon" aria-hidden />
                    <span className="chess-live-tile-label">Win Rate</span>
                    <span className="chess-live-tile-value">
                      {rangeStatsLoading ? '…' : `${preciseWinRate(displayTotals)}%`}
                    </span>
                  </div>
                  <div className="chess-live-tile">
                    <FiCheck className="chess-live-tile-icon" aria-hidden />
                    <span className="chess-live-tile-label">Wins</span>
                    <span className="chess-live-tile-value">
                      {rangeStatsLoading ? '…' : formatNumber(wins)}
                    </span>
                  </div>
                  <div className="chess-live-tile">
                    <FiX className="chess-live-tile-icon" aria-hidden />
                    <span className="chess-live-tile-label">Losses</span>
                    <span className="chess-live-tile-value">
                      {rangeStatsLoading ? '…' : formatNumber(losses)}
                    </span>
                  </div>
                </div>

                <div className="chess-live-records">
                  <div className="chess-live-record">
                    <span className="chess-live-record-label">Rapid</span>
                    <span className="chess-live-record-value">
                      {displayRecords.rapid.wins}W / {displayRecords.rapid.losses}L /{' '}
                      {displayRecords.rapid.draws}D
                    </span>
                  </div>
                  <div className="chess-live-record">
                    <span className="chess-live-record-label">Blitz</span>
                    <span className="chess-live-record-value">
                      {displayRecords.blitz.wins}W / {displayRecords.blitz.losses}L /{' '}
                      {displayRecords.blitz.draws}D
                    </span>
                  </div>
                  <div className="chess-live-record">
                    <span className="chess-live-record-label">Bullet</span>
                    <span className="chess-live-record-value">
                      {displayRecords.bullet.wins}W / {displayRecords.bullet.losses}L /{' '}
                      {displayRecords.bullet.draws}D
                    </span>
                  </div>
                </div>
                    </>
                  );
                })()}

                <div className="chess-live-meta">
                  {profile?.lastOnline ? <span>Last online {profile.lastOnline}</span> : null}
                  {lastSyncedAt ? <span>Synced {formatBasicDate(lastSyncedAt)}</span> : null}
                  {stats.puzzleRush != null ? (
                    <span>Puzzle Rush {formatNumber(stats.puzzleRush)}</span>
                  ) : null}
                  {stats.puzzleScore != null ? (
                    <span>Puzzle Score {formatNumber(stats.puzzleScore)}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="chess-basic-loading">
                {pending || backgroundSync
                  ? 'Fetching live stats from Chess.com…'
                  : 'No live stats available yet. Click Sync to fetch from Chess.com.'}
              </div>
            )}
          </div>

          <div className="chess-basic-section chess-basic-section--history">
            <div className="chess-rebuild-tabs" role="tablist" aria-label="Profile content">
              <button
                type="button"
                role="tab"
                aria-selected={rebuildTab === 'history'}
                className={`chess-rebuild-tab${rebuildTab === 'history' ? ' is-active' : ''}`}
                onClick={() => setRebuildTab('history')}
              >
                Game History
                {!rangeGamesLoading && rangeGamesTotal > 0 ? (
                  <span className="chess-rebuild-tab-count">{formatNumber(rangeGamesTotal)}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rebuildTab === 'achievements'}
                className={`chess-rebuild-tab${rebuildTab === 'achievements' ? ' is-active' : ''}`}
                onClick={() => setRebuildTab('achievements')}
              >
                Achievements
              </button>
            </div>

            {rebuildTab === 'history' ? (
              <div className="chess-rebuild-tab-panel">
                <div className="chess-rebuild-history-meta">
                  {rangeGamesLoading
                    ? 'Loading games…'
                    : rangeGamesTotal > 0
                      ? `Showing ${formatNumber(historyFrom)}–${formatNumber(historyTo)} of ${formatNumber(rangeGamesTotal)} games`
                      : 'No games in this range'}
                </div>
                {rangeGamesLoading ? (
                  <div className="chess-basic-loading">Loading game history…</div>
                ) : rangeGames.length > 0 ? (
                  <>
                    <div className="chess-rebuild-history-list">
                      <GameHistoryList
                        games={rangeGames}
                        onSelect={handleGameSelect}
                        profileUsername={chessUsername}
                        portalPreview
                      />
                    </div>
                    {historyTotalPages > 1 ? (
                      <div className="chess-rebuild-pagination">
                        <button
                          type="button"
                          className="chess-rebuild-page-btn"
                          disabled={historyPage <= 1 || rangeGamesLoading}
                          onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className="chess-rebuild-page-info">
                          Page {historyPage} of {historyTotalPages}
                        </span>
                        <button
                          type="button"
                          className="chess-rebuild-page-btn"
                          disabled={historyPage >= historyTotalPages || rangeGamesLoading}
                          onClick={() =>
                            setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                          }
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="chess-basic-loading">
                    No rated games found for this filter. Try another range or sync.
                  </div>
                )}
              </div>
            ) : null}

            {rebuildTab === 'achievements' ? (
              <div className="chess-rebuild-tab-panel">
                <div className="chess-rebuild-history-meta">
                  Earned from games in the selected range · streaks counted from consecutive wins
                </div>
                {achievementsLoading ? (
                  <div className="chess-basic-loading">Loading achievements…</div>
                ) : achievements ? (
                  <div className="chess-achievements-board">
                    <div className="chess-achievements-hero-grid">
                      <div
                        className={`chess-ach-badge chess-ach-badge--streak${
                          (achievements.winStreak?.highest || 0) >= 3 ? ' is-earned' : ''
                        }`}
                      >
                        <div className="chess-ach-badge-icon chess-ach-badge-icon--flame">
                          <FiActivity aria-hidden />
                        </div>
                        <div className="chess-ach-badge-body">
                          <div className="chess-ach-badge-title">Hot Streak</div>
                          <div className="chess-ach-badge-value">
                            {achievements.winStreak?.highest ?? 0}
                            <span>wins in a row</span>
                          </div>
                          <div className="chess-ach-badge-meta">
                            {(achievements.winStreak?.current || 0) > 0
                              ? `On a ${achievements.winStreak.current}-win run right now`
                              : 'No active streak'}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`chess-ach-badge chess-ach-badge--elo${
                          (achievements.eloGain?.best || 0) > 0 ? ' is-earned' : ''
                        }`}
                      >
                        <div className="chess-ach-badge-icon chess-ach-badge-icon--trend">
                          <FiTrendingUp aria-hidden />
                        </div>
                        <div className="chess-ach-badge-body">
                          <div className="chess-ach-badge-title">Rating Climb</div>
                          <div
                            className={`chess-ach-badge-value${
                              (achievements.eloGain?.best || 0) > 0
                                ? ' is-up'
                                : (achievements.eloGain?.best || 0) < 0
                                  ? ' is-down'
                                  : ''
                            }`}
                          >
                            {achievements.eloGain?.best == null
                              ? '—'
                              : achievements.eloGain.best > 0
                                ? `+${achievements.eloGain.best}`
                                : String(achievements.eloGain.best)}
                            <span>best ELO gain</span>
                          </div>
                          <div className="chess-ach-elo-chips">
                            {['bullet', 'blitz', 'rapid', 'daily'].map((key) => {
                              const block = achievements.eloGain?.byTimeClass?.[key];
                              if (block?.delta == null) return null;
                              const tone =
                                block.delta > 0 ? 'up' : block.delta < 0 ? 'down' : 'flat';
                              return (
                                <span
                                  key={key}
                                  className={`chess-ach-elo-chip chess-ach-elo-chip--${tone}`}
                                >
                                  {key.slice(0, 1).toUpperCase() + key.slice(1)}{' '}
                                  {block.delta > 0 ? `+${block.delta}` : block.delta}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`chess-ach-badge chess-ach-badge--brilliant${
                          (achievements.brilliantMoves?.count || 0) > 0 ? ' is-earned' : ''
                        }`}
                      >
                        <div className="chess-ach-badge-icon chess-ach-badge-icon--zap">
                          <FiZap aria-hidden />
                        </div>
                        <div className="chess-ach-badge-body">
                          <div className="chess-ach-badge-title">Brilliant Mind</div>
                          <div className="chess-ach-badge-value">
                            {formatNumber(achievements.brilliantMoves?.count ?? 0)}
                            <span>brilliant moves</span>
                          </div>
                          <div className="chess-ach-badge-meta">
                            {(achievements.brilliantMoves?.count || 0) > 0
                              ? 'Detected in analyzed games'
                              : 'None found in this range yet'}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`chess-ach-badge chess-ach-badge--volume${
                          (achievements.winStreak?.gameCount || 0) >= 10 ? ' is-earned' : ''
                        }`}
                      >
                        <div className="chess-ach-badge-icon chess-ach-badge-icon--grid">
                          <FiGrid aria-hidden />
                        </div>
                        <div className="chess-ach-badge-body">
                          <div className="chess-ach-badge-title">Games Played</div>
                          <div className="chess-ach-badge-value">
                            {formatNumber(achievements.winStreak?.gameCount ?? 0)}
                            <span>
                              {achievements.winStreak?.winRate ?? 0}% win rate
                            </span>
                          </div>
                          <div className="chess-ach-badge-meta">
                            {achievements.winStreak?.wins ?? 0}W ·{' '}
                            {achievements.winStreak?.draws ?? 0}D ·{' '}
                            {achievements.winStreak?.losses ?? 0}L
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="chess-ach-milestones">
                      <div className="chess-ach-milestones-head">
                        <FiAward aria-hidden />
                        <div>
                          <h3>Win Streak Badges</h3>
                          <p>
                            Each badge unlocks when you complete that exact streak length.
                            Streaks are computed from game results (not stored separately).
                          </p>
                        </div>
                      </div>
                      <div className="chess-ach-milestone-grid">
                        {(achievements.winStreak?.milestones || []).map((m) => (
                          <div
                            key={m.length}
                            className={`chess-ach-milestone${m.achieved ? ' is-unlocked' : ' is-locked'}`}
                            title={
                              m.achieved
                                ? `Unlocked · earned ${m.times}×`
                                : `Locked · win ${m.length} games in a row`
                            }
                          >
                            <div className="chess-ach-milestone-ring">
                              {m.achieved ? <FiCheckCircle aria-hidden /> : <FiStar aria-hidden />}
                            </div>
                            <div className="chess-ach-milestone-label">{m.label}</div>
                            <div className="chess-ach-milestone-times">
                              {m.achieved ? `×${m.times}` : 'Locked'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="chess-basic-loading">
                    No achievements data for this range yet.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      ) : null}

      {/* Old version — reference while we migrate sections into New profile one by one */}
      {profileView === 'legacy' ? (
      <>
      <div className="chess-profile-topbar">
        <div className="chess-profile-top-actions">
          <button
            type="button"
            className="chess-btn chess-btn-secondary"
            onClick={syncFromChessCom}
            disabled={syncing}
          >
            <FiRefreshCw className={`chess-icon chess-icon-md${syncing ? ' chess-icon-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync Games'}
          </button>
          {lastSyncedAt && (
            <span className="chess-profile-sync-meta">
              Synced {new Date(lastSyncedAt).toLocaleString()}
            </span>
          )}
          {pending && !profile && (
            <span className="chess-profile-sync-meta chess-profile-sync-meta--live">
              Loading profile from Chess.com…
            </span>
          )}
          {backgroundSync && !syncing && !pending && (
            <span className="chess-profile-sync-meta chess-profile-sync-meta--live">
              Updating games in background…
            </span>
          )}
          {profile?.profileUrl && (
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chess-btn chess-btn-primary"
            >
              View on Chess.com
              <FiExternalLink className="chess-icon chess-icon-md" aria-hidden="true" />
            </a>
          )}
          {profile?.twitchUrl && (
            <a
              href={profile.twitchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chess-btn chess-btn-secondary"
            >
              <FiTwitch className="chess-icon chess-icon-md" aria-hidden="true" />
              Twitch
            </a>
          )}
        </div>
      </div>

      <div className="chess-profile-header-wrap">
        <div className={`chess-profile-header-card${profileLoading && !profile ? ' chess-profile-header-card--loading' : ''}`}>
          <div className="chess-profile-header-main">
            <div className="chess-profile-avatar-wrap">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={displayName}
                  className="chess-profile-avatar"
                />
              ) : (
                <div className="chess-profile-avatar-fallback">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="chess-profile-identity">
              <div className="chess-profile-name-row">
                {profile?.title && <span className="chess-profile-title">{profile.title}</span>}
                <h1 className="chess-profile-username">{displayName}</h1>
              </div>

              {profileLoading && !profile ? (
                <div className="chess-profile-section-skeleton">
                  <div className="chess-profile-skeleton-line chess-profile-skeleton-line--wide" />
                  <div className="chess-profile-skeleton-line chess-profile-skeleton-line--medium" />
                </div>
              ) : (
                <>
              {profile?.name && profile.name !== profile?.username && (
                <div className="chess-profile-display-name">{profile.name}</div>
              )}

              <div className="chess-profile-status-row">
                <span className={`chess-profile-pill ${profile?.isOnline ? 'chess-profile-pill-online' : ''}`}>
                  <span className={`chess-status-dot ${profile?.isOnline ? 'online' : ''}`} />
                  {profile?.isOnline ? 'Online now' : 'Offline'}
                </span>
                {profile?.verified && (
                  <span className="chess-profile-pill">
                    <FiCheckCircle className="chess-icon chess-icon-sm" aria-hidden="true" />
                    Verified
                  </span>
                )}
                {profile?.isStreamer && (
                  <span className="chess-profile-pill">
                    <FiVideo className="chess-icon chess-icon-sm" aria-hidden="true" />
                    Streamer
                  </span>
                )}
                {profile?.statusLabel && (
                  <span className="chess-profile-pill">{profile.statusLabel}</span>
                )}
              </div>

              <div className="chess-profile-meta-grid">
                {profile?.location && (
                  <div className="chess-profile-meta-item">
                    <FiMapPin className="chess-icon chess-icon-sm" aria-hidden="true" />
                    <span className="chess-profile-meta-value">{profile.location}</span>
                  </div>
                )}
                {flagUrl && (
                  <div className="chess-profile-meta-item">
                    <img src={flagUrl} alt={profile.countryCode} className="chess-profile-flag" />
                    <span className="chess-profile-meta-value">{profile.countryCode}</span>
                  </div>
                )}
                {profile?.joinedDate && (
                  <div className="chess-profile-meta-item">
                    <FiCalendar className="chess-icon chess-icon-sm" aria-hidden="true" />
                    <span>
                      Joined <span className="chess-profile-meta-value">{profile.joinedDate}</span>
                    </span>
                  </div>
                )}
                {profile?.followers != null && (
                  <div className="chess-profile-meta-item">
                    <FiUsers className="chess-icon chess-icon-sm" aria-hidden="true" />
                    <span className="chess-profile-meta-value">{formatNumber(profile.followers)}</span>
                    <span>followers</span>
                  </div>
                )}
                {profile?.lastOnline && !profile.isOnline && (
                  <div className="chess-profile-meta-item">
                    <FiClock className="chess-icon chess-icon-sm" aria-hidden="true" />
                    <span>Last online {profile.lastOnline}</span>
                  </div>
                )}
                {profile?.league && (
                  <div className="chess-profile-meta-item">
                    <FiAward className="chess-icon chess-icon-sm" aria-hidden="true" />
                    <span className="chess-profile-meta-value">{profile.league}</span>
                    <span>League</span>
                  </div>
                )}
              </div>

              {stats && (
                <div className="chess-profile-ratings-block">
                  <div className="chess-profile-ratings-row" role="tablist" aria-label="Time control ratings">
                    {RATING_CARDS.map((card) => (
                      <RatingCard
                        key={card.key}
                        label={card.label}
                        iconUrl={card.iconUrl}
                        className={card.className}
                        current={stats[card.key]?.current}
                        best={stats[card.key]?.best}
                        selected={activeRatingClass === card.key}
                        onSelect={() => setActiveRatingClass(card.key)}
                      />
                    ))}
                  </div>
                  <div className="chess-profile-ratings-chart">
                    <RatingProgressChart
                      username={chessUsername}
                      activeTimeClass={activeRatingClass}
                      onActiveTimeClassChange={setActiveRatingClass}
                      hideTabs
                      compact
                    />
                  </div>
                </div>
              )}

                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <nav className="chess-profile-nav" aria-label="Profile sections">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`chess-profile-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="chess-profile-layout">
        <div className="chess-profile-main">
          {error && (
            <Box mb={4}>
              <ErrorPanel title="Database sync issue" message={error} onRetry={refetch} />
            </Box>
          )}

          {activeTab === 'overview' && (
            <div className="chess-profile-panel chess-games-panel">
              <div className="chess-profile-panel-header">
                Game History <span>{formatNumber(totalGames)}</span>
              </div>
              <div className="chess-profile-panel-body chess-games-panel-body">
                {gamesLoading ? (
                  <div className="chess-profile-section-skeleton chess-profile-section-skeleton--games">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="chess-profile-skeleton-line chess-profile-skeleton-line--game" />
                    ))}
                  </div>
                ) : visibleGames.length ? (
                  <>
                    <GameHistoryList games={visibleGames} onSelect={handleGameSelect} profileUsername={chessUsername} />
                    {totalGames > visibleGames.length && (
                      <button type="button" className="chess-see-more" onClick={() => setActiveTab('games')}>
                        See all {formatNumber(totalGames)} games
                      </button>
                    )}
                  </>
                ) : (
                  <div className="chess-profile-empty">
                    {pending || backgroundSync ? 'Games will appear after sync completes.' : 'No recent games found.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div className="chess-profile-panel chess-games-panel">
              <div className="chess-profile-panel-header">
                Game History <span>{formatNumber(totalGames)}</span>
              </div>
              <div className="chess-profile-panel-body">
                {monthlyLoading ? (
                  <div className="chess-profile-empty">Loading all games…</div>
                ) : monthlyGames.length > 0 ? (
                  monthlyGames.map((month) => (
                    <div key={month.month} className="chess-month-block">
                      <div className="chess-month-title">
                        <h4>{month.label}</h4>
                        <span>
                          {month.games.length}
                          {month.gameCount > month.games.length ? ` / ${month.gameCount}` : ''} game
                          {month.games.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {month.games.length ? (
                        <GameHistoryList
                          games={month.games}
                          onSelect={handleGameSelect}
                          profileUsername={chessUsername}
                        />
                      ) : (
                        <div className="chess-profile-empty">No games this month.</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="chess-profile-empty">
                    {pending || backgroundSync
                      ? 'Games will appear after sync completes.'
                      : 'No games found.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="chess-profile-panel">
              <div className="chess-profile-panel-header">Stats Overview</div>
              <div className="chess-profile-panel-body">
                {stats ? (
                  <>
                    <StatTileGrid items={STAT_OVERVIEW_ITEMS} stats={stats} />

                    <div style={{ marginTop: '1rem' }}>
                      <div className="chess-record-row">
                        <span className="chess-record-row-label">Rapid Record</span>
                        <span className="chess-record-row-value">
                          {stats.records.rapid.wins}W / {stats.records.rapid.losses}L /{' '}
                          {stats.records.rapid.draws}D
                        </span>
                      </div>
                      <div className="chess-record-row">
                        <span className="chess-record-row-label">Blitz Record</span>
                        <span className="chess-record-row-value">
                          {stats.records.blitz.wins}W / {stats.records.blitz.losses}L /{' '}
                          {stats.records.blitz.draws}D
                        </span>
                      </div>
                      <div className="chess-record-row">
                        <span className="chess-record-row-label">Bullet Record</span>
                        <span className="chess-record-row-value">
                          {stats.records.bullet.wins}W / {stats.records.bullet.losses}L /{' '}
                          {stats.records.bullet.draws}D
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="chess-profile-empty">No stats available.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'archives' && (
            <div className="chess-profile-panel">
              <div className="chess-profile-panel-header">Monthly Archives</div>
              <div className="chess-profile-panel-body">
                {archives.length ? (
                  <div className="chess-archive-list">
                    {[...archives].reverse().map((archive) => (
                      <Link
                        key={archive.url}
                        href={archive.url}
                        isExternal
                        className="chess-archive-item"
                      >
                        <span>{archive.label}</span>
                        <FiChevronRight className="chess-icon chess-icon-sm" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="chess-profile-empty">
                    {pending || backgroundSync
                      ? 'Archives will appear after sync completes.'
                      : profile && lastSyncedAt && totalGames === 0
                        ? `Chess.com has no game archives for ${profile.username}. Sync completed successfully — this account has no live games on Chess.com yet.`
                        : 'No archives found. Try Sync Games if this player has recent games on Chess.com.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="chess-profile-report">
              <div className="chess-profile-panel">
                <div className="chess-profile-panel-header">Last 3 months — rating</div>
                <div className="chess-profile-panel-body chess-profile-report-body">
                  <RatingProgressChart username={chessUsername} />
                </div>
              </div>

              <div className="chess-profile-panel">
                <div className="chess-profile-panel-header">
                  Streak report — yesterday & all-time
                </div>
                <div className="chess-profile-panel-body chess-profile-report-body">
                  <PlayerWinStreakReport username={chessUsername} />
                </div>
              </div>

              <div className="chess-profile-panel chess-profile-report-chart-panel">
                <div className="chess-profile-panel-body">
                  <YesterdayGamesChart username={chessUsername} />
                </div>
              </div>

              <div className="chess-profile-panel">
                <div className="chess-profile-panel-header">Yesterday’s games</div>
                <div className="chess-profile-panel-body">
                  <YesterdayGamesList username={chessUsername} onSelect={handleGameSelect} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'overview' && stats && (
            <div className="chess-profile-panel chess-quick-stats-panel" style={{ marginTop: '1rem' }}>
              <div className="chess-profile-panel-header chess-quick-stats-header">
                Quick Stats
              </div>
              <div className="chess-profile-panel-body">
                <GameResultsBar stats={stats} />
              </div>
            </div>
          )}
        </div>

        <aside className="chess-profile-sidebar">
          <SidebarWidgets profile={profile} stats={stats} clubs={clubs} totalGames={totalGames} />
        </aside>
      </div>
      </>
      ) : null}
    </Box>
  );
}

export default UserProfilePage;
