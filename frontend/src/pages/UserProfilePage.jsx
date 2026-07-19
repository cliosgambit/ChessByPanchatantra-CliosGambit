import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import {
  FiAward,
  FiCheck,
  FiDownload,
  FiExternalLink,
  FiActivity,
  FiGrid,
  FiMinus,
  FiRefreshCw,
  FiTrendingUp,
  FiX,
  FiZap,
  FiFileText,
  FiCalendar,
} from 'react-icons/fi';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { useChessComUserData } from '../hooks/useChessComUserData';
import { openChessComGame } from '../utils/chessComGameNavigation';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import ReportFromDateModal from '../components/userProfile/ReportFromDateModal';
import WinStreakBadges from '../components/userProfile/WinStreakBadges';
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
import { downloadElementAsPdf } from '../utils/downloadElementPdf';
import '../components/userProfile/ChessComProfilePage.css';

const REPORT_RANGE_KEYS = new Set(['joining', '1m']);

function parseReportRange(value) {
  const key = String(value || '').trim();
  return REPORT_RANGE_KEYS.has(key) ? key : null;
}

function leagueTone(league) {
  const key = String(league || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!key) return 'default';
  if (key.includes('legend')) return 'legend';
  if (key.includes('champion')) return 'champion';
  if (key.includes('elite')) return 'elite';
  if (key.includes('crystal')) return 'crystal';
  if (key.includes('silver')) return 'silver';
  if (key.includes('bronze')) return 'bronze';
  if (key.includes('stone')) return 'stone';
  if (key.includes('wood')) return 'wood';
  return 'default';
}

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

