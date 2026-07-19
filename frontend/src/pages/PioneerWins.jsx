import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { FiSearch, FiX } from 'react-icons/fi';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import AllGamesPagination from '../components/allGames/AllGamesPagination';
import {
  detectPioneerWinOneFromDb,
  fetchPioneerScanTargetsFromDb,
  fetchPioneerWinsFromDb,
} from '../services/chessComDbService';
import { openChessComGame } from '../utils/chessComGameNavigation';
import { useClientPagination } from '../utils/pagination';
import {
  buildFilterLabels,
  DAY_FILTER_OPTIONS,
  dayFilterButtonLabel,
  filterGamesByDay,
  filterLabelForKey,
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './AllGames.css';
import './PioneerWins.css';

const GAMES_PER_PAGE = 50;
const DAY_FILTERS = DAY_FILTER_OPTIONS;

const EMPTY_LIVE = {
  totalGames: 0,
  winGames: 0,
  scannable: 0,
  checked: 0,
  identified: 0,
  notIdentified: 0,
  currentLabel: '',
  lastLabel: '',
  lastIdentified: null,
  lastDetail: '',
};

function gameOwnerUsername(game) {
  return game?.chessComId || (game?.isWhite ? game?.white : game?.black) || null;
}

function gameMatchesSearch(game, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    game?.white,
    game?.black,
    game?.chessComId,
    game?.timeClass,
    game?.timeControl,
    game?.resultNotation,
    game?.resultType,
    game?.pieceLost,
    game?.pieceLostLabel,
    game?.lossSan,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function isCancelError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.cancelled) return true;
  return /cancel/i.test(String(err.message || ''));
}

