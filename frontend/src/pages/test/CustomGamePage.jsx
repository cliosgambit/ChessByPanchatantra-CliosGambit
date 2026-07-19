import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  stage0Summary,
  stage1Summary,
  stage2Summary,
  stage3Summary,
  stage4Summary,
} from '../../utils/brillianceStageSummaries';
import { downloadBrillianceExcelReport } from '../../utils/testPageExcelReport';
import { downloadBrillianceFeatureExcelReport } from '../../utils/testPageDetailedExcelReport';
import {
  buildStageMapsFromData,
  filterRowsByStagePass,
} from '../../utils/testPageDownloadFilter';
import DownloadReportFilterModal from '../../components/testPage/DownloadReportFilterModal';
import { useChessGame } from '../../hooks/useChessGame';
import { deleteLichessUpload, importCustomPgn } from '../../services/lichessPgnService';
import api from '../../services/authService';
import LeftSidebar from '../../components/testPage/LeftSidebar';
import RightSidebar from '../../components/testPage/RightSidebar';
import PlayerBadge from '../../components/testPage/PlayerBadge';
import BrillianceStagesPanel from '../../components/gameAnalysis/BrillianceStagesPanel';
import TestMoveStageExplanation from '../../components/testPage/TestMoveStageExplanation';
import { Chessboard } from 'react-chessboard';
import {
  analysisCellClass,
  stage0CellClass,
  stage1CellClass,
  stage2CellClass,
  stage3CellClass,
  stage4CellClass,
} from '../../utils/testPageCellClass';
import '../TestPage.css';

/** Module-level lock so overlapping stage pipelines cannot wipe each other's rows. */
const stageRunLocks = new Map(); // gameId -> Promise

