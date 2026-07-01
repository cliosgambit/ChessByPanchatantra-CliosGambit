import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiActivity, FiCalendar, FiTrendingUp, FiUser, FiClock } from 'react-icons/fi';
import DashboardSectionCard from '../components/dashboard/DashboardSectionCard';
import { DASHBOARD_SECTIONS } from '../components/dashboard/dashboardPalettes';
import LoadingPanel from '../components/common/LoadingPanel';
import { useAuth } from '../context/AuthContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { fetchPlayers } from '../services/playersService';
import './Dashboard.css';

function formatWelcomeName(user) {
  const raw = user?.full_name || user?.email?.split('@')[0] || 'Admin';
  return raw
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function activityStatus(player) {
  if (player?.sync?.timestamp && player.sync.timestamp !== 'Not synced') return 'completed';
  return 'progress';
}

function activitySegment(player) {
  return 'Chess.com Profile Sync';
}

function activityRating(player) {
  const rating = player?.maxElo || player?.ratings?.rapid || player?.ratings?.blitz;
  return rating ? `${rating} ELO` : '—';
}

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user?.role || 'guest').toLowerCase();
  const { stats, loading: statsLoading } = useDashboardStats();
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const visibleSections = DASHBOARD_SECTIONS.filter((section) =>
    section.roles.includes(role)
  );

  const welcomeName = formatWelcomeName(user);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setPlayersLoading(true);
      try {
        const rows = await fetchPlayers();
        if (!cancelled) setPlayers(rows || []);
      } catch {
        if (!cancelled) setPlayers([]);
      } finally {
        if (!cancelled) setPlayersLoading(false);
      }
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, []);

  const activityRows = useMemo(() => players.slice(0, 5), [players]);

  const activePlayers = players.length || stats?.activeStudents || stats?.totalUsers || 0;
  const avgPlaytime = stats?.totalPuzzles
    ? `${(stats.totalPuzzles * 0.05).toFixed(1)} hrs`
    : '14.5 hrs';

  const initialLoading = statsLoading && !stats && playersLoading;

  if (initialLoading) {
    return (
      <div className="dashboard-page">
        <LoadingPanel message="Loading dashboard…" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <h1 className="dashboard-hero-title">Welcome Back, {welcomeName}!</h1>
          <p className="dashboard-hero-subtitle">
            Monitor your academy matrix, player metrics, and strategy frameworks here.
          </p>
        </div>
        <span className="dashboard-hero-badge">
          <FiCalendar aria-hidden />
          Live Overview
        </span>
      </section>

      <div className="dashboard-feature-grid">
        {visibleSections.map((section, index) => (
          <DashboardSectionCard
            key={section.id}
            label={section.label}
            description={section.description}
            bgColor={section.bgColor}
            iconBg={section.iconBg}
            textColor={section.textColor}
            icon={section.icon}
            index={index}
            onClick={() => navigate(section.path)}
          />
        ))}
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <FiActivity aria-hidden />
            Recent Platform Activity
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dashboard-activity-table">
              <thead>
                <tr>
                  <th>Player Name</th>
                  <th>Module Segment</th>
                  <th>Performance Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.length ? (
                  activityRows.map((player) => {
                    const status = activityStatus(player);
                    return (
                      <tr key={player.id || player.chessId}>
                        <td>{player.name || player.chessId || '—'}</td>
                        <td>{activitySegment(player)}</td>
                        <td>{activityRating(player)}</td>
                        <td>
                          <span
                            className={`dashboard-status-pill dashboard-status-pill--${
                              status === 'completed' ? 'completed' : 'progress'
                            }`}
                          >
                            {status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="dashboard-empty-row">
                      No player activity yet. Add players to see live roster data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <FiTrendingUp aria-hidden />
            Quick Metrics
          </div>
          <div className="dashboard-metrics-stack">
            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <FiUser aria-hidden />
              </div>
              <div>
                <div className="dashboard-metric-value">{activePlayers}</div>
                <div className="dashboard-metric-label">Active Enrolled Players</div>
              </div>
            </div>
            <div className="dashboard-metric-card">
              <div className="dashboard-metric-icon">
                <FiClock aria-hidden />
              </div>
              <div>
                <div className="dashboard-metric-value">{avgPlaytime}</div>
                <div className="dashboard-metric-label">Avg. Lesson Playtime</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
