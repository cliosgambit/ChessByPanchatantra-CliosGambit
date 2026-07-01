import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import api from '../../services/authService';
import { importCustomPgn } from '../../services/lichessPgnService';
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

export default function CustomGamePage({
  boardId = 'CustomGameBoard',
  inputSource = 'custom_game',
  hideBrilliancePanel = false,
}) {
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
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

  const {
    position,
    selected,
    targets,
    history,
    timeline,
    navIndex,
    setNavIndex,
    orientation,
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

  const handleImportPGN = useCallback(
    async (pgn) => {
      const text = String(pgn || '').trim();
      if (!text) return false;

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
        const data = await importCustomPgn(text);
        const ok = loadPGN(data.clean_pgn, {
          skipSessionCreate: true,
          input_source: inputSource,
          input_filename: data.original_filename || 'Custom PGN',
        });
        if (!ok) throw new Error('Could not parse imported PGN');

        setGameId(data.id);
        setGameInfo(data);

        if (hideBrilliancePanel) {
          setStage0Loading(true);
          const { data: s0 } = await api.post(`/lichess-pgns/games/${data.id}/stage0/run`, { force: true });
          setStage0(s0);
          setStage0Loading(false);

          setStage1Loading(true);
          const { data: s1 } = await api.post(`/lichess-pgns/games/${data.id}/stage1/run`, { force: true });
          setStage1(s1);
          setStage1Loading(false);

          setStage2Loading(true);
          const { data: s2 } = await api.post(`/lichess-pgns/games/${data.id}/stage2/run`, { force: true });
          setStage2(s2);
          setStage2Loading(false);

          setStage3Loading(true);
          const { data: s3 } = await api.post(`/lichess-pgns/games/${data.id}/stage3/run`, { force: true });
          setStage3(s3);
          setStage3Loading(false);

          setStage4Loading(true);
          const { data: s4 } = await api.post(`/lichess-pgns/games/${data.id}/stage4/run`, { force: true });
          setStage4(s4);
          setStage4Loading(false);
        }

        return true;
      } catch (e) {
        setImportError(e.message || String(e));
        return false;
      } finally {
        setImporting(false);
        setStage0Loading(false);
        setStage1Loading(false);
        setStage2Loading(false);
        setStage3Loading(false);
        setStage4Loading(false);
      }
    },
    [loadPGN, inputSource, hideBrilliancePanel]
  );

  useEffect(() => {
    if (!hideBrilliancePanel || stage1Loading || !stage1?.moves?.length) return;
    setStageFilter((prev) => (prev === null ? 'stage1' : prev));
  }, [hideBrilliancePanel, stage1Loading, stage1?.moves?.length]);

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
  const whitePlayer = meta.White;
  const whiteRating = meta.WhiteElo;
  const blackPlayer = meta.Black;
  const blackRating = meta.BlackElo;

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
    if (stageFilter === 'stage1') {
      return tableMoveRows.filter(({ plyIndex }) => stage0ByPly.get(plyIndex)?.proceed_to_stage1);
    }
    if (stageFilter === 'stage4') {
      return tableMoveRows.filter(({ plyIndex }) => stage3ByPly.get(plyIndex)?.proceed_to_stage4);
    }
    return tableMoveRows;
  }, [tableMoveRows, stageFilter, stage0ByPly, stage3ByPly]);

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
    if (!hideBrilliancePanel || navIndex <= 0) return {};
    const uci = history[navIndex - 1]?.uci;
    if (!uci || uci.length < 4) return {};
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    return {
      [from]: { background: 'rgba(228, 228, 33, 0.64)' },
      [to]: { background: 'rgba(155, 199, 0, 0.55)' },
    };
  }, [hideBrilliancePanel, navIndex, history]);

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

      {importing && (
        <div className="tp-status-toast">
          {hideBrilliancePanel && stage4Loading
            ? 'Running Stage 4…'
            : hideBrilliancePanel && stage3Loading
              ? 'Running Stage 3…'
              : hideBrilliancePanel && stage2Loading
              ? 'Running Stage 2…'
              : hideBrilliancePanel && stage1Loading
                ? 'Running Stage 1…'
                : hideBrilliancePanel && stage0Loading
                  ? 'Running Stage 0…'
                  : 'Importing PGN…'}
        </div>
      )}

      <main className="tp-main">
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
              stage2Move={stage2Move}
              stage3Move={stage3Move}
              stage4Move={stage4Move}
              engineEvalLoading={engineEvalLoading}
              boardWidth={boardWidth}
            />
          </div>
        </div>

        {!hideBrilliancePanel && (
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

        {hideBrilliancePanel && (
          <div className="tp-bottom-section">
            <div className="tp-stage-tabs">
              <button
                type="button"
                onClick={() => setStageFilter((v) => (v === 'stage1' ? null : 'stage1'))}
                disabled={
                  stage0Loading || stage1Loading || stage2Loading || stage3Loading || stage4Loading || !stage0?.moves?.length
                }
                className={`tp-stage-tab ${stageFilter === 'stage1' ? 'tp-stage-tab--active tp-stage-tab--stage1' : ''}`}
              >
                Stage 1
              </button>
              <button
                type="button"
                onClick={() => setStageFilter((v) => (v === 'stage4' ? null : 'stage4'))}
                disabled={
                  stage0Loading || stage1Loading || stage2Loading || stage3Loading || stage4Loading || !stage3?.moves?.length
                }
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
                  : 'Import a PGN to enable report download'}
              </span>
              <div className="tp-download-report-actions">
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
                            {stageFilter === 'stage4'
                              ? 'No moves selected for Stage 4.'
                              : 'No moves eligible for Stage 1.'}
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
                                {!isStage1Eligible ? (
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
                                {!isStage2Eligible ? (
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
                                {!isStage3Eligible ? (
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
                                {!isStage4Eligible ? (
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