async function withStageRunLock(gameId, fn) {
  const id = String(gameId);
  const prev = stageRunLocks.get(id) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  stageRunLocks.set(
    id,
    chained.finally(() => {
      if (stageRunLocks.get(id) === chained) stageRunLocks.delete(id);
    })
  );
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

export default function CustomGamePage({
  boardId = 'CustomGameBoard',
  inputSource = 'custom_game',
  hideBrilliancePanel = false,
  /**
   * Board + move playback only — do not run brilliance / stage review UI.
   * Used by Pioneer Wins and other non-review entry points.
   */
  viewOnly = false,
  /** 0-based ply to jump to after load (e.g. pioneer piece sacrifice). */
  focusPly = null,
  focusSan = null,
  focusPiece = null,
  focusMoveNumber = null,
  /** Auto-load this PGN on mount (Chess.com review). */
  initialPgn = null,
  /** Hide PGN import UI when reviewing an existing game. */
  hideImport = false,
  /** Chess.com game UUID — used as brilliance game key + sync target. */
  chessComUuid = null,
  profileUsername = null,
  /** Prefer board orientation for the profile player. */
  defaultOrientation = 'white',
  /** Override player badge names/ratings from Chess.com game object. */
  playerOverride = null,
  /**
   * Temporary session: delete the working upload (and stage rows) when the user
   * imports another PGN or leaves the page. Nothing is kept for All Games / DB browse.
   */
  ephemeral = false,
  /** Right rail: Stockfish engine panel (default) or Stage 4 passed-move summary. */
  rightPanelMode = 'engine',
  /** Hide the bottom stage cascade table / report toolbar (New Version). */
  hideStageCascade = false,
  /** New Version: open Old Version detailed cascade view. */
  onDetailedView = null,
  /** Old Version: return to New Version Stage 4 summary. */
  onBackToNewVersion = null,
}) {
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
  const ephemeralUploadIdRef = useRef(null);
  const [stage2, setStage2] = useState(null);
  const [stage3, setStage3] = useState(null);
  const [stage4, setStage4] = useState(null);
  const [engineEvalLoading, setEngineEvalLoading] = useState(false);
  const [stage0, setStage0] = useState(null);
  const [stage0Loading, setStage0Loading] = useState(false);
  const [stage1, setStage1] = useState(null);
  const [stage1Loading, setStage1Loading] = useState(false);
  const [stage2Loading, setStage2Loading] = useState(false);
  const [stage3Loading, setStage3Loading] = useState(false);
  const [stage4Loading, setStage4Loading] = useState(false);
  const [stageFilter, setStageFilter] = useState(null);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [featureReportDownloading, setFeatureReportDownloading] = useState(false);
  const [downloadModalType, setDownloadModalType] = useState(null);

  const handleEngineEvalChange = useCallback(({ stage2: s2, stage3: s3, stage4: s4, loading }) => {
    if (s2 !== undefined) setStage2(s2);
    if (s3 !== undefined) setStage3(s3);
    if (s4 !== undefined) setStage4(s4);
    if (loading !== undefined) setEngineEvalLoading(loading);
  }, []);

  const analysisRunIdRef = useRef(0);

  const syncStagesToAppDb = useCallback(async () => {
    if (!chessComUuid || !profileUsername) return;
    try {
      const { runChessComGameBrilliance } = await import('../../services/chessComDbService');
      await runChessComGameBrilliance(profileUsername, chessComUuid, { syncOnly: true });
    } catch (err) {
      console.warn('[brilliance] app-DB sync failed (non-fatal):', err?.message || err);
    }
  }, [chessComUuid, profileUsername]);

  const runAllStages = useCallback(async (id, { force = true } = {}) => {
    if (!id || !hideBrilliancePanel || viewOnly) {
      console.warn('[brilliance] runAllStages skipped', { id, hideBrilliancePanel, viewOnly });
      return;
    }

    return withStageRunLock(id, async () => {
    const runId = ++analysisRunIdRef.current;
    const active = () => runId === analysisRunIdRef.current;
    const log = (msg, extra) => {
      if (extra !== undefined) console.log(`[brilliance] run#${runId} ${msg}`, extra);
      else console.log(`[brilliance] run#${runId} ${msg}`);
    };
    const stop = (reason, err) => {
      console.error(`[brilliance] run#${runId} STOPPED — ${reason}`, err || '');
    };

    setImportError(null);
    setStageFilter(null);
    log(`start game=${id} force=${force}`);

    // Only reuse cache when it has real stage0 rows (empty "completed" was blanking the table)
    if (!force) {
      try {
        const [{ data: statusGame }, s0, s1, s2, s3, s4] = await Promise.all([
          api.get(`/lichess-pgns/games/${id}`),
          api.get(`/lichess-pgns/games/${id}/stage0`),
          api.get(`/lichess-pgns/games/${id}/stage1`),
          api.get(`/lichess-pgns/games/${id}/stage2`),
          api.get(`/lichess-pgns/games/${id}/stage3`),
          api.get(`/lichess-pgns/games/${id}/stage4`),
        ]);
        if (!active()) {
          stop('superseded during cache read');
          return;
        }
        const cachedMoves = s0?.data?.moves?.length ?? 0;
        const stage4Done =
          statusGame?.stage4_status === 'completed' || s4?.data?.status === 'completed';
        if (stage4Done && cachedMoves > 0) {
          log(`cache hit — ${cachedMoves} stage0 moves`, {
            s1: s1?.data?.moves?.length ?? 0,
            s2: s2?.data?.moves?.length ?? 0,
            s3: s3?.data?.moves?.length ?? 0,
            s4: s4?.data?.moves?.length ?? 0,
          });
          setStage0(s0.data);
          setStage1(s1.data);
          setStage2(s2.data);
          setStage3(s3.data);
          setStage4(s4.data);
          setStage0Loading(false);
          setStage1Loading(false);
          setStage2Loading(false);
          setStage3Loading(false);
          setStage4Loading(false);
          return;
        }
        log('cache miss — running stages 0–4', {
          stage4Done,
          cachedMoves,
          stage4Status: statusGame?.stage4_status ?? s4?.data?.status,
        });
      } catch (err) {
        console.warn(`[brilliance] run#${runId} cache read failed, running stages:`, err?.message || err);
      }
    }

    if (!active()) {
      stop('superseded before stage run');
      return;
    }

    setStage0(null);
    setStage1(null);
    setStage2(null);
    setStage3(null);
    setStage4(null);

    const paint = () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });

    try {
      setStage0Loading(true);
      setStage1Loading(true);
      setStage2Loading(true);
      setStage3Loading(true);
      setStage4Loading(true);
      await paint();
      if (!active()) {
        stop('superseded before stage0');
        return;
      }

      log('stage0 running…');
      const { data: s0 } = await api.post(`/lichess-pgns/games/${id}/stage0/run`, { force: true });
      if (!active()) {
        stop('superseded after stage0');
        return;
      }
      setStage0(s0);
      setStage0Loading(false);
      log(`stage0 done — moves=${s0?.moves?.length ?? 0}`);
      void syncStagesToAppDb();
      await paint();

      log('stage1 running…');
      const { data: s1 } = await api.post(`/lichess-pgns/games/${id}/stage1/run`, { force: true });
      if (!active()) {
        stop('superseded after stage1');
        return;
      }
      setStage1(s1);
      setStage1Loading(false);
      log(`stage1 done — moves=${s1?.moves?.length ?? 0}`);
      void syncStagesToAppDb();
      await paint();

      log('stage2 running…');
      const { data: s2 } = await api.post(`/lichess-pgns/games/${id}/stage2/run`, { force: true });
      if (!active()) {
        stop('superseded after stage2');
        return;
      }
      setStage2(s2);
      setStage2Loading(false);
      log(`stage2 done — moves=${s2?.moves?.length ?? 0}`);
      void syncStagesToAppDb();
      await paint();

      log('stage3 running…');
      const { data: s3 } = await api.post(`/lichess-pgns/games/${id}/stage3/run`, { force: true });
      if (!active()) {
        stop('superseded after stage3');
        return;
      }
      setStage3(s3);
      setStage3Loading(false);
      log(`stage3 done — moves=${s3?.moves?.length ?? 0}`);
      void syncStagesToAppDb();
      await paint();

      log('stage4 running…');
      const { data: s4 } = await api.post(`/lichess-pgns/games/${id}/stage4/run`, { force: true });
      if (!active()) {
        stop('superseded after stage4');
        return;
      }
      setStage4(s4);
      setStage4Loading(false);
      log(`stage4 done — moves=${s4?.moves?.length ?? 0}`);
      void syncStagesToAppDb();
      log('all stages complete');
    } catch (e) {
      stop(e?.message || String(e), e);
      if (active()) setImportError(e.message || String(e));
    } finally {
      // Only the active run may clear loading — a superseded run's finally was
      // wiping the live table mid-analysis (needed Re-run every time).
      if (active()) {
        setStage0Loading(false);
        setStage1Loading(false);
        setStage2Loading(false);
        setStage3Loading(false);
        setStage4Loading(false);
      } else {
        console.warn(`[brilliance] run#${runId} finally skipped (superseded)`);
      }
    }
    });
  }, [hideBrilliancePanel, viewOnly, syncStagesToAppDb]);

  const {
    position,
    selected,
    targets,
    history,
    timeline,
    navIndex,
    setNavIndex,
    orientation,
    setOrientation,
    boardWidth,
    boardContainerRef,
    onSquareClick,
    onPieceDrop,
    loadPGN,
    moveClassifications,
    pgnMetadata,
  } = useChessGame({
    enableAnalysis: false,
    multipv: 3,
    boardLayout: 'minimal',
    maxViewportHeightRatio: 0.8,
  });

  const discardEphemeralUpload = useCallback(async (uploadId) => {
    if (!ephemeral || uploadId == null) return;
    try {
      await deleteLichessUpload(uploadId);
    } catch (err) {
      console.warn('[brilliance] ephemeral cleanup failed:', err?.message || err);
    }
  }, [ephemeral]);

  const handleImportPGN = useCallback(
    async (pgn) => {
      const text = String(pgn || '').trim();
      if (!text) return false;

      // Cancel any in-flight stage run before starting a new import
      analysisRunIdRef.current += 1;
      console.log('[brilliance] import start — cancelled prior runs, gen=', analysisRunIdRef.current);

      const previousUploadId = ephemeralUploadIdRef.current;
      if (ephemeral) ephemeralUploadIdRef.current = null;

      setImportError(null);
      setImporting(true);
      setGameId(null);
      setGameInfo(null);
      setStage2(null);
      setStage3(null);
      setStage4(null);
      setStage0(null);
      setStage0Loading(false);
      setStage1(null);
      setStage1Loading(false);
      setStage2Loading(false);
      setStage3Loading(false);
      setStage4Loading(false);
      setStageFilter(null);

      try {
        // Drop prior temp session before creating a new one (no lasting DB rows).
        if (previousUploadId != null) {
          void discardEphemeralUpload(previousUploadId);
        }

        const data = await importCustomPgn(
          text,
          chessComUuid ? `chesscom_${chessComUuid}.pgn` : 'Custom PGN',
          { lichessGameId: ephemeral ? null : chessComUuid || null }
        );
        const ok = loadPGN(data.clean_pgn, {
          skipSessionCreate: true,
          input_source: inputSource,
          input_filename: data.original_filename || 'Custom PGN',
        });
        if (!ok) throw new Error('Could not parse imported PGN');

        if (defaultOrientation === 'black' || defaultOrientation === 'white') {
          setOrientation((prev) => (prev === defaultOrientation ? prev : defaultOrientation));
        }

        setGameId(data.id);
        setGameInfo(data);
        if (ephemeral && data.upload_id != null) {
          ephemeralUploadIdRef.current = data.upload_id;
        }
        setImporting(false);

        if (hideBrilliancePanel && !viewOnly) {
          // Prefer cache when valid; otherwise run 0→4 live (same as test page)
          await runAllStages(data.id, { force: false });
        } else if (
          viewOnly &&
          focusPly != null &&
          Number.isFinite(Number(focusPly)) &&
          Number(focusPly) >= 0
        ) {
          // loadPGN ends at the final position; jump to the sacrifice ply.
          setNavIndex(Number(focusPly) + 1);
        }

        return true;
      } catch (e) {
        console.error('[brilliance] import STOPPED:', e?.message || e);
        setImportError(e.message || String(e));
        return false;
      } finally {
        setImporting(false);
      }
    },
    [
      discardEphemeralUpload,
      ephemeral,
      loadPGN,
      inputSource,
      hideBrilliancePanel,
      viewOnly,
      focusPly,
      runAllStages,
      chessComUuid,
      defaultOrientation,
      setOrientation,
      setNavIndex,
    ]
  );

  // Ephemeral sessions: cancel analysis + wipe working upload when leaving the page.
  useEffect(() => {
    if (!ephemeral) return undefined;
    return () => {
      analysisRunIdRef.current += 1;
      const uploadId = ephemeralUploadIdRef.current;
      ephemeralUploadIdRef.current = null;
      if (uploadId != null) {
        void deleteLichessUpload(uploadId).catch((err) => {
          console.warn('[brilliance] ephemeral unmount cleanup failed:', err?.message || err);
        });
      }
    };
  }, [ephemeral]);

  // Auto-load PGN when opening a Chess.com game via Review.
  // Claim the key SYNCHRONOUSLY so React Strict Mode's double-effect cannot
  // start two imports (that raced force stage0 and wiped moves to 0).
  const handleImportPGNRef = useRef(handleImportPGN);
  handleImportPGNRef.current = handleImportPGN;
  const autoLoadKeyRef = useRef(null);
  const focusJumpKeyRef = useRef(null);
  useEffect(() => {
    const text = String(initialPgn || '').trim();
    if (!text) return undefined;
    const key = `${chessComUuid || 'custom'}:${text.slice(0, 80)}`;

    // Must claim before any await — otherwise Strict Mode runs this effect twice
    // and both imports force-run stage0 concurrently (moves=0 race).
    if (autoLoadKeyRef.current === key) {
      console.log('[brilliance] autoLoad skip (already claimed)', key.slice(0, 48));
      return undefined;
    }
    autoLoadKeyRef.current = key;
    console.log('[brilliance] autoLoad claimed', key.slice(0, 48));

    (async () => {
      try {
        const ok = await handleImportPGNRef.current(text);
        if (ok === false) {
          autoLoadKeyRef.current = null;
          console.warn('[brilliance] autoLoad failed — claim released for retry');
        }
      } catch (err) {
        autoLoadKeyRef.current = null;
        console.error('[brilliance] autoLoad error — claim released', err?.message || err);
      }
    })();

    return undefined;
  }, [initialPgn, chessComUuid]);

  // After moves are available, jump once to the pioneer sacrifice ply.
  useEffect(() => {
    if (!viewOnly || focusPly == null || !Number.isFinite(Number(focusPly))) return;
    if (!history.length) return;
    const ply = Number(focusPly);
    if (ply < 0 || ply >= history.length) return;
    const key = `${chessComUuid || 'game'}:${ply}:${history.length}`;
    if (focusJumpKeyRef.current === key) return;
    focusJumpKeyRef.current = key;
    setNavIndex(ply + 1);
  }, [viewOnly, focusPly, history.length, chessComUuid, setNavIndex]);

  const stage2Move = useMemo(() => {
    if (!stage2?.moves?.length || navIndex <= 0) return null;
    return stage2.moves.find((m) => m.ply_index === navIndex - 1) || null;
  }, [stage2, navIndex]);

  const stage3Move = useMemo(() => {
    if (!stage3?.moves?.length || navIndex <= 0) return null;
    return stage3.moves.find((m) => m.ply_index === navIndex - 1) || null;
  }, [stage3, navIndex]);

  const stage4Move = useMemo(() => {
    if (!stage4?.moves?.length || navIndex <= 0) return null;
    return stage4.moves.find((m) => m.ply_index === navIndex - 1) || null;
  }, [stage4, navIndex]);

  const meta = pgnMetadata || gameInfo?.pgn_metadata || {};
  const whitePlayer = playerOverride?.white || meta.White;
  const whiteRating = playerOverride?.whiteRating ?? meta.WhiteElo;
  const blackPlayer = playerOverride?.black || meta.Black;
  const blackRating = playerOverride?.blackRating ?? meta.BlackElo;

  const getLatestClock = (color) => {
    for (let i = navIndex - 1; i >= 0; i--) {
      if (history[i]?.color === color && history[i]?.clock) {
        return history[i].clock;
      }
    }
    return null;
  };

  const topPlayer =
    orientation === 'white'
      ? { name: blackPlayer || 'Black', rating: blackRating, color: 'b', clock: getLatestClock('b') }
      : { name: whitePlayer || 'White', rating: whiteRating, color: 'w', clock: getLatestClock('w') };

  const bottomPlayer =
    orientation === 'white'
      ? { name: whitePlayer || 'White', rating: whiteRating, color: 'w', clock: getLatestClock('w') }
      : { name: blackPlayer || 'Black', rating: blackRating, color: 'b', clock: getLatestClock('b') };

  const moveListLabels = useMemo(
    () =>
      history.map((m, i) => {
        const moveNum = Math.floor(i / 2) + 1;
        if (m.color === 'w') return `${moveNum}. ${m.san}`;
        return `${moveNum}... ${m.san}`;
      }),
    [history]
  );

  const stage0ByPly = useMemo(() => {
    const map = new Map();
    for (const m of stage0?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  }, [stage0]);

  const stage1ByPly = useMemo(() => {
    const map = new Map();
    for (const m of stage1?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  }, [stage1]);

  const stage2ByPly = useMemo(() => {
    const map = new Map();
    for (const m of stage2?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  }, [stage2]);

  const stage3ByPly = useMemo(() => {
    const map = new Map();
    for (const m of stage3?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  }, [stage3]);

  const stage4ByPly = useMemo(() => {
    const map = new Map();
    for (const m of stage4?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  }, [stage4]);

  const tableMoveRows = useMemo(
    () => moveListLabels.map((label, plyIndex) => ({ label, plyIndex })),
    [moveListLabels]
  );

  const stageMaps = useMemo(
    () => buildStageMapsFromData(stage0, stage1, stage2, stage3, stage4),
    [stage0, stage1, stage2, stage3, stage4]
  );

  const visibleTableRows = useMemo(() => {
    // While Stage 0/1 are still running, show the full move list (with
    // "Running…" cells) instead of an empty Stage 1-filtered table.
    const stage0Ready = !stage0Loading && Boolean(stage0?.moves?.length);
    const stage3Ready = !stage3Loading && Boolean(stage3?.moves?.length);

    if (stageFilter === 'stage1') {
      if (!stage0Ready) return tableMoveRows;
      return tableMoveRows.filter(({ plyIndex }) => stage0ByPly.get(plyIndex)?.proceed_to_stage1);
    }
    if (stageFilter === 'stage4') {
      if (!stage3Ready) return tableMoveRows;
      return tableMoveRows.filter(({ plyIndex }) => stage3ByPly.get(plyIndex)?.proceed_to_stage4);
    }
    return tableMoveRows;
  }, [tableMoveRows, stageFilter, stage0ByPly, stage3ByPly, stage0Loading, stage3Loading, stage0?.moves?.length, stage3?.moves?.length]);

  const stage1EligibleCount = useMemo(
    () => tableMoveRows.filter(({ plyIndex }) => stage0ByPly.get(plyIndex)?.proceed_to_stage1).length,
    [tableMoveRows, stage0ByPly]
  );

  const stage4EligibleCount = useMemo(
    () => tableMoveRows.filter(({ plyIndex }) => stage3ByPly.get(plyIndex)?.proceed_to_stage4).length,
    [tableMoveRows, stage3ByPly]
  );

  const selectedMoveLabel = navIndex > 0 ? moveListLabels[navIndex - 1] : null;
  const selectedS0Move = navIndex > 0 ? stage0ByPly.get(navIndex - 1) : null;
  const selectedS1Move = navIndex > 0 ? stage1ByPly.get(navIndex - 1) : null;
  const selectedS2Move = navIndex > 0 ? stage2ByPly.get(navIndex - 1) : null;
  const selectedS3Move = navIndex > 0 ? stage3ByPly.get(navIndex - 1) : null;
  const selectedS4Move = navIndex > 0 ? stage4ByPly.get(navIndex - 1) : null;

  const lastMoveHighlight = useMemo(() => {
    // Review + view-only both use hideBrilliancePanel board chrome for last-move squares.
    if (!hideBrilliancePanel || navIndex <= 0) return {};
    const uci = history[navIndex - 1]?.uci;
    if (!uci || uci.length < 4) return {};
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const isFocus =
      focusPly != null && Number.isFinite(Number(focusPly)) && navIndex === Number(focusPly) + 1;
    if (isFocus) {
      return {
        [from]: { background: 'rgba(234, 88, 12, 0.72)' },
        [to]: { background: 'rgba(249, 115, 22, 0.62)' },
      };
    }
    return {
      [from]: { background: 'rgba(228, 228, 33, 0.64)' },
      [to]: { background: 'rgba(155, 199, 0, 0.55)' },
    };
  }, [hideBrilliancePanel, navIndex, history, focusPly]);

  const focusBanner = useMemo(() => {
    if (!viewOnly || focusPly == null || !Number.isFinite(Number(focusPly))) return null;
    const piece = focusPiece || 'Piece';
    const moveLabel =
      focusMoveNumber != null && Number.isFinite(Number(focusMoveNumber))
        ? `move ${focusMoveNumber}`
        : `ply ${Number(focusPly) + 1}`;
    const san = focusSan || history[Number(focusPly)]?.san || '';
    return {
      title: `Piece blunder · ${piece}`,
      detail: san ? `${san} on ${moveLabel}` : moveLabel,
    };
  }, [viewOnly, focusPly, focusPiece, focusMoveNumber, focusSan, history]);

  const stagesRunning =
    stage0Loading || stage1Loading || stage2Loading || stage3Loading || stage4Loading;

  const canDownloadReport =
    moveListLabels.length > 0 && stage0?.moves?.length && !stagesRunning && !importing;

  const handleDownloadReport = useCallback(async (filter) => {
    setReportDownloading(true);
    setImportError(null);
    try {
      const rows = filterRowsByStagePass(tableMoveRows, stageMaps, filter);
      if (!rows.length) {
        throw new Error('No moves match the selected filter.');
      }
      await downloadBrillianceExcelReport({
        rows,
        moveListLabels,
        stage0,
        stage1,
        stage2,
        stage3,
        stage4,
        gameMeta: meta,
        gameInfo,
      });
    } catch (err) {
      setImportError(err.message || 'Failed to generate Excel report.');
    } finally {
      setReportDownloading(false);
      setDownloadModalType(null);
    }
  }, [tableMoveRows, stageMaps, moveListLabels, stage0, stage1, stage2, stage3, stage4, meta, gameInfo]);

  const handleDownloadFeatureReport = useCallback(async (filter) => {
    setFeatureReportDownloading(true);
    setImportError(null);
    try {
      const rows = filterRowsByStagePass(tableMoveRows, stageMaps, filter);
      if (!rows.length) {
        throw new Error('No moves match the selected filter.');
      }
      await downloadBrillianceFeatureExcelReport({
        rows,
        moveListLabels,
        stage0,
        stage1,
        stage2,
        stage3,
        stage4,
        gameMeta: meta,
        gameInfo,
        pgnText: gameInfo?.clean_pgn || '',
      });
    } catch (err) {
      setImportError(err.message || 'Failed to generate feature Excel report.');
    } finally {
      setFeatureReportDownloading(false);
      setDownloadModalType(null);
    }
  }, [tableMoveRows, stageMaps, moveListLabels, stage0, stage1, stage2, stage3, stage4, meta, gameInfo]);

  const handleDownloadConfirm = useCallback((filter) => {
    if (downloadModalType === 'feature') {
      handleDownloadFeatureReport(filter);
    } else {
      handleDownloadReport(filter);
    }
  }, [downloadModalType, handleDownloadFeatureReport, handleDownloadReport]);

  return (
    <div className="test-page">
      <DownloadReportFilterModal
        key={downloadModalType || 'closed'}
        open={Boolean(downloadModalType)}
        reportType={downloadModalType === 'feature' ? 'feature' : 'summary'}
        totalMoves={moveListLabels.length}
        tableMoveRows={tableMoveRows}
        stageMaps={stageMaps}
        onCancel={() => setDownloadModalType(null)}
        onConfirm={handleDownloadConfirm}
      />
      {importError && (
        <div className="tp-error-toast">
          {importError}
        </div>
      )}

      {(importing || stagesRunning) && (
        <div className="tp-status-toast">
          {importing && !stagesRunning
            ? 'Importing PGN…'
            : hideBrilliancePanel && stage0Loading
              ? 'Running Stage 0…'
              : hideBrilliancePanel && stage1Loading
                ? 'Running Stage 1…'
                : hideBrilliancePanel && stage2Loading
                  ? 'Running Stage 2…'
                  : hideBrilliancePanel && stage3Loading
                    ? 'Running Stage 3…'
                    : hideBrilliancePanel && stage4Loading
                      ? 'Running Stage 4…'
                      : importing
                        ? 'Importing PGN…'
                        : 'Running analysis…'}
        </div>
      )}

      <main className="tp-main">
        {focusBanner ? (
          <div className="tp-pioneer-banner" role="status">
            <strong>{focusBanner.title}</strong>
            <span>{focusBanner.detail}</span>
            <button
              type="button"
              className="tp-pioneer-banner-jump"
              onClick={() => setNavIndex(Number(focusPly) + 1)}
            >
              Show sacrifice
            </button>
          </div>
        ) : null}
        <div className="tp-top-row">
          <div className="tp-col-left">
            <LeftSidebar
              history={history}
              navIndex={navIndex}
              setNavIndex={setNavIndex}
              timeline={timeline}
              loadPGN={handleImportPGN}
              moveClassifications={moveClassifications}
              boardWidth={boardWidth}
              importing={importing}
              hideOverview
              hideImport={hideImport || Boolean(initialPgn)}
              highlightPly={
                focusPly != null && Number.isFinite(Number(focusPly)) ? Number(focusPly) : null
              }
            />
          </div>

          <section className="tp-col-center">
            <div className="tp-board-area" ref={boardContainerRef}>
              <div className="tp-board-frame">
                <div className="tp-board-inner" data-board-fit-stack>
                  <PlayerBadge {...topPlayer} />
                  <div className="chessboard-wrapper" style={{ width: boardWidth, height: boardWidth }}>
                    <Chessboard
                      id={boardId}
                      boardWidth={boardWidth}
                      position={position}
                      onPieceDrop={onPieceDrop}
                      onSquareClick={onSquareClick}
                      boardOrientation={orientation}
                      arePiecesDraggable={false}
                      customDarkSquareStyle={{ backgroundColor: '#769656' }}
                      customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                      customSquareStyles={{
                        ...lastMoveHighlight,
                        ...targets.reduce(
                          (acc, sq) => ({ ...acc, [sq]: { background: 'rgba(255, 255, 0, 0.4)' } }),
                          {}
                        ),
                        ...(selected && { [selected]: { background: 'rgba(255, 255, 0, 0.4)' } }),
                      }}
                    />
                  </div>
                  <PlayerBadge {...bottomPlayer} />
                </div>
              </div>
            </div>
          </section>

          <div className="tp-col-right">
            <RightSidebar
              empty
              panelMode={rightPanelMode}
              stage2Move={stage2Move}
              stage3Move={stage3Move}
              stage4Move={stage4Move}
              stage3Moves={stage3?.moves || []}
              stage4Moves={stage4?.moves || []}
              moveListLabels={moveListLabels}
              navIndex={navIndex}
              setNavIndex={setNavIndex}
              engineEvalLoading={engineEvalLoading}
              stage4Loading={stage4Loading}
              boardWidth={boardWidth}
              onDetailedView={onDetailedView}
              onBackToNewVersion={onBackToNewVersion}
            />
          </div>
        </div>

        {!viewOnly && !hideBrilliancePanel && (
        <div className="w-full pt-2 lg:pt-0">
          {gameId ? (
            <BrillianceStagesPanel
              gameId={gameId}
              navIndex={navIndex}
              setNavIndex={setNavIndex}
              onEngineEvalChange={handleEngineEvalChange}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-500 mb-2">
                  Import a PGN using the button in Move History to run brilliance analysis.
                </p>
                <p className="text-xs text-slate-400">
                  Click the <i className="fas fa-file-import mx-1" aria-hidden /> icon in the Move History panel.
                </p>
              </div>
            </div>
          )}
        </div>
        )}

        {!viewOnly && hideBrilliancePanel && !hideStageCascade && (
          <div className="tp-bottom-section">
            <div className="tp-stage-tabs">
              <button
                type="button"
                onClick={() => setStageFilter((v) => (v === 'stage1' ? null : 'stage1'))}
                disabled={stage0Loading || !stage0?.moves?.length}
                className={`tp-stage-tab ${stageFilter === 'stage1' ? 'tp-stage-tab--active tp-stage-tab--stage1' : ''}`}
              >
                Stage 1
              </button>
              <button
                type="button"
                onClick={() => setStageFilter((v) => (v === 'stage4' ? null : 'stage4'))}
                disabled={stage3Loading || !stage3?.moves?.length}
                className={`tp-stage-tab ${stageFilter === 'stage4' ? 'tp-stage-tab--active tp-stage-tab--stage4' : ''}`}
              >
                Stage 4
              </button>
              {stageFilter == null && (
                <span className="tp-stage-tab-hint">All moves</span>
              )}
              {stageFilter === 'stage1' && (
                <span className="tp-stage-tab-hint">
                  {stage1EligibleCount} move{stage1EligibleCount === 1 ? '' : 's'} eligible
                </span>
              )}
              {stageFilter === 'stage4' && (
                <span className="tp-stage-tab-hint">
                  {stage4EligibleCount} move{stage4EligibleCount === 1 ? '' : 's'} selected for Stage 4
                </span>
              )}
            </div>
            <div className="tp-analysis-toolbar">
              <span className="tp-analysis-toolbar-hint">
                {moveListLabels.length
                  ? `${moveListLabels.length} moves · full stage cascade`
                  : initialPgn
                    ? 'Loading game PGN…'
                    : 'Import a PGN to enable report download'}
              </span>
              <div className="tp-download-report-actions">
                <button
                  type="button"
                  className="tp-rerun-stages-btn"
                  onClick={() => runAllStages(gameId)}
                  disabled={!gameId || stagesRunning || importing || !moveListLabels.length}
                  title="Re-run brilliance stages 0–4 on the imported game"
                >
                  <i className="fas fa-redo" aria-hidden />
                  {stagesRunning ? 'Running…' : 'Re-run all stages'}
                </button>
                <button
                  type="button"
                  className="tp-download-report-btn"
                  onClick={() => setDownloadModalType('summary')}
                  disabled={!canDownloadReport || reportDownloading || featureReportDownloading}
                  title="Download stage summary Excel for all moves"
                >
                  <i className="fas fa-file-excel" aria-hidden />
                  {reportDownloading ? 'Generating…' : 'Download summary report'}
                </button>
                <button
                  type="button"
                  className="tp-download-report-btn tp-download-report-btn--feature"
                  onClick={() => setDownloadModalType('feature')}
                  disabled={!canDownloadReport || reportDownloading || featureReportDownloading}
                  title="Download feature-level Got/Need/OK Excel for every check and move"
                >
                  <i className="fas fa-table" aria-hidden />
                  {featureReportDownloading ? 'Generating…' : 'Download feature report'}
                </button>
              </div>
            </div>
            <div className="tp-bottom-panels">
              <div className="tp-analysis-table-wrap">
                <div className="tp-analysis-scroll">
                  <table className="tp-analysis-table">
                    <thead>
                      <tr>
                        <th>Move</th>
                        <th>Stage 0</th>
                        <th>Stage 1</th>
                        <th>Stage 2</th>
                        <th>Stage 3</th>
                        <th>Stage 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moveListLabels.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="tp-analysis-empty">
                            Import a PGN to list moves here.
                          </td>
                        </tr>
                      ) : visibleTableRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="tp-analysis-empty">
                            {stagesRunning || stage0Loading
                              ? 'Running analysis…'
                              : stageFilter === 'stage4'
                                ? 'No moves selected for Stage 4.'
                                : stageFilter === 'stage1'
                                  ? 'No moves eligible for Stage 1.'
                                  : 'No moves to show.'}
                          </td>
                        </tr>
                      ) : (
                        visibleTableRows.map(({ label, plyIndex }) => {
                          const isActive = navIndex === plyIndex + 1;
                          const s0Move = stage0ByPly.get(plyIndex);
                          const s1Move = stage1ByPly.get(plyIndex);
                          const s2Move = stage2ByPly.get(plyIndex);
                          const s3Move = stage3ByPly.get(plyIndex);
                          const s4Move = stage4ByPly.get(plyIndex);
                          const isStage1Eligible = Boolean(s0Move?.proceed_to_stage1);
                          const isStage2Eligible = Boolean(s1Move?.proceed_to_stage2);
                          const isStage3Eligible = Boolean(
                            s1Move?.proceed_to_stage2 && s2Move?.proceed_to_stage3
                          );
                          const isStage4Eligible = Boolean(s3Move?.proceed_to_stage4);
                          const isSac = s0Move?.is_sacrifice_candidate;
                          const rowClass = analysisCellClass(
                            isActive && 'tp-row--active',
                            !isActive && isStage4Eligible && stageFilter === 'stage4' && 'tp-row--stage4',
                            !isActive && isStage1Eligible && stageFilter === 'stage1' && 'tp-row--stage1',
                            !isActive && isSac && 'tp-row--sac'
                          );
                          return (
                            <tr
                              key={plyIndex}
                              className={rowClass}
                              onClick={() => setNavIndex(plyIndex + 1)}
                            >
                              <td className="tp-cell-move">{label}</td>
                              <td>
                                {stage0Loading ? (
                                  <span className="tp-cell-running">Running…</span>
                                ) : (
                                  <span className={analysisCellClass(stage0CellClass(s0Move))}>
                                    {stage0Summary(s0Move)}
                                  </span>
                                )}
                              </td>
                              <td>
                                {stage0Loading || (stage1Loading && !stage0) ? (
                                  <span className="tp-cell-running">…</span>
                                ) : !isStage1Eligible ? (
                                  <span className="tp-cell-muted">—</span>
                                ) : stage1Loading ? (
                                  <span className="tp-cell-running">Running…</span>
                                ) : (
                                  <span className={analysisCellClass(stage1CellClass(s1Move))}>
                                    {stage1Summary(s1Move)}
                                  </span>
                                )}
                              </td>
                              <td>
                                {stage1Loading || (stage2Loading && !stage1) ? (
                                  <span className="tp-cell-running">…</span>
                                ) : !isStage2Eligible ? (
                                  <span className="tp-cell-muted">—</span>
                                ) : stage2Loading ? (
                                  <span className="tp-cell-running">Running…</span>
                                ) : (
                                  <span className={analysisCellClass(stage2CellClass(s2Move))}>
                                    {stage2Summary(s2Move)}
                                  </span>
                                )}
                              </td>
                              <td>
                                {stage2Loading || (stage3Loading && !stage2) ? (
                                  <span className="tp-cell-running">…</span>
                                ) : !isStage3Eligible ? (
                                  <span className="tp-cell-muted">—</span>
                                ) : stage3Loading ? (
                                  <span className="tp-cell-running">Running…</span>
                                ) : (
                                  <span className={analysisCellClass(stage3CellClass(s3Move))}>
                                    {stage3Summary(s3Move)}
                                  </span>
                                )}
                              </td>
                              <td>
                                {stage3Loading || (stage4Loading && !stage3) ? (
                                  <span className="tp-cell-running">…</span>
                                ) : !isStage4Eligible ? (
                                  <span className="tp-cell-muted">—</span>
                                ) : stage4Loading ? (
                                  <span className="tp-cell-running">Running…</span>
                                ) : (
                                  <span className={analysisCellClass(stage4CellClass(s4Move))}>
                                    {stage4Summary(s4Move)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="tp-stage-scores">
                <TestMoveStageExplanation
                  navIndex={navIndex}
                  moveLabel={selectedMoveLabel}
                  s0Move={selectedS0Move}
                  s1Move={selectedS1Move}
                  s2Move={selectedS2Move}
                  s3Move={selectedS3Move}
                  stage0Loading={stage0Loading}
                  stage1Loading={stage1Loading}
                  stage2Loading={stage2Loading}
                  stage3Loading={stage3Loading}
                  stage4Loading={stage4Loading}
                  s4Move={selectedS4Move}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