function PioneerWins() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = resolveDayFilter(searchParams);
  const filterLabels = useMemo(() => buildFilterLabels(), []);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

  const [allRows, setAllRows] = useState([]);
  const [meta, setMeta] = useState({
    totalGames: 0,
    playersCount: 0,
  });
  const [live, setLive] = useState(EMPTY_LIVE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const loadIdRef = useRef(0);
  const detectIdRef = useRef(0);
  const stopRequestedRef = useRef(false);

  const dayFilteredRows = useMemo(
    () => filterGamesByDay(allRows, activeFilter),
    [allRows, activeFilter]
  );

  const filteredRows = useMemo(
    () => dayFilteredRows.filter((game) => gameMatchesSearch(game, searchQuery)),
    [dayFilteredRows, searchQuery]
  );

  const pagination = useClientPagination(filteredRows, GAMES_PER_PAGE);

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const panelTitle = useMemo(() => {
    const match = DAY_FILTERS.find((filter) => filter.key === activeFilter) || DAY_FILTERS[0];
    return dayFilterButtonLabel(match, filterLabels);
  }, [activeFilter, filterLabels]);

  const progressPct = useMemo(() => {
    if (!live.scannable) return 0;
    return Math.min(100, Math.round((live.checked / live.scannable) * 100));
  }, [live.checked, live.scannable]);

  const setActiveFilter = useCallback(
    (day) => {
      if (!VALID_DAY_FILTER_KEYS.has(day) || day === activeFilterRef.current) return;
      if (detectIdRef.current) {
        stopRequestedRef.current = true;
        setStopping(true);
      }
      setSearchParams(day === 'today' ? {} : { day }, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    pagination.setPage(1);
  }, [activeFilter, searchQuery, pagination.setPage]);

  const applyListPayload = useCallback((data) => {
    setAllRows(data.pioneerWins || []);
    setMeta({
      totalGames: data.totalGames || 0,
      playersCount: data.playersCount || 0,
    });
  }, []);

  const loadCached = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    const day = activeFilterRef.current;
    setInitialLoading(true);
    setError(null);
    try {
      const data = await fetchPioneerWinsFromDb({ day });
      if (loadId !== loadIdRef.current) return;
      applyListPayload(data);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      if (isCancelError(err)) {
        setError(null);
        return;
      }
      setError(err.message || 'Failed to load pioneer wins.');
    } finally {
      if (loadId === loadIdRef.current) setInitialLoading(false);
    }
  }, [applyListPayload]);

  const stopDetect = useCallback(() => {
    // Soft stop: let the current game finish, then exit the loop (no fetch abort → no 499).
    stopRequestedRef.current = true;
    setStopping(true);
    setError(null);
  }, []);

  const runDetect = useCallback(async () => {
    // Ignore clicks while a scan is already running (including while soft-stopping).
    if (detectIdRef.current) return;

    const detectId = ++detectIdRef.current;
    const day = activeFilterRef.current;
    stopRequestedRef.current = false;
    setDetecting(true);
    setStopping(false);
    setError(null);
    setLive(EMPTY_LIVE);

    try {
      const targetsPayload = await fetchPioneerScanTargetsFromDb({ day });
      if (detectId !== detectIdRef.current) return;

      const targets = targetsPayload.targets || [];
      setLive({
        totalGames: targetsPayload.totalGames || 0,
        winGames: targetsPayload.winGames || 0,
        scannable: targets.length,
        checked: 0,
        identified: 0,
        notIdentified: 0,
        currentLabel: targets[0]?.label || '',
        lastLabel: '',
        lastIdentified: null,
        lastDetail: '',
      });
      setMeta({
        totalGames: targetsPayload.totalGames || 0,
        playersCount: targetsPayload.playersCount || 0,
      });

      let identified = 0;
      let notIdentified = 0;

      for (let i = 0; i < targets.length; i += 1) {
        if (stopRequestedRef.current || detectId !== detectIdRef.current) break;

        const target = targets[i];

        setLive((prev) => ({
          ...prev,
          currentLabel: target.label,
        }));

        try {
          // No AbortSignal — stop waits for this game to complete.
          const result = await detectPioneerWinOneFromDb({
            uuid: target.uuid,
            chessComId: target.chessComId,
            maxMoveNumber: 10,
          });

          if (detectId !== detectIdRef.current) return;

          if (result.identified) {
            identified += 1;
            if (result.pioneerWin) {
              setAllRows((prev) => {
                const without = prev.filter((row) => row.uuid !== result.pioneerWin.uuid);
                return [result.pioneerWin, ...without];
              });
            }
          } else {
            notIdentified += 1;
            setAllRows((prev) => prev.filter((row) => row.uuid !== target.uuid));
          }

          const detail = result.identified
            ? `${result.pieceLost || 'Piece'} · ${result.lossSan || 'blunder'}${
                result.winPctDelta != null ? ` · ${Number(result.winPctDelta).toFixed(1)}%` : ''
              }`
            : result.reason === 'no_pgn'
              ? 'No PGN'
              : 'Not a pioneer win';

          setLive((prev) => ({
            ...prev,
            checked: i + 1,
            identified,
            notIdentified,
            lastLabel: target.label,
            lastIdentified: Boolean(result.identified),
            lastDetail: detail,
            currentLabel: targets[i + 1]?.label || '',
          }));
        } catch (err) {
          if (detectId !== detectIdRef.current) return;
          notIdentified += 1;
          setLive((prev) => ({
            ...prev,
            checked: i + 1,
            identified,
            notIdentified,
            lastLabel: target.label,
            lastIdentified: false,
            lastDetail: err.message || 'Check failed',
            currentLabel: targets[i + 1]?.label || '',
          }));
        }

        // Soft-stop takes effect after the game that just finished.
        if (stopRequestedRef.current) break;
      }

      if (detectId !== detectIdRef.current) return;

      try {
        const cached = await fetchPioneerWinsFromDb({ day });
        if (detectId === detectIdRef.current) applyListPayload(cached);
      } catch {
        /* keep in-memory rows */
      }
    } catch (err) {
      if (detectId !== detectIdRef.current) return;
      if (!isCancelError(err)) {
        setError(err.message || 'Failed to detect pioneer wins.');
      }
    } finally {
      if (detectId === detectIdRef.current) {
        detectIdRef.current = 0;
        setDetecting(false);
        setStopping(false);
        stopRequestedRef.current = false;
        setLive((prev) => ({ ...prev, currentLabel: '' }));
      }
    }
  }, [applyListPayload]);

  useEffect(() => {
    loadCached();
  }, [activeFilter, loadCached]);

  const handleSelect = useCallback(
    (game) => {
      const owner = gameOwnerUsername(game);
      if (!owner) return;
      openChessComGame(navigate, owner, game, {
        viewOnly: true,
        focusPly: game.lossPly,
        focusSan: game.lossSan || game.lossUci || null,
        focusPiece: game.pieceLostLabel || game.pieceLost || null,
        focusMoveNumber: game.lossMoveNumber ?? null,
      });
    },
    [navigate]
  );

  const renderSacrificeColumn = useCallback((game) => {
    const piece = game.pieceLostLabel || 'Piece';
    const move = game.lossMoveNumber != null ? `m${game.lossMoveNumber}` : '—';
    const san = game.lossSan || game.lossUci || '';
    const winDrop =
      game.winPctDelta != null && Number.isFinite(Number(game.winPctDelta))
        ? `${Number(game.winPctDelta).toFixed(1)}%`
        : null;
    const cpl =
      game.cpl != null && Number.isFinite(Number(game.cpl)) ? `${Math.round(Number(game.cpl))}cp` : null;
    const best = game.bestMoveSan || null;
    return (
      <span
        className="pioneer-win-badge"
        title={[
          `Blundered ${piece} on move ${game.lossMoveNumber ?? '?'}`,
          san ? `Played ${san}` : null,
          best ? `Best ${best}` : null,
          cpl ? `CPL ${cpl}` : null,
          winDrop ? `Win% Δ ${winDrop}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <strong>{piece}</strong>
        <span>
          {move}
          {san ? ` · ${san}` : ''}
        </span>
        {winDrop || cpl ? (
          <span className="pioneer-win-badge-eval">
            {cpl || ''}
            {cpl && winDrop ? ' · ' : ''}
            {winDrop || ''}
          </span>
        ) : null}
      </span>
    );
  }, []);

  return (
    <Box className="chess-profile-page all-games-page pioneer-wins-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card">
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">Pioneer Wins</h1>
            <div className="all-games-header-actions">
              {detecting ? (
                <button
                  type="button"
                  className="chess-btn chess-btn-secondary"
                  onClick={stopDetect}
                  disabled={stopping}
                  title="Stop after the current game finishes"
                >
                  {stopping ? 'Stopping…' : 'Stop Detecting'}
                </button>
              ) : (
                <button
                  type="button"
                  className="chess-btn chess-btn-primary"
                  onClick={runDetect}
                  disabled={initialLoading}
                  title="Scan wins one game at a time"
                >
                  Detect Pioneer Wins
                </button>
              )}
            </div>
          </div>

          <div className="all-games-control-box">
            <p className="chess-profile-display-name all-games-control-box__status">
              Wins where a player blundered a piece (Q/R/B/N) by move 10 — not a trade, win%
              dropped vs best — and still converted.
              {` • Showing: ${dateLabel} • Stored: ${dayFilteredRows.length}`}
              {meta.totalGames ? ` • Games in filter: ${meta.totalGames}` : ''}
              {meta.playersCount ? ` • Players tracked: ${meta.playersCount}` : ''}
              {' • Click a game to open (no review)'}
            </p>

            <div className="all-games-toolbar">
              <div className="all-games-filters" role="tablist" aria-label="Day filters">
                {DAY_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === filter.key}
                    className={`all-games-filter-btn${
                      activeFilter === filter.key ? ' all-games-filter-btn--active' : ''
                    }`}
                    onClick={() => setActiveFilter(filter.key)}
                  >
                    {dayFilterButtonLabel(filter, filterLabels)}
                  </button>
                ))}
              </div>

              <label className="all-games-search-wrap">
                <FiSearch className="all-games-search-icon" aria-hidden />
                <input
                  type="search"
                  className="all-games-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search player, piece, move…"
                  aria-label="Search pioneer wins"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="all-games-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <FiX aria-hidden />
                  </button>
                ) : null}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="chess-profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <main className="chess-profile-main">
          <section className="chess-profile-panel chess-games-panel">
            <header className="chess-profile-panel-header">
              {panelTitle}
              <span>
                {`${filteredRows.length} pioneer win${filteredRows.length === 1 ? '' : 's'}`}
                {filteredRows.length > GAMES_PER_PAGE
                  ? ` • Page ${pagination.page}/${pagination.totalPages}`
                  : ''}
              </span>
            </header>

            {detecting || live.checked > 0 ? (
              <div className="pioneer-live-panel" role="status" aria-live="polite">
                <div className="pioneer-live-panel__top">
                  <div className="pioneer-live-panel__title">
                    <span className="all-games-live-bar-pulse" aria-hidden="true" />
                    <strong>
                      {stopping
                        ? 'Stopping…'
                        : detecting
                          ? 'Checking games one by one'
                          : 'Last scan'}
                    </strong>
                  </div>
                  {detecting && !stopping ? (
                    <button
                      type="button"
                      className="chess-btn chess-btn-secondary pioneer-stop-inline"
                      onClick={stopDetect}
                    >
                      Stop
                    </button>
                  ) : null}
                </div>

                <div className="pioneer-live-stats" aria-label="Pioneer detection live stats">
                  <div className="pioneer-live-stat">
                    <strong>{live.totalGames}</strong>
                    <span>Total games</span>
                  </div>
                  <div className="pioneer-live-stat">
                    <strong>{live.winGames}</strong>
                    <span>Wins</span>
                  </div>
                  <div className="pioneer-live-stat">
                    <strong>
                      {live.checked}/{live.scannable}
                    </strong>
                    <span>Checked</span>
                  </div>
                  <div className="pioneer-live-stat pioneer-live-stat--yes">
                    <strong>{live.identified}</strong>
                    <span>Identified</span>
                  </div>
                  <div className="pioneer-live-stat pioneer-live-stat--no">
                    <strong>{live.notIdentified}</strong>
                    <span>Not identified</span>
                  </div>
                </div>

                <div className="pioneer-live-progress" aria-hidden="true">
                  <i style={{ width: `${progressPct}%` }} />
                </div>

                <div className="pioneer-live-lines">
                  {detecting && live.currentLabel ? (
                    <p>
                      <span className="pioneer-live-kicker">Checking</span>
                      {live.currentLabel}
                    </p>
                  ) : null}
                  {live.lastLabel ? (
                    <p>
                      <span
                        className={`pioneer-live-kicker${
                          live.lastIdentified
                            ? ' pioneer-live-kicker--yes'
                            : ' pioneer-live-kicker--no'
                        }`}
                      >
                        {live.lastIdentified ? 'Identified' : 'Not identified'}
                      </span>
                      {live.lastLabel}
                      {live.lastDetail ? ` — ${live.lastDetail}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="chess-profile-panel-body chess-games-panel-body">
              {initialLoading && !detecting ? (
                <LoadingPanel message="Loading pioneer wins…" />
              ) : error && !/cancel/i.test(error) ? (
                <ErrorPanel
                  title="Unable to load pioneer wins"
                  message={error}
                  onRetry={detecting ? runDetect : loadCached}
                />
              ) : filteredRows.length === 0 ? (
                <EmptyState
                  title={
                    searchQuery.trim()
                      ? 'No pioneer wins match your search.'
                      : detecting
                        ? 'No pioneer wins found yet…'
                        : 'No pioneer wins stored for this filter.'
                  }
                  subtitle={
                    searchQuery.trim()
                      ? `${dayFilteredRows.length} matches on ${dateLabel}. Try another search.`
                      : detecting
                        ? `Checked ${live.checked} of ${live.scannable} wins so far.`
                        : `Click Detect Pioneer Wins to scan ${dateLabel} one game at a time.`
                  }
                />
              ) : (
                <>
                  <GameHistoryList
                    games={pagination.paginatedItems}
                    onSelect={handleSelect}
                    showHeader
                    dateColumnLabel="Date & Time"
                    extraColumnLabel="Blunder"
                    extraColumn={renderSacrificeColumn}
                    prefetchPgn={false}
                  />
                  <AllGamesPagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    pageSize={GAMES_PER_PAGE}
                    onPageChange={pagination.setPage}
                  />
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </Box>
  );
}

export default PioneerWins;
