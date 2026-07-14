import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Link } from '@chakra-ui/react';
import {
  FiArrowLeft,
  FiAward,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiExternalLink,
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
import { useChessComUserData } from '../hooks/useChessComUserData';
import { openChessComGame } from '../utils/chessComGameNavigation';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import PlayerWinStreakReport from '../components/userProfile/PlayerWinStreakReport';
import YesterdayGamesChart from '../components/userProfile/YesterdayGamesChart';
import RatingProgressChart from '../components/userProfile/RatingProgressChart';
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

function RatingCard({ label, iconUrl, className, current, best }) {
  const hasRating = current != null;

  return (
    <div className={`chess-rating-card ${className}`}>
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
    </div>
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
  const backLabel = location.state?.fromLabel || 'Back to Students';
  const initialTab = location.state?.tab || 'report';
  const { profile, stats, archives, monthlyGames, recentGames, totalGames, clubs, profileLoading, gamesLoading, syncing, monthlyLoading, backgroundSync, pending, error, refetch, syncFromChessCom, loadMonthlyGames, lastSyncedAt } =
    useChessComUserData(chessUsername);

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (activeTab === 'games' || activeTab === 'report') {
      loadMonthlyGames();
    }
  }, [activeTab, loadMonthlyGames]);

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

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-topbar">
        <button
          type="button"
          className="chess-btn chess-btn-secondary"
          onClick={() => navigate(backPath)}
        >
          <FiArrowLeft className="chess-icon chess-icon-md" aria-hidden="true" />
          {backLabel}
        </button>
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
                <div className="chess-profile-ratings-row">
                  {RATING_CARDS.map((card) => (
                    <RatingCard
                      key={card.key}
                      label={card.label}
                      iconUrl={card.iconUrl}
                      className={card.className}
                      current={stats[card.key]?.current}
                      best={stats[card.key]?.best}
                    />
                  ))}
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

          {(activeTab === 'overview' || activeTab === 'games') && (
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
                    {recentGames.length > visibleGames.length && (
                      <button type="button" className="chess-see-more" onClick={() => setActiveTab('games')}>
                        See more games
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
            <div className="chess-profile-panel" style={{ marginTop: monthlyGames.length ? '1rem' : 0 }}>
              <div className="chess-profile-panel-header">Games by Month</div>
              <div className="chess-profile-panel-body">
                {monthlyLoading ? (
                  <div className="chess-profile-empty">Loading monthly games…</div>
                ) : monthlyGames.length > 0 ? (
                  monthlyGames.map((month) => (
                    <div key={month.month} className="chess-month-block">
                      <div className="chess-month-title">
                        <h4>{month.label}</h4>
                        <span>
                          {month.gameCount} game{month.gameCount === 1 ? '' : 's'}
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
                  <div className="chess-profile-empty">No monthly games loaded yet.</div>
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
                <div className="chess-profile-panel-header">Player Report</div>
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
                <div className="chess-profile-panel-header">Games by month (last 3 months)</div>
                <div className="chess-profile-panel-body">
                  {monthlyLoading ? (
                    <div className="chess-profile-empty">Loading monthly games…</div>
                  ) : monthlyGames.length > 0 ? (
                    monthlyGames.map((month) => (
                      <div key={month.month || month.label} className="chess-month-block">
                        <div className="chess-month-title">
                          <h4>{month.label || month.month}</h4>
                          <span>
                            {month.gameCount ?? month.games?.length ?? 0} game
                            {(month.gameCount ?? month.games?.length ?? 0) === 1 ? '' : 's'}
                          </span>
                        </div>
                        {(month.games || []).length ? (
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
                      No monthly games yet. Click Sync Games to pull from Chess.com.
                    </div>
                  )}
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

    </Box>
  );
}

export default UserProfilePage;