function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const chessUsername = decodeURIComponent(userId || '');
  const backPath = location.state?.from || '/students';
  const fromStudents = backPath === '/students' || String(backPath).startsWith('/students');
  const isReportMode = /\/report\/?$/.test(location.pathname);
  const reportRangeParam = parseReportRange(searchParams.get('range'));
  const { profile, stats, profileLoading, syncing, backgroundSync, pending, syncFromChessCom, lastSyncedAt } =
    useChessComUserData(chessUsername);

  const [activeRatingClass, setActiveRatingClass] = useState('blitz');
  const [studentRecord, setStudentRecord] = useState(null);
  const [studentRecordLoading, setStudentRecordLoading] = useState(true);
  const [ratingImprovement, setRatingImprovement] = useState(null);
  const [ratingImprovementLoading, setRatingImprovementLoading] = useState(false);
  const [statsRange, setStatsRange] = useState(reportRangeParam || 'joining');
  const [rangeStats, setRangeStats] = useState(null);
  const [rangeStatsLoading, setRangeStatsLoading] = useState(false);
  const [rangeGames, setRangeGames] = useState([]);
  const [rangeGamesTotal, setRangeGamesTotal] = useState(0);
  const [rangeGamesLoading, setRangeGamesLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [rebuildTab, setRebuildTab] = useState('history');
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const reportPdfRef = React.useRef(null);
  const ratingPickDoneRef = React.useRef(false);
  const HISTORY_PAGE_SIZE = 25;
  const effectiveJoiningDate =
    toIsoDateOnly(studentRecord?.joining_date) ||
    toIsoDateOnly(profile?.joinedAt) ||
    toIsoDateOnly(profile?.joinedDate);
  const profileBasePath = `/players/${encodeURIComponent(chessUsername)}`;

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
    if (isReportMode && !reportRangeParam) {
      setReportModalOpen(true);
    }
  }, [isReportMode, reportRangeParam]);

  useEffect(() => {
    if (isReportMode) {
      setRebuildTab('achievements');
      setActiveRatingClass((prev) => (prev === 'daily' ? 'blitz' : prev));
    }
  }, [isReportMode]);

  useEffect(() => {
    if (!isReportMode || !reportRangeParam) return;
    if (reportRangeParam === 'joining' && !effectiveJoiningDate) {
      setStatsRange('1m');
      return;
    }
    setStatsRange(reportRangeParam);
  }, [isReportMode, reportRangeParam, effectiveJoiningDate]);

  useEffect(() => {
    if (isReportMode) return;
    if (!effectiveJoiningDate) {
      setStatsRange((prev) => (prev === 'joining' ? '1d' : prev));
    }
  }, [effectiveJoiningDate, isReportMode]);

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
    if (!safeUsername || isReportMode) {
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
  }, [chessUsername, statsRange, effectiveJoiningDate, lastSyncedAt, historyPage, isReportMode]);

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


  const displayName = profile?.username || chessUsername;
  const pageTitle = studentRecord?.player_name || displayName || chessUsername || 'Profile';
  const historyTotalPages = Math.max(1, Math.ceil(rangeGamesTotal / HISTORY_PAGE_SIZE));
  const historyFrom =
    rangeGamesTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyTo = Math.min(historyPage * HISTORY_PAGE_SIZE, rangeGamesTotal);

  const handleOpenReportModal = () => {
    setReportModalOpen(true);
  };

  const handleReportModalCancel = () => {
    setReportModalOpen(false);
    if (isReportMode && !reportRangeParam) {
      navigate(profileBasePath, { state: location.state, replace: true });
    }
  };

  const handleReportModalConfirm = (rangeKey) => {
    const nextRange = parseReportRange(rangeKey) || '1m';
    setReportModalOpen(false);
    navigate(`${profileBasePath}/report?range=${encodeURIComponent(nextRange)}`, {
      state: location.state,
    });
  };

  const handleDownloadReportPdf = async () => {
    if (!reportPdfRef.current || pdfDownloading) return;
    setPdfDownloading(true);
    setPdfError(null);
    try {
      const rangeLabel =
        RANGE_FILTERS.find((rf) => rf.key === statsRange)?.label || statsRange || 'report';
      const baseName = studentRecord?.player_name || chessUsername || 'player';
      await downloadElementAsPdf(reportPdfRef.current, {
        filename: `${baseName}_${rangeLabel}_report`,
      });
    } catch (err) {
      setPdfError(err?.message || 'Failed to generate PDF.');
    } finally {
      setPdfDownloading(false);
    }
  };

  const reportBusy =
    profileLoading ||
    studentRecordLoading ||
    rangeStatsLoading ||
    ratingImprovementLoading ||
    achievementsLoading;

  return (
    <Box className="chess-profile-page chess-profile-page--blank">
      <div className="chess-profile-view-switch" data-pdf-ignore>
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            ...(fromStudents ? [{ label: 'Students', to: '/students' }] : []),
            isReportMode
              ? { label: pageTitle, to: profileBasePath, state: location.state }
              : { label: pageTitle },
            ...(isReportMode ? [{ label: 'Report' }] : []),
          ]}
        />
      </div>

      <div className="chess-basic-profile" ref={isReportMode ? reportPdfRef : undefined}>
        <section className="chess-basic-card">
          <div
            className={`chess-basic-card-header${
              isReportMode ? ' chess-basic-card-header--report' : ''
            }`}
          >
            <div className="chess-basic-identity">
              <div className="chess-basic-avatar">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{(studentRecord?.player_name || displayName || '?').slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="chess-basic-identity-text">
                {isReportMode ? (
                  <>
                    <h1 className="chess-basic-report-name">
                      {studentRecord?.player_name || profile?.name || displayName}
                    </h1>
                    <span className="chess-basic-report-username">
                      {profile?.title ? `${profile.title} ` : ''}
                      {chessUsername}
                    </span>
                    <div className="chess-basic-report-tags">
                      {studentRecord?.joining_date ? (
                        <span className="chess-basic-report-tag">
                          <FiCalendar aria-hidden />
                          Student since {formatBasicDate(studentRecord.joining_date)}
                        </span>
                      ) : null}
                      {(studentRecord?.batches || []).length ? (
                        studentRecord.batches.map((batch) => (
                          <button
                            key={batch.id}
                            type="button"
                            className="chess-basic-report-tag chess-basic-report-tag--batch"
                            onClick={() => navigate(`/students/batches/${batch.id}`)}
                          >
                            {batch.name}
                          </button>
                        ))
                      ) : (
                        <span className="chess-basic-report-tag chess-basic-report-tag--muted">
                          No batch
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
            {isReportMode ? (
              <div className="chess-basic-report-aside">
                <div className="chess-basic-report-facts">
                  {profile?.joinedDate ? (
                    <div className="chess-basic-report-fact">
                      <span className="chess-basic-report-fact-icon" aria-hidden>
                        <FiCalendar />
                      </span>
                      <div className="chess-basic-report-fact-copy">
                        <span className="chess-basic-report-fact-label">Chess.com joined</span>
                        <span className="chess-basic-report-fact-value">{profile.joinedDate}</span>
                      </div>
                    </div>
                  ) : null}
                  {profile?.league ? (
                    <div
                      className={`chess-basic-report-fact chess-basic-report-fact--league chess-basic-report-fact--league-${leagueTone(profile.league)}`}
                    >
                      <span className="chess-basic-report-fact-icon" aria-hidden>
                        <FiAward />
                      </span>
                      <div className="chess-basic-report-fact-copy">
                        <span className="chess-basic-report-fact-label">League</span>
                        <span className="chess-basic-report-fact-value">{profile.league}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="chess-basic-actions chess-basic-actions--report" data-pdf-ignore>
                  <button
                    type="button"
                    className="chess-basic-btn chess-basic-btn--primary"
                    onClick={handleDownloadReportPdf}
                    disabled={pdfDownloading || reportBusy}
                    title={
                      reportBusy
                        ? 'Wait for the report to finish loading'
                        : 'Download this report as PDF'
                    }
                  >
                    <FiDownload
                      className={pdfDownloading ? 'chess-icon-spin' : ''}
                      aria-hidden
                    />
                    {pdfDownloading ? 'Preparing PDF…' : 'Download PDF'}
                  </button>
                  {pdfError ? (
                    <span className="chess-basic-pdf-error" role="alert">
                      {pdfError}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="chess-basic-actions">
                <button
                  type="button"
                  className="chess-basic-btn"
                  onClick={handleOpenReportModal}
                >
                  <FiFileText aria-hidden />
                  Report
                </button>
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
            )}
          </div>

          <div className="chess-basic-sticky-filters">
            <div className="chess-basic-section-title">
              {isReportMode ? 'Report' : 'Live Stats'}
            </div>
            <div className="chess-live-range-filters" role="tablist" aria-label="Stats time range">
              {(isReportMode
                ? RANGE_FILTERS.filter((rf) => REPORT_RANGE_KEYS.has(rf.key))
                : RANGE_FILTERS
              ).map((rf) => {
                const isActive = statsRange === rf.key;
                return (
                  <button
                    key={rf.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`chess-live-range-filter${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      setStatsRange(rf.key);
                      if (isReportMode) {
                        navigate(
                          `${profileBasePath}/report?range=${encodeURIComponent(rf.key)}`,
                          { state: location.state, replace: true }
                        );
                      }
                    }}
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
                <div
                  className={`chess-live-ratings${isReportMode ? ' chess-live-ratings--report' : ''}`}
                >
                  {(isReportMode
                    ? RATING_CARDS.filter((card) => card.key !== 'daily')
                    : RATING_CARDS
                  ).map((card) => {
                    const block = stats[card.key];
                    const current = block?.current;
                    const baseline = ratingImprovement?.[card.key]?.baseline ?? null;
                    const delta = formatRatingDelta(current, baseline);
                    const isSelected = !isReportMode && activeRatingClass === card.key;
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
                        }${isReportMode ? ' chess-live-rating-card--static' : ''}`}
                        onClick={() => {
                          if (!isReportMode) setActiveRatingClass(card.key);
                        }}
                        aria-pressed={isReportMode ? undefined : isSelected}
                        title={
                          isReportMode
                            ? `${card.label} · ${rangeTitle}`
                            : `Show ${card.label} rating graph · ${rangeTitle}`
                        }
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
                          <span className="chess-live-rating-best">
                            {block?.best != null ? `Best ${block.best}` : 'Best —'}
                          </span>
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

                {isReportMode ? (
                  <div className="chess-live-rating-chart-split">
                    <div className="chess-live-rating-chart">
                      <RatingProgressChart
                        key={`${chessUsername}-blitz-${effectiveJoiningDate || 'none'}-${lastSyncedAt || '0'}-${statsRange}`}
                        username={chessUsername}
                        activeTimeClass="blitz"
                        joiningDate={effectiveJoiningDate}
                        activeRange={statsRange}
                        onActiveRangeChange={setStatsRange}
                        hideTabs
                        subtitle="Rated games only"
                        theme="light"
                        compact
                      />
                    </div>
                    <div className="chess-live-rating-chart">
                      <RatingProgressChart
                        key={`${chessUsername}-rapid-${effectiveJoiningDate || 'none'}-${lastSyncedAt || '0'}-${statsRange}`}
                        username={chessUsername}
                        activeTimeClass="rapid"
                        joiningDate={effectiveJoiningDate}
                        activeRange={statsRange}
                        onActiveRangeChange={setStatsRange}
                        hideTabs
                        subtitle="Rated games only"
                        theme="light"
                        compact
                      />
                    </div>
                  </div>
                ) : (
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
                )}

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
              {!isReportMode ? (
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
              ) : null}
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

            {!isReportMode && rebuildTab === 'history' ? (
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
                            {(isReportMode
                              ? ['bullet', 'blitz', 'rapid']
                              : ['bullet', 'blitz', 'rapid', 'daily']
                            ).map((key) => {
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

                    <WinStreakBadges milestones={achievements.winStreak?.milestones || []} />
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

      <ReportFromDateModal
        open={reportModalOpen}
        joiningDate={effectiveJoiningDate}
        onCancel={handleReportModalCancel}
        onConfirm={handleReportModalConfirm}
      />
    </Box>
  );
}

export default UserProfilePage;
